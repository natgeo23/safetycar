import "server-only";
import { FunctionCallingConfigMode, GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration, type GenerateContentConfig } from "@google/genai";
import { registrarUso } from "@/lib/ia-uso";
import { db } from "@/lib/supabase";
import { promptSistema } from "./taller";

let client: GoogleGenAI | null = null;

// Pasos de herramientas por respuesta, contando la respuesta final.
const VUELTAS = 6;

// Lo que el agente puede hacer además de hablar. El handler de la ruta implementa los efectos.
export type Acciones = {
  guardarNombre: (nombre: string) => Promise<void>;
  registrarSolicitud: (s: Solicitud) => Promise<void>;
  derivar: (motivo: string) => Promise<void>;
};
export type Solicitud = {
  tipo: "retiro" | "reserva_repuesto" | "otro";
  nombre?: string;
  vehiculo?: string;
  fecha_preferida?: string;
  detalle: string;
};

const HERRAMIENTAS: FunctionDeclaration[] = [
  {
    name: "guardar_nombre",
    description: "Guarda cómo se llama el cliente para recordarlo en próximas charlas. Usala apenas te diga su nombre.",
    parametersJsonSchema: {
      type: "object",
      properties: { nombre: { type: "string", description: "Nombre de pila como lo dijo el cliente" } },
      required: ["nombre"],
    },
  },
  {
    name: "buscar_repuestos",
    description: "Busca en el stock del local. Devuelve hasta 10 repuestos con stock, estado y precio.",
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
    description: "Registra un pedido de retiro, envío o reserva de un repuesto para que los chicos de ventas lo confirmen, y les avisa.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["retiro", "reserva_repuesto", "otro"], description: "otro: envíos y cualquier otro pedido" },
        nombre: { type: "string" },
        vehiculo: { type: "string", description: "Marca, modelo y año" },
        fecha_preferida: { type: "string", description: "Cuándo pasa a retirar, en sus palabras" },
        detalle: { type: "string", description: "Qué repuesto y qué necesita (para envíos, localidad de destino)" },
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

// Gemini Flash seguido devuelve 503 "high demand" y a veces el respaldo se cuelga: se corre una
// carrera entre los dos y, si ambos fallan, se reintenta una vez antes de rendirse.
const LANZAR_RESPALDO_MS = 5_000;
const TIMEOUT_MS = 18_000;
const INTENTOS = 2;

async function conCobertura(principal: string, respaldo: string, contents: Content[], config: GenerateContentConfig) {
  let ultimo: unknown;
  for (let intento = 1; intento <= INTENTOS; intento++) {
    try {
      return await carrera(principal, respaldo, contents, config);
    } catch (e) {
      ultimo = e;
      console.warn(`Gemini intento ${intento}/${INTENTOS} falló:`, e instanceof Error ? e.message.slice(0, 200) : e);
      if (intento < INTENTOS) await new Promise((ok) => setTimeout(ok, 1_500));
    }
  }
  throw ultimo;
}

// Arranca el principal; el respaldo sale si el principal falla o tarda más de LANZAR_RESPALDO_MS.
// Gana el primero que conteste y el otro se cancela.
async function carrera(principal: string, respaldo: string, contents: Content[], config: GenerateContentConfig) {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const pedir = (model: string, signal: AbortSignal) =>
    client!.models.generateContent({ model, contents, config: { ...config, abortSignal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) } });

  const ctrlP = new AbortController();
  const ctrlR = new AbortController();
  let lanzar!: () => void;
  const listo = new Promise<void>((ok) => (lanzar = ok));
  const timer = setTimeout(lanzar, LANZAR_RESPALDO_MS);

  const pP = pedir(principal, ctrlP.signal).then((r) => ({ r, model: principal }));
  pP.catch(() => lanzar());
  const pR = listo.then(() => pedir(respaldo, ctrlR.signal).then((r) => ({ r, model: respaldo })));
  try {
    const ganador = await Promise.any([pP, pR]);
    (ganador.model === principal ? ctrlR : ctrlP).abort();
    if (ganador.model !== principal) console.log(`Gemini contestó con ${respaldo}`);
    await registrarUso("whatsapp", ganador.model, ganador.r);
    return ganador.r;
  } catch (e) {
    throw e instanceof AggregateError ? e.errors.at(-1) : e;
  } finally {
    clearTimeout(timer);
  }
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
    const r = await conCobertura(principal, respaldo, historial, cfg);
    const llamadas = r.functionCalls ?? [];
    if (!llamadas.length) return r.text?.trim() || null;

    // Se devuelve el contenido del modelo tal cual (incluye las firmas de pensamiento).
    historial.push(r.candidates![0].content!);
    const respuestas = [];
    for (const f of llamadas) {
      const args = (f.args ?? {}) as Record<string, string>;
      let resultado: Record<string, unknown>;
      try {
        if (f.name === "guardar_nombre") {
          await acciones.guardarNombre(args.nombre ?? "");
          resultado = { ok: true };
        } else if (f.name === "buscar_repuestos") {
          resultado = { repuestos: await buscarRepuestos(args.consulta ?? "") };
        } else if (f.name === "registrar_solicitud") {
          await acciones.registrarSolicitud(args as unknown as Solicitud);
          resultado = { ok: true, aviso: "Registrado. Los chicos de ventas lo confirman por este chat." };
        } else if (f.name === "derivar_a_persona") {
          await acciones.derivar(args.motivo ?? "");
          resultado = { ok: true, aviso: "Ya se avisó a los chicos de ventas, que siguen la charla. Contale al cliente qué sigue." };
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
