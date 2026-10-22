import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";
import { pick } from "@/lib/types";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().replace(/[%,()]/g, " ");
  let query = db().from("repuestos").select("*").order("created_at", { ascending: false }).limit(2000);
  if (q) {
    const like = `%${q}%`;
    query = query.or(
      ["nombre", "marca", "codigo", "codigo_barras", "compatibilidad", "categoria", "ubicacion"]
        .map((c) => `${c}.ilike.${like}`)
        .join(","),
    );
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  const fields = pick(body);
  if (!fields.nombre) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  const { data, error } = await db()
    .from("repuestos")
    .insert({ ...fields, ia_datos: body.ia_datos ?? null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
