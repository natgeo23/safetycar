// Utilidades de cámara/medios del lado del navegador.

export type Foto = { id: string; blob: Blob; url: string; base64: string };

const MAX_LADO = 1280; // suficiente para leer etiquetas y liviano para subir desde el taller
const CALIDAD = 0.8;

function canvasDesde(src: CanvasImageSource, w: number, h: number) {
  const escala = Math.min(1, MAX_LADO / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * escala);
  canvas.height = Math.round(h * escala);
  canvas.getContext("2d")!.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function aFoto(canvas: HTMLCanvasElement): Promise<Foto> {
  const blob = await new Promise<Blob>((ok, err) =>
    canvas.toBlob((b) => (b ? ok(b) : err(new Error("No se pudo procesar la imagen"))), "image/jpeg", CALIDAD),
  );
  const base64 = canvas.toDataURL("image/jpeg", CALIDAD).split(",")[1];
  return { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), base64 };
}

export async function fotoDesdeArchivo(file: File): Promise<Foto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const foto = await aFoto(canvasDesde(bitmap, bitmap.width, bitmap.height));
  bitmap.close();
  return foto;
}

// Extrae N cuadros repartidos a lo largo del video.
export async function cuadrosDeVideo(file: File, n = 5): Promise<Foto[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = URL.createObjectURL(file);
  await new Promise<void>((ok, err) => {
    video.onloadeddata = () => ok();
    video.onerror = () => err(new Error("No se pudo leer el video"));
  });

  const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
  const fotos: Foto[] = [];
  for (let i = 0; i < n; i++) {
    video.currentTime = (dur * (i + 0.5)) / n;
    await new Promise((ok) => (video.onseeked = ok));
    fotos.push(await aFoto(canvasDesde(video, video.videoWidth, video.videoHeight)));
  }
  URL.revokeObjectURL(video.src);
  return fotos;
}

// Sube las fotos directo a Supabase Storage con URLs firmadas. Devuelve las URLs públicas.
export async function subirFotos(fotos: Foto[]): Promise<string[]> {
  if (!fotos.length) return [];
  const res = await fetch("/api/subir", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cantidad: fotos.length }),
  });
  if (!res.ok) throw new Error("No se pudieron preparar las subidas");
  const urls: { uploadUrl: string; publicUrl: string }[] = await res.json();

  await Promise.all(
    fotos.map(async (f, i) => {
      const r = await fetch(urls[i].uploadUrl, {
        method: "PUT",
        headers: { "content-type": "image/jpeg" },
        body: f.blob,
      });
      if (!r.ok) throw new Error("Falló la subida de una foto");
    }),
  );
  return urls.map((u) => u.publicUrl);
}
