import "server-only";

// Cliente mínimo de Evolution API. Usa el token de la instancia, no la clave global del servidor.
function config() {
  const url = process.env.EVOLUTION_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instancia = process.env.EVOLUTION_INSTANCE;
  if (!url || !key || !instancia) throw new Error("Faltan EVOLUTION_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE");
  return { url: url.replace(/\/$/, ""), key, instancia: encodeURIComponent(instancia) };
}

async function llamar<T>(ruta: string, body: unknown): Promise<T> {
  const { url, key, instancia } = config();
  const res = await fetch(`${url}/${ruta}/${instancia}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000), // bajar o subir un video puede tardar
  });
  if (!res.ok) throw new Error(`Evolution ${ruta} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

export async function enviarTexto(destino: string, texto: string) {
  const r = await llamar<{ key?: { id?: string } }>("message/sendText", { number: destino, text: texto });
  return r.key?.id ?? null;
}

// Descarga (desencriptada) una foto, video o audio que llegó, por el id del mensaje.
export async function obtenerMedia(id: string) {
  const r = await llamar<{ mediaType?: string; mimetype?: string; base64?: string; fileName?: string }>(
    "chat/getBase64FromMediaMessage",
    { message: { key: { id } }, convertToMp4: false },
  );
  if (!r.base64 || !r.mimetype) return null;
  return { tipo: r.mediaType ?? "", mime: r.mimetype.split(";")[0], data: r.base64, archivo: r.fileName ?? "archivo" };
}

// Manda una foto, video o audio (como nota de voz) a un número.
export async function enviarMedia(destino: string, m: { tipo: string; mime: string; data: string; archivo: string }, caption?: string) {
  if (m.tipo.startsWith("audio")) {
    const r = await llamar<{ key?: { id?: string } }>("message/sendWhatsAppAudio", { number: destino, audio: m.data });
    return r.key?.id ?? null;
  }
  const mediatype = m.tipo.startsWith("image") ? "image" : m.tipo.startsWith("video") ? "video" : "document";
  const r = await llamar<{ key?: { id?: string } }>("message/sendMedia", {
    number: destino,
    mediatype,
    mimetype: m.mime,
    media: m.data,
    fileName: m.archivo,
    caption,
  });
  return r.key?.id ?? null;
}

// "escribiendo…" durante `ms` milisegundos. Evolution bloquea la respuesta hasta que termina.
export async function escribiendo(destino: string, ms: number) {
  await llamar("chat/sendPresence", { number: destino, presence: "composing", delay: Math.round(ms) }).catch((e) =>
    console.warn("presencia:", e.message),
  );
}

export async function marcarLeido(jid: string, ids: string[]) {
  if (!ids.length) return;
  await llamar("chat/markMessageAsRead", {
    readMessages: ids.map((id) => ({ remoteJid: jid, fromMe: false, id })),
  }).catch((e) => console.warn("leído:", e.message));
}
