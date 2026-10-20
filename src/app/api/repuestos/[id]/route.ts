import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { pick } from "@/lib/types";

export async function GET(_: Request, ctx: RouteContext<"/api/repuestos/[id]">) {
  const { id } = await ctx.params;
  const { data, error } = await db().from("repuestos").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/repuestos/[id]">) {
  const { id } = await ctx.params;
  const { data, error } = await db()
    .from("repuestos")
    .update(pick(await request.json()))
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: Request, ctx: RouteContext<"/api/repuestos/[id]">) {
  const { id } = await ctx.params;
  const { error } = await db().from("repuestos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
