import "server-only";
import type { GenerateContentResponse } from "@google/genai";
import { db } from "@/lib/supabase";

// Precios de Gemini (pago) en USD por millón de tokens: ai.google.dev/gemini-api/docs/pricing.
// Flash duplica su precio desde el 1/1/2027. Si Google los cambia, actualizar acá.
function precios(modelo: string, fecha: Date) {
  if (modelo.includes("lite")) return { entrada: 0.3, salida: 2.5 };
  return fecha < new Date("2027-01-01T00:00:00Z") ? { entrada: 0.75, salida: 3.75 } : { entrada: 1.5, salida: 7.5 };
}

// Guarda cuántos tokens usó una respuesta y cuánto costó. Nunca rompe el flujo si falla.
export async function registrarUso(origen: "whatsapp" | "analizar", modelo: string, r: GenerateContentResponse) {
  try {
    const u = r.usageMetadata;
    if (!u) return;
    const nombre = r.modelVersion ?? modelo;
    const entrada = u.promptTokenCount ?? 0;
    const salida = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
    const p = precios(nombre, new Date());
    const costo = (entrada * p.entrada + salida * p.salida) / 1_000_000;
    await db().from("ia_uso").insert({ origen, modelo: nombre, tokens_entrada: entrada, tokens_salida: salida, costo_usd: costo });
  } catch (e) {
    console.warn("ia_uso:", e);
  }
}
