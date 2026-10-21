import "server-only";
import { GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration, type GenerateContentConfig } from "@google/genai";
import { db } from "@/lib/supabase";
import { promptSistema } from "./taller";

let client: GoogleGenAI | null = null;

// Lo que el agente puede hacer además de hablar. El handler de la ruta implementa los efectos.
export type Acciones = {
  registrarSolicitud: (s: Solicitud) => Promise<void>;
  derivar: (motivo: string) => Promise<void>;
};
export type Solicitud = {
  tipo: "turno" | "retiro" | "presupuesto" | "reserva_repuesto" | "otro";
  nombre?: string;
  vehiculo?: string;
  fecha_preferida?: string;
  detalle: string;
};

const HERRAMIENTAS: FunctionDeclaration[] = [
  {
    name: "buscar_repuestos",
    description: "Busca en el stock del taller. Devuelve hasta 10 repuestos con stock, estado y precio.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Palabras clave: pieza, marca, modelo de auto o código. Ej: 'óptica gol trend'" },
      },
      required: ["consulta"],
    },
  },
  {
    name: "registrar_solicitud",
    description: "Registra un pedido de turno, retiro, presupuesto o reserva para que el taller lo confirme y avisa al equipo.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["turno", "retiro", "presupuesto", "reserva_repuesto", "otro"] },
        nombre: { type: "string" },
        vehiculo: { type: "string", description: "Marca, modelo y año" },
        fecha_preferida: { type: "string", description: "Cuándo le queda bien al cliente, en sus palabras" },
        detalle: { type: "string", description: "Qué necesita, incluyendo repuesto o trabajo" },
      },
      required: ["tipo", "detalle"],
    },
  },
  {
    name: "derivar_a_persona",
    description: "Pasa la conversación a alguien del equipo. El bot deja de responder en este chat por unas horas.",
    parametersJsonSchema: {
      type: "object",
      properties: { motivo: { type: "string" } },
      required: ["motivo"],
    },
  },
];

async function buscarRepuestos(consulta: string) {
  const palabras = consulta
    .toLowerCase()
    .replace(/[%,()]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1)
    .slice(0, 5);
  if (!palabras.length) return [];
  let query = db()
    .from("repuestos")
    .select("nombre, marca, codigo, categoria, compatibilidad, descripcion, estado, cantidad, precio")
    .order("cantidad", { ascending: false })
    .limit(10);
  // Cada palabra tiene que aparecer en alguna columna.
  for (const p of palabras) {
    query = query.or(
      ["nombre", "marca", "codigo", "codigo_barras", "categoria", "compatibilidad", "descripcion"]
        .map((c) => `${c}.ilike.%${p}%`)
        .join(","),
    );
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, cantidad: r.cantidad > 0 ? r.cantidad : "sin stock" }));
}

async function generar(model: string, contents: Content[], config: GenerateContentConfig) {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client.models.generateContent({ model, contents, config: { ...config, abortSignal: AbortSignal.timeout(25_000) } });
}

// Corre el agente sobre la conversación y devuelve el texto a mandar (o null si no hay que contestar).
export async function responder(contents: Content[], acciones: Acciones): Promise<string | null> {
  const principal = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const respaldo = process.env.GEMINI_MODEL_RESPALDO || "gemini-flash-lite-latest";
  const config: GenerateContentConfig = {
    systemInstruction: promptSistema(new Date()),
    tools: [{ functionDeclarations: HERRAMIENTAS }],
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
  };

  const historial = [...contents];
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const r = await generar(principal, historial, config).catch((e) => {
      console.warn(`Gemini ${principal} falló, uso ${respaldo}:`, e.message);
      return generar(respaldo, historial, config);
    });
    const llamadas = r.functionCalls ?? [];
    if (!llamadas.length) return r.text?.trim() || null;

    // Se devuelve el contenido del modelo tal cual (incluye las firmas de pensamiento).
    historial.push(r.candidates![0].content!);
    const respuestas = [];
    for (const f of llamadas) {
      const args = (f.args ?? {}) as Record<string, string>;
      let resultado: Record<string, unknown>;
      try {
        if (f.name === "buscar_repuestos") {
          resultado = { repuestos: await buscarRepuestos(args.consulta ?? "") };
        } else if (f.name === "registrar_solicitud") {
          await acciones.registrarSolicitud(args as unknown as Solicitud);
          resultado = { ok: true, aviso: "Registrado. El equipo lo confirma por este chat." };
        } else if (f.name === "derivar_a_persona") {
          await acciones.derivar(args.motivo ?? "");
          resultado = { ok: true, aviso: "Ya se avisó al equipo. Despedite brevemente: alguien sigue la charla." };
        } else {
          resultado = { error: "herramienta desconocida" };
        }
      } catch (e) {
        console.error(`herramienta ${f.name}:`, e);
        resultado = { error: "No se pudo completar, decile al cliente que lo consultás." };
      }
      console.log(`herramienta ${f.name}`, JSON.stringify(args));
      respuestas.push({ functionResponse: { id: f.id, name: f.name, response: resultado } });
    }
    historial.push({ role: "user", parts: respuestas });
  }
  return null;
}
