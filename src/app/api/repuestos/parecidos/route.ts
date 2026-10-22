import { NextResponse } from "next/server";
import { buscarParecidos, type Ficha } from "@/lib/parecidos";
import { db } from "@/lib/supabase";
import type { Repuesto } from "@/lib/types";

// Busca en el stock repuestos que podrían ser el mismo que se está cargando: { ficha, excluir? }.
export async function POST(request: Request) {
  const { ficha, excluir } = (await request.json().catch(() => ({}))) as { ficha?: Ficha; excluir?: string };
  if (!ficha?.nombre) return NextResponse.json([]);
  const { data, error } = await db()
    .from("repuestos")
    .select("id, created_at, nombre, marca, codigo, codigo_barras, categoria, compatibilidad, estado, cantidad, stock_minimo, ubicacion, precio, fotos")
    .limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(buscarParecidos(ficha, data as Repuesto[], excluir));
}
