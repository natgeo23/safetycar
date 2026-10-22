import { type Part } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIAS, GUIA_CATEGORIAS } from "@/lib/categorias";
import { errorGemini, generarJson } from "@/lib/gemini";

export const maxDuration = 60;

const Ficha = z.object({
  nombre: z.string().describe("Nombre comercial corto del repuesto, en español rioplatense. Ej: 'Alternador 90A'"),
  marca: z.string().nullable().describe("Fabricante del repuesto (Bosch, Valeo, original VW...)"),
  codigo: z.string().nullable().describe("Número de parte / código OEM leído en la pieza o etiqueta"),
  codigo_barras: z.string().nullable().describe("EAN/UPC si se ve o si se informó"),
  categoria: z.enum(CATEGORIAS).describe("Categoría del repuesto según la guía"),
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
- Usá nombres de piezas como se dicen en Argentina (ej: "parrilla de suspensión", "burro de arranque", "óptica").
- En el nombre incluí el lado (izquierdo/derecho, delantero/trasero) si se puede saber.

${GUIA_CATEGORIAS}`;

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

  try {
    const ficha = Ficha.safeParse(await generarJson(parts, SYSTEM, FICHA_SCHEMA, "analizar"));
    if (!ficha.success) {
      return NextResponse.json({ error: "La IA no pudo analizar este repuesto. Cargalo a mano." }, { status: 422 });
    }
    return NextResponse.json(ficha.data);
  } catch (e) {
    const { error, status } = errorGemini(e);
    return NextResponse.json({ error }, { status });
  }
}
