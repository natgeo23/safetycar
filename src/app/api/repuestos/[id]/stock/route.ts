import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

// Ingreso / egreso de unidades: { delta: 1 | -1 | n, motivo? }
export async function POST(request: Request, ctx: RouteContext<"/api/repuestos/[id]/stock">) {
  const { id } = await ctx.params;
  const { delta, motivo } = await request.json();
  if (!Number.isInteger(delta) || delta === 0) {
    return NextResponse.json({ error: "delta inválido" }, { status: 400 });
  }
  const { data, error } = await db().rpc("ajustar_stock", { p_id: id, p_delta: delta, p_motivo: motivo ?? null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cantidad: data });
}
