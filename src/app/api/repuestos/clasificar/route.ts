import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIAS, GUIA_CATEGORIAS, normalizarCategoria, type Categoria } from "@/lib/categorias";
import { errorGemini, generarJson } from "@/lib/gemini";
import { db } from "@/lib/supabase";

export const maxDuration = 60;

const Respuesta = z.object({
  items: z.array(z.object({ id: z.string(), categoria: z.enum(CATEGORIAS) })),
});
const SCHEMA = z.toJSONSchema(Respuesta) as Record<string, unknown>;
delete SCHEMA.$schema;

const SYSTEM = `Clasificás repuestos de autos de un taller argentino en categorías fijas, a partir de su nombre y descripción.
${GUIA_CATEGORIAS}
Devolvé una entrada por cada id recibido.`;

// Pone una categoría fija a todos los repuestos que no la tienen: primero por sinónimos y,
// los que quedan sin pista, con una sola consulta de texto a Gemini.
export async function POST() {
  const { data, error } = await db().from("repuestos").select("id, nombre, descripcion, categoria").limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const asignar = new Map<Categoria, string[]>();
  const sinPista: { id: string; nombre: string; descripcion: string | null }[] = [];
  for (const r of data) {
    if ((CATEGORIAS as readonly string[]).includes(r.categoria ?? "")) continue;
    const c = normalizarCategoria(r.categoria);
    if (c) asignar.set(c, [...(asignar.get(c) ?? []), r.id]);
    else sinPista.push({ id: r.id, nombre: r.nombre, descripcion: r.descripcion?.slice(0, 160) ?? null });
  }

  try {
    for (let i = 0; i < sinPista.length; i += 150) {
      const lote = sinPista.slice(i, i + 150);
      const out = Respuesta.parse(
        await generarJson([{ text: JSON.stringify(lote) }], SYSTEM, SCHEMA, "analizar"),
      );
      const validos = new Set(lote.map((r) => r.id));
      for (const { id, categoria } of out.items) {
        if (validos.has(id)) asignar.set(categoria, [...(asignar.get(categoria) ?? []), id]);
      }
    }
  } catch (e) {
    const { error, status } = errorGemini(e);
    return NextResponse.json({ error }, { status });
  }

  let actualizados = 0;
  for (const [categoria, ids] of asignar) {
    const { error } = await db().from("repuestos").update({ categoria }).in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    actualizados += ids.length;
  }
  return NextResponse.json({ actualizados });
}
