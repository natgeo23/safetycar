import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";
import { avisar, equipo } from "@/lib/whatsapp/equipo";
import { enHorario } from "@/lib/whatsapp/taller";

export const maxDuration = 60;

// Recién creadas ya tienen su aviso: se recuerdan si siguen sin tomar pasado este tiempo.
const GRACIA_MIN = 15;
// Las más viejas que esto ya no se recuerdan (quedan en el reporte semanal).
const VENTANA_DIAS = 7;

// Recordatorio de consultas sin tomar. Lo llama un cron cada 30 minutos (en harivps, porque el
// plan Hobby de Vercel solo permite crons diarios). Fuera del horario del local no molesta.
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const forzar = request.nextUrl.searchParams.get("forzar");
  if (!enHorario(new Date()) && !forzar) return NextResponse.json({ ok: true, fuera_de_horario: true });

  const { data: casos, error } = await db()
    .from("wa_solicitudes")
    .select("id, jid, tipo, nombre, vehiculo, detalle, created_at")
    .is("tomada_por", null)
    .eq("estado", "pendiente")
    .lt("created_at", new Date(Date.now() - GRACIA_MIN * 60_000).toISOString())
    .gte("created_at", new Date(Date.now() - VENTANA_DIAS * 86_400_000).toISOString())
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!casos.length) return NextResponse.json({ ok: true, pendientes: 0 });

  const { data: chats } = await db()
    .from("wa_chats")
    .select("jid, telefono")
    .in("jid", [...new Set(casos.map((c) => c.jid))]);
  const tel = new Map((chats ?? []).map((c) => [c.jid, c.telefono]));

  const texto = [
    casos.length === 1 ? "⏰ Hay 1 consulta sin tomar:" : `⏰ Hay ${casos.length} consultas sin tomar:`,
    "",
    ...casos.map((c) =>
      [
        `*#${c.id}* ${c.nombre ?? "Cliente"} · wa.me/${tel.get(c.jid) ?? ""} · hace ${hace(c.created_at)}`,
        `   ${[c.vehiculo, c.detalle].filter(Boolean).join(" · ").slice(0, 140)}`,
      ].join("\n"),
    ),
    "",
    casos.length === 1 ? `Para tomarla respondé *tomo ${casos[0].id}*.` : "Para tomar una respondé *tomo* y el número.",
  ].join("\n");

  if (request.nextUrl.searchParams.get("preview")) return new NextResponse(texto);
  for (const v of equipo()) await avisar(v.numero, texto);
  return NextResponse.json({ ok: true, pendientes: casos.length });
}

function hace(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return `${min} min`;
  const horas = Math.round(min / 60);
  return horas < 48 ? `${horas} h` : `${Math.round(horas / 24)} días`;
}
