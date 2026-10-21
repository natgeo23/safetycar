import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const pin = process.env.APP_PIN;
  if (!pin) {
    // Sin PIN: libre en desarrollo, cerrado en producción para no exponer el stock.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("Falta configurar APP_PIN en Vercel", { status: 503 });
  }

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && cookie === (await authToken(pin))) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    "/((?!login|api/login|api/whatsapp|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon|apple-icon).*)",
  ],
};
