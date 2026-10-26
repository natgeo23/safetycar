import { after, NextResponse, type NextRequest } from "next/server";
import { motorStefy } from "@/lib/whatsapp/motor";

export const maxDuration = 300;

// Retoma los chats que quedaron con mensajes sin contestar (por ejemplo, si un deploy cortó una
// respuesta). Lo llama un cron cada minuto en harivps (Vercel Hobby solo permite crons diarios).
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  after(() =>
    motorStefy()
      .retomarPendientes()
      .then((jids) => jids.length && console.log(`retomó ${jids.length} chat(s) pendientes`))
      .catch((e) => console.error("retomar:", e)),
  );
  return NextResponse.json({ ok: true });
}
