import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 60;

let client: Anthropic | null = null;

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

  const content: Anthropic.ContentBlockParam[] = imagenes.map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.media_type, data: img.data },
  }));
  content.push({
    type: "text",
    text: codigo_barras
      ? `Código de barras escaneado: ${codigo_barras}. Completá la ficha del repuesto.`
      : "Completá la ficha del repuesto.",
  });

  try {
    client ??= new Anthropic();
    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM,
      // "low" prioriza velocidad: es una extracción visual, no un problema de razonamiento largo.
      output_config: { effort: "low", format: zodOutputFormat(Ficha) },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return NextResponse.json({ error: "La IA no pudo analizar este repuesto. Cargalo a mano." }, { status: 422 });
    }
    return NextResponse.json(response.parsed_output);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Muchas consultas seguidas, probá en unos segundos" }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      console.error("Anthropic", e.status, e.message);
      return NextResponse.json({ error: "Error de la IA, probá de nuevo" }, { status: 502 });
    }
    throw e;
  }
}
