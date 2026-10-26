import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { hace, responder, unaVez, type Contexto, type Generado } from "@natgeo23/nucleo-whatsapp";
import { tool } from "ai";
import { z } from "zod";
import { registrarTokens } from "@/lib/ia-uso";
import { db } from "@/lib/supabase";
import { crearCaso } from "./equipo";
import { buscarRepuestos } from "./stock";
import { promptSistema } from "./taller";

// La parte de Stefy que el núcleo no tiene: su personalidad (taller.ts), el stock y el equipo de ventas.

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

export type Solicitud = {
  tipo: "retiro" | "reserva_repuesto" | "otro";
  nombre?: string;
  vehiculo?: string;
  fecha_preferida?: string;
  detalle: string;
};

export async function generar(ctx: Contexto): Promise<Generado> {
  const { jid } = ctx.chat;
  const { data: estado } = await db().from("wa_chats").select("nombre_cliente").eq("jid", jid).maybeSingle();
  let nombre: string | null = estado?.nombre_cliente ?? null;
  const { data: abierta } = await db()
    .from("wa_solicitudes")
    .select("detalle, tomada_por, created_at")
    .eq("jid", jid)
    .eq("tipo", "consulta")
    .eq("estado", "pendiente")
    .gte("created_at", new Date(Date.now() - 12 * 3_600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nota = [
    ctx.nota,
    nombre ? `El cliente se llama ${nombre}.` : "Todavía no sabés cómo se llama el cliente.",
    abierta
      ? `Hace ${hace(Date.now() - new Date(abierta.created_at).getTime())} ya le pasaste a los chicos de ventas esta consulta: "${abierta.detalle}". ${
          abierta.tomada_por ? `La tomó ${abierta.tomada_por}.` : "Todavía no la tomó nadie."
        }`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Los avisos al equipo salen después de contestarle al cliente, para no demorarlo.
  const casos: Parameters<typeof crearCaso>[0][] = [];
  const caso = () => ({ jid, telefono: ctx.chat.telefono, nombre: nombre ?? ctx.chat.nombre });

  const tools = {
    guardar_nombre: tool({
      description: "Guarda cómo se llama el cliente para recordarlo en próximas charlas. Usala apenas te diga su nombre.",
      inputSchema: z.object({ nombre: z.string().describe("Nombre de pila como lo dijo el cliente") }),
      execute: async (a) => {
        nombre = a.nombre.trim().slice(0, 60) || nombre;
        await db().from("wa_chats").update({ nombre_cliente: nombre }).eq("jid", jid);
        return { ok: true };
      },
    }),
    buscar_repuestos: tool({
      description: "Busca en el stock del local. Devuelve hasta 10 repuestos con stock, estado y precio.",
      inputSchema: z.object({
        consulta: z.string().describe("Palabras clave: pieza, marca, modelo de auto o código. Ej: 'óptica gol trend'"),
      }),
      execute: async ({ consulta }) => ({ repuestos: await buscarRepuestos(consulta) }),
    }),
    registrar_solicitud: tool({
      description: "Registra un pedido de retiro, envío o reserva de un repuesto para que los chicos de ventas lo confirmen, y les avisa.",
      inputSchema: z.object({
        tipo: z.enum(["retiro", "reserva_repuesto", "otro"]).describe("otro: envíos y cualquier otro pedido"),
        nombre: z.string().optional(),
        vehiculo: z.string().optional().describe("Marca, modelo y año"),
        fecha_preferida: z.string().optional().describe("Cuándo pasa a retirar, en sus palabras"),
        detalle: z.string().describe("Qué repuesto y qué necesita (para envíos, localidad de destino)"),
      }),
      execute: unaVez(async (s: Solicitud) => {
        casos.push({ ...caso(), ...s, nombre: s.nombre ?? nombre ?? ctx.chat.nombre });
        return { ok: true, aviso: "Registrado. Los chicos de ventas lo confirman por este chat." };
      }),
    }),
    // Derivar no pausa: Stefy sigue atendiendo hasta que alguien de ventas escriba desde el local.
    derivar_a_persona: tool({
      description: "Le pasa la consulta a los chicos de ventas y les avisa. Vos seguís atendiendo el chat hasta que alguno de ellos escriba.",
      inputSchema: z.object({ motivo: z.string() }),
      execute: unaVez(async ({ motivo }: { motivo: string }) => {
        casos.push({ ...caso(), tipo: "consulta", detalle: motivo });
        return { ok: true, aviso: "Ya se avisó a los chicos de ventas. Contale al cliente qué sigue y seguí disponible para lo que necesite." };
      }),
    }),
  };

  const texto = await responder({
    // Modelos propios del bot (GEMINI_MODEL es del analizador de fotos): gemini-flash-latest se cuelga seguido.
    principal: google(process.env.BOT_MODELO || "gemini-3.5-flash"),
    respaldo: google(process.env.BOT_MODELO_RESPALDO || "gemini-3.5-flash-lite"),
    providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
    instructions: `${promptSistema(new Date())}\n\nESTA CONVERSACIÓN\n${nota}`,
    messages: ctx.mensajes,
    tools,
    maxMensajes: 2,
    alTerminar: ({ modelo, usage }) => registrarTokens("whatsapp", modelo, usage.inputTokens ?? 0, usage.outputTokens ?? 0),
  });

  return {
    texto,
    definitiva: casos.length > 0, // ya hay un aviso al equipo en camino: no se rehace
    despues: async () => {
      for (const c of casos) await crearCaso(c).catch((err) => console.error("aviso:", err));
    },
  };
}

// Si la IA sigue sin responder después de unos minutos: algo humano y aviso al equipo.
export async function emergencia(ctx: Contexto) {
  await crearCaso({
    jid: ctx.chat.jid,
    telefono: ctx.chat.telefono,
    nombre: ctx.chat.nombre,
    tipo: "consulta",
    detalle: "El asistente no pudo responder, revisar la conversación",
  }).catch((err) => console.error("aviso:", err));
  return "Ahí te leo, dame un minuto 👍";
}
