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
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Evolution ${ruta} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

export async function enviarTexto(destino: string, texto: string) {
  const r = await llamar<{ key?: { id?: string } }>("message/sendText", { number: destino, text: texto });
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
