import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";
import { avisar, equipo } from "@/lib/whatsapp/equipo";

export const maxDuration = 60;

const DIAS = 7;
const TIPOS: Record<string, string> = {
  consulta: "consulta",
  retiro: "retiro",
  reserva_repuesto: "reserva",
  otro: "pedido",
};

// Reporte semanal al dueño. Lo dispara el cron de Vercel (lunes 9 hs); con ?preview=1 solo lo devuelve.
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const texto = await armarReporte(new Date(Date.now() - DIAS * 86_400_000));
  if (request.nextUrl.searchParams.get("preview")) return new NextResponse(texto);

  const destinos = (process.env.BOT_REPORTE_A ?? "").split(",").map((n) => n.replace(/\D/g, "")).filter(Boolean);
  for (const numero of destinos) await avisar(numero, texto);
  return NextResponse.json({ ok: true, enviados: destinos.length });
}

async function armarReporte(desde: Date) {
  const iso = desde.toISOString();
  const internos = new Set([...equipo().map((v) => v.numero), ...(process.env.BOT_REPORTE_A ?? "").split(",").map((n) => n.replace(/\D/g, ""))]);

  const [{ data: mensajes }, { data: chats }, { data: casos }] = await Promise.all([
    db().from("wa_mensajes").select("jid, rol, texto").in("rol", ["cliente", "humano"]).gte("created_at", iso).limit(10_000),
    db().from("wa_chats").select("jid, telefono, nombre, nombre_cliente, created_at"),
    db()
      .from("wa_solicitudes")
      .select("id, jid, tipo, nombre, vehiculo, detalle, tomada_por, created_at")
      .gte("created_at", iso)
      .order("created_at"),
  ]);

  const chat = new Map((chats ?? []).map((c) => [c.jid, c]));
  const esCliente = (jid: string) => !internos.has(chat.get(jid)?.telefono ?? "");
  const nombre = (jid: string) => {
    const c = chat.get(jid);
    return c?.nombre_cliente ?? c?.nombre ?? "Cliente";
  };
  const contacto = (jid: string) => `${nombre(jid)} (wa.me/${chat.get(jid)?.telefono ?? ""})`;

  const conversaciones = new Set((mensajes ?? []).filter((m) => m.rol === "cliente" && esCliente(m.jid)).map((m) => m.jid));
  const nuevos = [...conversaciones].filter((jid) => (chat.get(jid)?.created_at ?? "") >= iso).length;
  // Respuestas escritas a mano desde el WhatsApp del local (sin el saludo automático).
  const atendidas = new Set(
    (mensajes ?? []).filter((m) => m.rol === "humano" && esCliente(m.jid) && !m.texto?.startsWith("[Mensaje automático")).map((m) => m.jid),
  );

  const lista = (casos ?? []).filter((c) => esCliente(c.jid));
  const porVendedor = new Map<string, number>();
  for (const c of lista) if (c.tomada_por) porVendedor.set(c.tomada_por, (porVendedor.get(c.tomada_por) ?? 0) + 1);
  const sinTomar = lista.filter((c) => !c.tomada_por);
  const fecha = (d: Date) => d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

  const lineas = [
    `📊 *Resumen semanal · SafetyCar Autopartes*`,
    `${fecha(desde)} al ${fecha(new Date())}`,
    "",
    `💬 Conversaciones: *${conversaciones.size}* (${nuevos} clientes nuevos)`,
    `🙋 Consultas y pedidos para ventas: *${lista.length}*`,
    ...[...porVendedor].map(([v, n]) => `   • ${v} tomó ${n}`),
    sinTomar.length ? `   • ⚠️ Sin tomar: ${sinTomar.length}` : null,
    `✍️ Chats respondidos a mano desde el local: *${atendidas.size}*`,
  ];

  if (lista.length) {
    lineas.push("", "*Detalle (posibles ventas)*");
    for (const c of lista) {
      const que = [c.vehiculo, c.detalle].filter(Boolean).join(" · ");
      lineas.push(
        `#${c.id} ${TIPOS[c.tipo] ?? c.tipo} · ${contacto(c.jid)}`,
        `   ${que.slice(0, 160)}`,
        `   ${c.tomada_por ? `✅ ${c.tomada_por}` : "⚠️ sin tomar"}`,
      );
    }
  }

  // Chats que atendió alguien a mano sin pasar por un aviso: también son posibles ventas.
  const conCaso = new Set(lista.map((c) => c.jid));
  const sueltos = [...atendidas].filter((jid) => !conCaso.has(jid));
  if (sueltos.length) {
    lineas.push("", "*Otros chats atendidos a mano*", ...sueltos.map((jid) => `• ${contacto(jid)}`));
  }

  if (!conversaciones.size && !lista.length) lineas.push("", "Semana tranquila: no hubo consultas por WhatsApp.");
  return lineas.filter((l) => l !== null).join("\n");
}
