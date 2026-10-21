import "server-only";
import { FunctionCallingConfigMode, GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration, type GenerateContentConfig } from "@google/genai";
import { db } from "@/lib/supabase";
import { promptSistema } from "./taller";

let client: GoogleGenAI | null = null;

// Pasos de herramientas por respuesta, contando la respuesta final.
const VUELTAS = 6;

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
  // Cada palabra de la consulta es un "concepto" que puede aparecer con cualquiera de sus variantes.
  const conceptos = consulta
    .toLowerCase()
    .replace(/[%,()*_.]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1 && !VACIAS.has(p))
    .slice(0, 6)
    .map(variantes);
  if (!conceptos.length) return [];

  // Trae todo lo que coincida con alguna variante y después ordena por cuántos conceptos cubre:
  // "burro arranque amarok" encuentra el motor de arranque aunque no diga Amarok.
  const terminos = [...new Set(conceptos.flat())];
  const { data, error } = await db()
    .from("repuestos")
    .select("nombre, marca, codigo, codigo_barras, categoria, compatibilidad, descripcion, estado, cantidad, precio")
    .or(terminos.flatMap((t) => COLUMNAS.map((c) => `${c}.ilike.%${t}%`)).join(","))
    .limit(80);
  if (error) throw new Error(error.message);

  const puntuados = (data ?? []).map((r) => {
    const texto = sinAcentos(COLUMNAS.map((c) => (r as Record<string, unknown>)[c] ?? "").join(" ").toLowerCase());
    return { r, puntos: conceptos.filter((vs) => vs.some((v) => texto.includes(sinAcentos(v)))).length };
  });
  puntuados.sort((a, b) => b.puntos - a.puntos || b.r.cantidad - a.r.cantidad);
  return puntuados.slice(0, 10).map(({ r, puntos }) => ({
    nombre: r.nombre,
    marca: r.marca,
    codigo: r.codigo,
    categoria: r.categoria,
    compatibilidad: r.compatibilidad,
    descripcion: r.descripcion,
    estado: r.estado,
    precio: r.precio,
    cantidad: r.cantidad > 0 ? r.cantidad : "sin stock",
    // Parcial: coincide con parte de la consulta (ej. es un burro pero no figura para ese auto).
    coincidencia: puntos === conceptos.length ? "completa" : "parcial",
  }));
}

const COLUMNAS = ["nombre", "marca", "codigo", "codigo_barras", "categoria", "compatibilidad", "descripcion"];
const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "para", "con", "un", "una", "y", "o", "en", "por", "que"]);
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// Cómo se dice lo mismo en el mostrador y cómo puede estar cargado en el stock.
const SINONIMOS = [
  ["burro", "arranque"],
  ["optica", "faro"],
  ["parrilla", "bandeja", "brazo"],
  ["paragolpe", "paragolpes"],
  ["amortiguador", "amortiguadores"],
  ["volkswagen", "volswagen", "wolkswagen", "vw"],
  ["chevrolet", "chevy"],
  ["mercedes", "benz"],
];

function variantes(palabra: string) {
  const p = sinAcentos(palabra);
  const grupo = SINONIMOS.find((g) => g.includes(p));
  // Las de 2 letras (ej. "vw") solo valen como sinónimo, no como búsqueda suelta.
  return [...new Set([palabra, p, ...(grupo ?? [])])].filter((v) => v.length > 2 || grupo?.includes(v));
}

async function generar(model: string, contents: Content[], config: GenerateContentConfig) {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client.models.generateContent({ model, contents, config: { ...config, abortSignal: AbortSignal.timeout(25_000) } });
}

// Corre el agente sobre la conversación y devuelve el texto a mandar (o null si no hay que contestar).
export async function responder(contents: Content[], nota: string, acciones: Acciones): Promise<string | null> {
  const principal = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const respaldo = process.env.GEMINI_MODEL_RESPALDO || "gemini-flash-lite-latest";
  const config: GenerateContentConfig = {
    systemInstruction: `${promptSistema(new Date())}\n\nESTA CONVERSACIÓN\n${nota}`,
    tools: [{ functionDeclarations: HERRAMIENTAS }],
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
  };

  const historial = [...contents];
  for (let vuelta = 0; vuelta < VUELTAS; vuelta++) {
    // En la última vuelta no hay más herramientas: tiene que contestarle al cliente sí o sí.
    const cfg: GenerateContentConfig =
      vuelta === VUELTAS - 1 ? { ...config, toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.NONE } } } : config;
    const r = await generar(principal, historial, cfg).catch((e) => {
      console.warn(`Gemini ${principal} falló, uso ${respaldo}:`, e.message);
      return generar(respaldo, historial, cfg);
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
