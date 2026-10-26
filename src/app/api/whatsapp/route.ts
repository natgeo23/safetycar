import { leerWebhook } from "@natgeo23/nucleo-whatsapp";
import { after, NextResponse } from "next/server";
import { motorStefy } from "@/lib/whatsapp/motor";

// Webhook de Evolution. Responde enseguida y la conversación sigue en after(): esperar ráfagas,
// "leer", "escribir" y la IA entran holgados.
export const maxDuration = 300;

export async function POST(request: Request) {
  if (request.headers.get("x-webhook-token") !== process.env.WHATSAPP_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const entrada = leerWebhook(await request.json().catch(() => null));
  if (entrada) after(() => motorStefy().procesar(entrada).catch((e) => console.error("whatsapp:", e)));
  return NextResponse.json({ ok: true });
}
