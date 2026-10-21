import "server-only";
import { db } from "@/lib/supabase";
import { enviarTexto } from "./evolution";

export type Vendedor = { nombre: string; numero: string };

// BOT_EQUIPO="Claudio:5491126538422,Matías:5491157800992". Acepta también BOT_AVISOS_A (solo números).
export function equipo(): Vendedor[] {
  const crudo = process.env.BOT_EQUIPO || process.env.BOT_AVISOS_A || "";
  return crudo
    .split(",")
    .map((item) => {
      const [a, b] = item.includes(":") ? item.split(":") : ["", item];
      const numero = b.replace(/\D/g, "");
      return { nombre: a.trim() || numero, numero };
    })
    .filter((v) => v.numero);
}

// Mensajes del local a un número del equipo o al dueño. Se guardan como "aviso": así su eco no
// pausa ese chat y quedan fuera de la memoria del bot (tienen datos de otros clientes).
export async function avisar(numero: string, texto: string) {
  try {
    const jid = `${numero}@s.whatsapp.net`;
    await db().from("wa_chats").upsert({ jid, telefono: numero });
    const id = await enviarTexto(numero, texto);
    if (id) await db().from("wa_mensajes").insert({ id, jid, rol: "aviso", texto });
    return id;
  } catch (err) {
    console.error(`aviso a ${numero}:`, err);
    return null;
  }
}

type Caso = {
  jid: string;
  tipo: "consulta" | "retiro" | "reserva_repuesto" | "otro";
  nombre: string | null;
  telefono: string | null;
  vehiculo?: string;
  fecha_preferida?: string;
  detalle: string;
};

const TITULOS: Record<Caso["tipo"], string> = {
  consulta: "🙋 Consulta para atender",
  retiro: "📦 Pedido de retiro",
  reserva_repuesto: "📌 Pedido de reserva",
  otro: "📋 Pedido",
};

// Registra el caso y avisa a todo el equipo con un número para que alguien lo tome.
export async function crearCaso(c: Caso) {
  const { data, error } = await db()
    .from("wa_solicitudes")
    .insert({
      jid: c.jid,
      tipo: c.tipo,
      nombre: c.nombre,
      vehiculo: c.vehiculo,
      fecha_preferida: c.fecha_preferida,
      detalle: c.detalle,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const texto = [
    `${TITULOS[c.tipo]} #${data.id}`,
    `${c.nombre ?? "Cliente"} · wa.me/${c.telefono ?? ""}`,
    c.vehiculo,
    c.fecha_preferida,
    c.detalle,
    "",
    `Para tomarla respondé *tomo ${data.id}* (o respondé este mensaje con "tomo").`,
  ]
    .filter((l) => l !== undefined && l !== null)
    .join("\n");
  const ids = [];
  for (const v of equipo()) {
    const id = await avisar(v.numero, texto);
    if (id) ids.push(id);
  }
  await db().from("wa_solicitudes").update({ aviso_ids: ids }).eq("id", data.id);
  return data.id as number;
}

const QUIERE_TOMAR = /\b(tomo|la tomo|lo tomo|yo|m[ií]a|me encargo|lo veo yo|la veo yo)\b/i;

// Mensaje de alguien del equipo al WhatsApp del local. Si es para tomar un caso, lo asigna,
// le confirma y le avisa a los demás. Devuelve false si no era para eso.
export async function mensajeDelEquipo(v: Vendedor, texto: string, citado: string | null) {
  // Un número solo cuenta junto a "tomo" o solo ("12", "#12"): "lo llamo a las 15" no toma la 15.
  const quiere = QUIERE_TOMAR.test(texto) || /^\s*#?\d{1,6}\s*$/.test(texto);
  if (!citado && !quiere) return false;
  const numero = quiere ? texto.match(/#?\b(\d{1,6})\b/)?.[1] : undefined;

  let query = db().from("wa_solicitudes").select("id, nombre, tomada_por, jid");
  if (citado) query = query.contains("aviso_ids", [citado]);
  else if (numero) query = query.eq("id", Number(numero));
  else {
    // "tomo" a secas: vale si hay una sola sin tomar en las últimas 24 horas.
    query = query
      .is("tomada_por", null)
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString())
      .order("created_at", { ascending: false });
  }
  const { data: casos } = await query.limit(2);

  // Citó algo que no es un aviso de un caso (ej. el recordatorio): se resuelve por número o por "tomo".
  if (citado && !casos?.length) return mensajeDelEquipo(v, numero ? `tomo ${numero}` : "tomo", null);

  if (!casos?.length) {
    await avisar(v.numero, numero ? `No encuentro la #${numero} 🤔` : "No hay consultas pendientes para tomar 👌");
    return true;
  }
  if (casos.length > 1) {
    await avisar(v.numero, "Hay más de una pendiente. Decime cuál: *tomo* y el número (ej: tomo 12), o respondé el aviso.");
    return true;
  }

  const caso = casos[0];
  const cliente = caso.nombre ?? "el cliente";
  if (caso.tomada_por) {
    await avisar(
      v.numero,
      caso.tomada_por === v.nombre ? `Ya es tuya la #${caso.id} 👍` : `La #${caso.id} (${cliente}) ya la tomó ${caso.tomada_por}.`,
    );
    return true;
  }

  // Solo la toma si nadie la tomó en el medio (dos respondiendo a la vez).
  const { data: tomada } = await db()
    .from("wa_solicitudes")
    .update({ tomada_por: v.nombre, tomada_at: new Date().toISOString() })
    .eq("id", caso.id)
    .is("tomada_por", null)
    .select("id");
  if (!tomada?.length) return mensajeDelEquipo(v, `#${caso.id}`, null);

  await avisar(v.numero, `✅ Listo ${v.nombre}, la #${caso.id} (${cliente}) es tuya.`);
  for (const otro of equipo().filter((o) => o.numero !== v.numero)) {
    await avisar(otro.numero, `👍 ${v.nombre} tomó la #${caso.id} (${cliente}). No hace falta que la atiendas.`);
  }
  return true;
}
