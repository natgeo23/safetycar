import type { Content, Part } from "@google/genai";
import { after, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { responder, type Solicitud } from "@/lib/whatsapp/agente";
import { crearCaso, equipo, mensajeDelEquipo, reenviarATomador } from "@/lib/whatsapp/equipo";
import { enviarTexto, escribiendo, marcarLeido } from "@/lib/whatsapp/evolution";

// El trabajo corre en after(): esperar ráfagas, "leer", "escribir" y la IA entran holgados.
export const maxDuration = 120;

// Espera a que el cliente termine de mandar mensajes seguidos antes de contestar.
const RAFAGA_MS = 3_000;
// Cuánto tarda como mínimo el primer mensaje desde que "lee" (si la IA tarda más, no se suma nada).
const PRIMERA_RESPUESTA_MS = 3_500;
// Si alguien de ventas contesta desde el WhatsApp del local, el bot se calla en ese chat por estas horas.
const PAUSA_HORAS = 6;
// Un mensaje "del celular" que sale antes de esto después del cliente es una respuesta automática.
const AUTOMATICO_MS = 10_000;
const HISTORIAL = 30;
const MEDIA_MAX = 4_000_000; // base64

const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const azar = (min: number, max: number) => min + Math.random() * (max - min);

type Clave = { remoteJid?: string; remoteJidAlt?: string; senderPn?: string; fromMe?: boolean; id?: string };
type Mensaje = Record<string, { caption?: string; text?: string; mimetype?: string } | undefined> & {
  conversation?: string;
  base64?: string;
};

function extraer(m: Mensaje | undefined) {
  if (!m) return { texto: null, media: null };
  const texto =
    m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption;
  const tipo = m.audioMessage ? "audio" : m.imageMessage ? "foto" : m.stickerMessage ? "sticker" : m.videoMessage ? "video" : null;
  // Se marca siempre que trae foto, video o audio (para reenviarlo a ventas); el contenido solo se
  // guarda si es chico, para que lo vea la IA. Los videos largos quedan sin data.
  const mime = (m.audioMessage ?? m.imageMessage ?? m.videoMessage)?.mimetype?.split(";")[0];
  const media = mime ? { mime, data: m.base64 && m.base64.length < MEDIA_MAX ? m.base64 : null } : null;
  return { texto: texto || (tipo ? `[${tipo}]` : null), media };
}

// Números en formato 5491112345678, separados por coma.
const numeros = (v?: string) => (v ?? "").split(",").map((n) => n.replace(/\D/g, "")).filter(Boolean);

export async function POST(request: Request) {
  if (request.headers.get("x-webhook-token") !== process.env.WHATSAPP_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (body?.event !== "messages.upsert") return NextResponse.json({ ok: true });

  const key: Clave = body.data?.key ?? {};
  const jid = key.remoteJid;
  if (!jid || !key.id || /@(g\.us|broadcast|newsletter)$/.test(jid)) return NextResponse.json({ ok: true });
  const { texto, media } = extraer(body.data.message);
  if (!texto) return NextResponse.json({ ok: true }); // reacciones, ediciones, mensajes de protocolo

  const telefono = [key.remoteJidAlt, key.senderPn, jid].find((j) => j?.endsWith("@s.whatsapp.net"))?.split("@")[0] ?? null;
  // Si responde citando un mensaje (ej. un aviso al equipo), el id del citado.
  const citado: string | null =
    body.data.contextInfo?.stanzaId ?? body.data.message?.extendedTextMessage?.contextInfo?.stanzaId ?? null;
  const entrada = { jid, id: key.id, fromMe: !!key.fromMe, telefono, nombre: body.data.pushName as string | undefined, texto, media, citado };
  after(() => procesar(entrada).catch((e) => console.error("whatsapp:", e)));
  return NextResponse.json({ ok: true });
}

type Entrada = {
  jid: string;
  id: string;
  fromMe: boolean;
  telefono: string | null;
  nombre?: string;
  texto: string;
  media: { mime: string; data: string | null } | null;
  citado: string | null;
};

async function procesar(e: Entrada) {
  const chat: Record<string, string> = { jid: e.jid };
  if (e.telefono) chat.telefono = e.telefono;
  if (!e.fromMe && e.nombre) chat.nombre = e.nombre;
  await db().from("wa_chats").upsert(chat);

  if (e.fromMe) {
    const recibido = Date.now();
    // Lo que manda el bot también vuelve como fromMe: le damos tiempo a quedar guardado.
    await dormir(4_000);
    const { data } = await db().from("wa_mensajes").select("id").eq("id", e.id).maybeSingle();
    if (data) return;
    // El saludo y el mensaje de ausencia de WhatsApp Business salen al instante: una persona no
    // contesta tan rápido. Se guardan como contexto pero no pausan al bot.
    const { data: previo } = await db()
      .from("wa_mensajes")
      .select("created_at")
      .eq("jid", e.jid)
      .eq("rol", "cliente")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const automatico = !!previo && recibido - new Date(previo.created_at).getTime() < AUTOMATICO_MS;
    const texto = automatico ? `[Mensaje automático de WhatsApp Business, ya lo recibió el cliente]\n${e.texto}` : e.texto;
    await db().from("wa_mensajes").insert({ id: e.id, jid: e.jid, rol: "humano", texto });
    if (!automatico) await pausar(e.jid);
    return;
  }

  // Alguien de ventas tomando una consulta desde su celular: no es un cliente.
  const vendedor = equipo().find((v) => v.numero === e.telefono);
  if (vendedor && (await mensajeDelEquipo(vendedor, e.texto, e.citado))) return;

  const { error } = await db().from("wa_mensajes").insert({ id: e.id, jid: e.jid, rol: "cliente", texto: e.texto, media: e.media });
  if (error) return; // duplicado: Evolution reintentó el webhook
  // Fotos o videos nuevos de una consulta que ya tomó alguien: se los reenvía, en paralelo a la respuesta.
  if (e.media) after(() => reenviarATomador(e.jid, [e.id]).catch((err) => console.error("reenvío:", err)));

  const modo = process.env.BOT_MODO || "prueba";
  if (modo === "apagado") return;
  if (modo === "prueba" && !(e.telefono && numeros(process.env.BOT_NUMEROS_PRUEBA).includes(e.telefono))) return;

  // Solo contesta la invocación del último mensaje de la ráfaga.
  await dormir(RAFAGA_MS);
  const { data: ultimo } = await db()
    .from("wa_mensajes")
    .select("id")
    .eq("jid", e.jid)
    .eq("rol", "cliente")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (ultimo?.id !== e.id) return;

  const { data: estado } = await db().from("wa_chats").select("pausado_hasta, nombre, nombre_cliente").eq("jid", e.jid).single();
  if (estado?.pausado_hasta && new Date(estado.pausado_hasta) > new Date()) return;
  let nombre: string | null = estado?.nombre_cliente ?? null;

  const { data: filas } = await db()
    .from("wa_mensajes")
    .select("id, rol, texto, media, created_at")
    .eq("jid", e.jid)
    .neq("rol", "aviso")
    .order("created_at", { ascending: false })
    .limit(HISTORIAL);
  const historial = (filas ?? []).reverse();

  const destino = e.telefono ?? e.jid;
  const sinLeer = [];
  for (let i = historial.length - 1; i >= 0 && historial[i].rol === "cliente"; i--) sinLeer.push(historial[i].id);
  // Para saludar (o no) como una persona: no es lo mismo seguir la charla que retomarla días después.
  const anterior = historial.at(-1 - sinLeer.length);
  const { data: abierta } = await db()
    .from("wa_solicitudes")
    .select("detalle, tomada_por, created_at")
    .eq("jid", e.jid)
    .eq("tipo", "consulta")
    .eq("estado", "pendiente")
    .gte("created_at", new Date(Date.now() - 12 * 3_600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nota = [
    anterior
      ? `El último mensaje antes de este fue hace ${hace(Date.now() - new Date(anterior.created_at).getTime())}.`
      : "Es la primera vez que escribe este cliente.",
    nombre
      ? `El cliente se llama ${nombre}.`
      : `Todavía no sabés cómo se llama el cliente (su perfil de WhatsApp dice "${estado?.nombre ?? "sin nombre"}", que puede no ser su nombre real).`,
    abierta
      ? `Hace ${hace(Date.now() - new Date(abierta.created_at).getTime())} ya le pasaste a los chicos de ventas esta consulta: "${abierta.detalle}". ${
          abierta.tomada_por ? `La tomó ${abierta.tomada_por}.` : "Todavía no la tomó nadie."
        }`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
  // Lee y empieza a "escribir" mientras la IA piensa, como alguien que contesta enseguida.
  await dormir(azar(300, 900));
  await marcarLeido(e.jid, sinLeer);
  void escribiendo(destino, 15_000);
  const inicio = Date.now();
  // Los avisos al equipo salen después de contestarle al cliente, para no demorarlo.
  const tareas: Promise<unknown>[] = [];
  const enSegundoPlano = (p: Promise<unknown>) => tareas.push(p.catch((err) => console.error("aviso:", err)));

  const caso = { jid: e.jid, telefono: e.telefono };
  const acciones = {
    guardarNombre: async (n: string) => {
      nombre = n.trim().slice(0, 60) || nombre;
      await db().from("wa_chats").update({ nombre_cliente: nombre }).eq("jid", e.jid);
    },
    registrarSolicitud: async (s: Solicitud) => {
      enSegundoPlano(crearCaso({ ...caso, ...s, nombre: s.nombre ?? nombre ?? estado?.nombre ?? null }));
    },
    // Derivar no pausa: Stefy sigue atendiendo hasta que alguien de ventas escriba desde el local.
    derivar: async (motivo: string) => {
      enSegundoPlano(crearCaso({ ...caso, tipo: "consulta", nombre: nombre ?? estado?.nombre ?? null, detalle: motivo }));
    },
  };
  // El cliente nunca se queda sin respuesta: si la IA falla, contesta algo humano y avisa al equipo.
  let respuesta = await responder(aContenido(historial), nota, acciones).catch((err) => {
    console.error("agente:", err);
    return null;
  });
  if (!respuesta) {
    respuesta = "¡Hola! Disculpá la demora, ya te leo y te respondo en un ratito 🙏";
    await acciones.derivar("El asistente no pudo responder, revisar la conversación");
  }

  // Como en un chat real: varios mensajes cortos, cada uno con su "escribiendo…".
  const partes = respuesta.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const mensajes = partes.length > 3 ? [...partes.slice(0, 2), partes.slice(2).join("\n\n")] : partes;
  for (const [i, texto] of mensajes.entries()) {
    if (i === 0) {
      // Ya estuvo "escribiendo" mientras pensaba: solo completa el mínimo si la IA fue muy rápida.
      await dormir(Math.max(PRIMERA_RESPUESTA_MS - (Date.now() - inicio), 0));
    } else {
      await escribiendo(destino, Math.min(Math.max(texto.length * 25, 1_000), 3_000));
    }
    const id = await enviarTexto(destino, texto);
    await db().from("wa_mensajes").insert({ id: id ?? `bot-${crypto.randomUUID()}`, jid: e.jid, rol: "bot", texto });
  }
  console.log(`respuesta en ${Date.now() - inicio} ms desde que leyó (${mensajes.length} mensajes)`);
  await Promise.all(tareas);

  // El contenido de audios y fotos solo le sirve a la IA mientras la charla está fresca: después se
  // borra, pero queda la marca de que había un archivo para poder reenviarlo a ventas.
  const { data: viejos } = await db()
    .from("wa_mensajes")
    .select("id, media")
    .eq("jid", e.jid)
    .not("media->>data", "is", null)
    .lt("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString())
    .limit(50);
  for (const v of viejos ?? []) {
    await db().from("wa_mensajes").update({ media: { mime: v.media.mime, data: null } }).eq("id", v.id);
  }
}

type Fila = { rol: string; texto: string | null; media: { mime: string; data: string | null } | null };

// Gemini pide turnos alternados que empiecen y terminen con el usuario.
function aContenido(filas: Fila[]): Content[] {
  const contenido: Content[] = [];
  filas.forEach((f, i) => {
    const role = f.rol === "cliente" ? "user" : "model";
    const parts: Part[] = [];
    if (f.texto) parts.push({ text: f.texto });
    if (role === "user" && f.media?.data && i >= filas.length - 10) parts.push({ inlineData: { mimeType: f.media.mime, data: f.media.data } });
    if (!parts.length) return;
    const previo = contenido.at(-1);
    if (previo?.role === role) previo.parts!.push(...parts);
    else contenido.push({ role, parts });
  });
  while (contenido[0]?.role === "model") contenido.shift();
  return contenido;
}

function hace(ms: number) {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} minutos`;
  const horas = Math.round(min / 60);
  return horas < 48 ? `${horas} horas` : `${Math.round(horas / 24)} días`;
}

async function pausar(jid: string) {
  const hasta = new Date(Date.now() + PAUSA_HORAS * 3_600_000).toISOString();
  await db().from("wa_chats").update({ pausado_hasta: hasta }).eq("jid", jid);
}
