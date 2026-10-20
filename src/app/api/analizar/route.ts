import { ApiError, GoogleGenAI, ThinkingLevel, type GenerateContentConfig, type Part } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 60;

// Cortamos antes del límite de Vercel para poder devolver un error claro.
const TIMEOUT_MS = 45_000;

let client: GoogleGenAI | null = null;

const Ficha = z.object({
  nombre: z.string().describe("Nombre comercial corto del repuesto, en español rioplatense. Ej: 'Alternador 90A'"),
  marca: z.string().nullable().describe("Fabricante del repuesto (Bosch, Valeo, original VW...)"),
  codigo: z.string().nullable().describe("Número de parte / código OEM leído en la pieza o etiqueta"),
  codigo_barras: z.string().nullable().describe("EAN/UPC si se ve o si se informó"),
  categoria: z.string().nullable().describe("Categoría: Motor, Frenos, Suspensión, Eléctrico, Carrocería, Iluminación, Transmisión, Refrigeración, Escape, Interior, Filtros, Otros"),
  compatibilidad: z.string().nullable().describe("Vehículos compatibles (marca, modelo, años, motor) si se puede inferir"),
  descripcion: z.string().describe("Descripción breve para venta online: qué es, características visibles, medidas o especificaciones leídas"),
  estado: z.enum(["nuevo", "usado", "reacondicionado", "para_reparar"]).describe("Estado aparente"),
  confianza: z.enum(["alta", "media", "baja"]),
  dudas: z.string().nullable().describe("Qué no se pudo determinar y conviene verificar a mano"),
});

const SYSTEM = `Sos un experto en autopartes del mercado argentino que ayuda a inventariar repuestos sueltos en un taller.
A partir de fotos (pueden ser cuadros de un video) y/o un código de barras, completá la ficha del repuesto.
- Leé con atención etiquetas, grabados, cajas y números de parte; transcribilos exactos.
- Si un dato no se puede determinar con razonable seguridad, devolvé null en vez de inventar.
- Usá nombres de piezas como se dicen en Argentina (ej: "parrilla de suspensión", "burro de arranque", "óptica").`;

const Imagen = z.object({
  data: z.string(),
  media_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
const FICHA_SCHEMA = z.toJSONSchema(Ficha) as Record<string, unknown>;
delete FICHA_SCHEMA.$schema; // Gemini no necesita el $schema

const Body = z.object({
  imagenes: z.array(Imagen).max(8).default([]),
  codigo_barras: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { imagenes, codigo_barras } = parsed.data;
  if (!imagenes.length && !codigo_barras) {
    return NextResponse.json({ error: "Mandá al menos una foto o un código" }, { status: 400 });
  }

  const parts: Part[] = imagenes.map((img) => ({ inlineData: { mimeType: img.media_type, data: img.data } }));
  parts.push({
    text: codigo_barras
      ? `Código de barras escaneado: ${codigo_barras}. Completá la ficha del repuesto.`
      : "Completá la ficha del repuesto.",
  });

  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  // Si el modelo principal está saturado (503) o sin cupo (429), probamos el de respaldo.
  const modelos = [
    process.env.GEMINI_MODEL || "gemini-flash-latest",
    process.env.GEMINI_MODEL_RESPALDO || "gemini-flash-lite-latest",
  ];
  const inicio = Date.now();
  const config: GenerateContentConfig = {
    systemInstruction: SYSTEM,
    responseMimeType: "application/json",
    responseJsonSchema: FICHA_SCHEMA,
    // Pensamiento bajo: es lectura de etiquetas e identificación, no hace falta razonar largo.
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  };

  async function generar(model: string) {
    try {
      return await client!.models.generateContent({ model, contents: [{ role: "user", parts }], config });
    } catch (e) {
      // Modelos que no aceptan thinkingLevel: reintentar con la config por defecto.
      if (!(e instanceof ApiError && e.status === 400 && /thinking/i.test(e.message))) throw e;
      console.warn(`Gemini ${model} sin thinkingLevel:`, e.message);
      return client!.models.generateContent({
        model, contents: [{ role: "user", parts }], config: { ...config, thinkingConfig: undefined },
      });
    }
  }

  try {
    let response;
    let model = modelos[0];
    try {
      response = await generar(model);
    } catch (e) {
      if (!(e instanceof ApiError && [429, 500, 503].includes(e.status))) throw e;
      console.warn(`Gemini ${model} respondió ${e.status}, pruebo ${modelos[1]}`);
      model = modelos[1];
      response = await generar(model);
    }
    console.log(`Gemini ${model} ${imagenes.length} img en ${Date.now() - inicio} ms`);

    const ficha = Ficha.safeParse(JSON.parse(response.text ?? "null"));
    if (!ficha.success) {
      return NextResponse.json({ error: "La IA no pudo analizar este repuesto. Cargalo a mano." }, { status: 422 });
    }
    return NextResponse.json(ficha.data);
  } catch (e) {
    console.error(`Gemini falló a los ${Date.now() - inicio} ms`, e);
    if (e instanceof ApiError && e.status === 429) {
      return NextResponse.json({ error: "Se alcanzó el límite de consultas de Gemini, probá en un minuto" }, { status: 429 });
    }
    if (e instanceof ApiError && e.status === 503) {
      return NextResponse.json({ error: "Gemini está saturado en este momento, probá de nuevo en unos segundos" }, { status: 503 });
    }
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return NextResponse.json({ error: "La IA tardó demasiado. Probá de nuevo o cargalo a mano." }, { status: 504 });
    }
    return NextResponse.json({ error: "Error de la IA, probá de nuevo" }, { status: 502 });
  }
}
