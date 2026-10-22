import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel, type GenerateContentConfig, type GenerateContentResponse, type Part } from "@google/genai";
import { registrarUso } from "@/lib/ia-uso";

// Cortamos antes del límite de Vercel para poder devolver un error claro.
const TIMEOUT_MS = 45_000;
// Si el modelo principal no contestó en este tiempo, se lanza también el de respaldo.
const HEDGE_MS = 12_000;

let client: GoogleGenAI | null = null;

// Pide JSON a Gemini con un esquema. Pedido "con cobertura": arranca el modelo principal y, si a los
// HEDGE_MS no contestó (o falló), lanza el de respaldo en paralelo. Gana el primero; el otro se cancela.
export async function generarJson(parts: Part[], system: string, schema: Record<string, unknown>, origen: "analizar") {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const principal = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const respaldo = process.env.GEMINI_MODEL_RESPALDO || "gemini-flash-lite-latest";
  const inicio = Date.now();
  const limite = AbortSignal.timeout(TIMEOUT_MS);
  const base: GenerateContentConfig = {
    systemInstruction: system,
    responseMimeType: "application/json",
    responseJsonSchema: schema,
    // Pensamiento bajo: es lectura de etiquetas e identificación, no hace falta razonar largo.
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
  };

  async function generar(model: string, signal: AbortSignal) {
    const pedir = (config: GenerateContentConfig) =>
      client!.models.generateContent({ model, contents: [{ role: "user", parts }], config: { ...config, abortSignal: signal } });
    try {
      return await pedir(base);
    } catch (e) {
      // Modelos que no aceptan thinkingLevel: reintentar con la config por defecto.
      if (!(e instanceof ApiError && e.status === 400 && /thinking/i.test(e.message))) throw e;
      console.warn(`Gemini ${model} sin thinkingLevel:`, e.message);
      return pedir({ ...base, thinkingConfig: undefined });
    }
  }

  const ctrlP = new AbortController();
  const ctrlR = new AbortController();
  let lanzarRespaldo!: () => void;
  const respaldoListo = new Promise<void>((ok) => (lanzarRespaldo = ok));
  const timer = setTimeout(() => lanzarRespaldo(), HEDGE_MS);

  const pPrincipal = generar(principal, AbortSignal.any([limite, ctrlP.signal]))
    .then((r) => ({ r, model: principal }))
    .catch((e) => {
      lanzarRespaldo();
      throw e;
    });
  const pRespaldo = respaldoListo.then(() =>
    generar(respaldo, AbortSignal.any([limite, ctrlR.signal])).then((r) => ({ r, model: respaldo })),
  );

  let ganador: { r: GenerateContentResponse; model: string };
  try {
    ganador = await Promise.any([pPrincipal, pRespaldo]);
  } catch (e) {
    const err = e instanceof AggregateError ? e.errors[0] : e;
    console.error(`Gemini falló a los ${Date.now() - inicio} ms`, err);
    throw err;
  } finally {
    clearTimeout(timer);
  }
  (ganador.model === principal ? ctrlR : ctrlP).abort();
  console.log(`Gemini ${ganador.model} (${origen}) en ${Date.now() - inicio} ms`);
  await registrarUso(origen, ganador.model, ganador.r);
  return JSON.parse(ganador.r.text ?? "null") as unknown;
}

// Traduce errores de Gemini a un mensaje para el usuario.
export function errorGemini(e: unknown): { error: string; status: number } {
  if (e instanceof ApiError && e.status === 429) return { error: "Se alcanzó el límite de consultas de Gemini, probá en un minuto", status: 429 };
  if (e instanceof ApiError && e.status === 503) return { error: "Gemini está saturado en este momento, probá de nuevo en unos segundos", status: 503 };
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return { error: "La IA tardó demasiado. Probá de nuevo o cargalo a mano.", status: 504 };
  }
  return { error: "Error de la IA, probá de nuevo", status: 502 };
}
