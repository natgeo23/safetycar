import { NextResponse } from "next/server";
import { BUCKET, db } from "@/lib/supabase";

// Devuelve URLs firmadas para que el celular suba las fotos directo a Storage
// (evita el límite de 4,5 MB por request de Vercel).
export async function POST(request: Request) {
  const { cantidad = 1 } = await request.json().catch(() => ({}));
  const n = Math.min(Math.max(Number(cantidad) || 1, 1), 12);
  const fecha = new Date().toISOString().slice(0, 10);
  const storage = db().storage.from(BUCKET);

  const urls = await Promise.all(
    Array.from({ length: n }, async () => {
      const path = `${fecha}/${crypto.randomUUID()}.jpg`;
      const { data, error } = await storage.createSignedUploadUrl(path);
      if (error) throw error;
      return { uploadUrl: data.signedUrl, publicUrl: storage.getPublicUrl(path).data.publicUrl };
    }),
  ).catch((e: Error) => e);

  if (urls instanceof Error) {
    console.error("Supabase storage:", urls.message);
    return NextResponse.json({ error: `Storage: ${urls.message}` }, { status: 500 });
  }
  return NextResponse.json(urls);
}
