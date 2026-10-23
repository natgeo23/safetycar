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

function blobABase64(blob: Blob): Promise<string> {
  return new Promise((ok, err) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result).split(",")[1]);
    lector.onerror = () => err(new Error("No se pudo leer la imagen"));
    lector.readAsDataURL(blob);
  });
}

async function aFoto(canvas: HTMLCanvasElement): Promise<Foto> {
  try {
    const blob = await new Promise<Blob>((ok, err) => {
      // Si el celu se queda sin memoria para imágenes, toBlob puede no responder nunca.
      const t = setTimeout(() => err(new Error("El celular no pudo procesar la imagen")), 20_000);
      canvas.toBlob((b) => {
        clearTimeout(t);
        if (b) ok(b);
        else err(new Error("No se pudo procesar la imagen"));
      }, "image/jpeg", CALIDAD);
    });
    // El base64 sale del JPEG ya comprimido, sin volver a codificar la imagen.
    const base64 = await blobABase64(blob);
    return { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), base64 };
  } finally {
    // iPhone tiene un tope de memoria para canvas y no la libera solo: achicarlo a 0 la devuelve.
    // Sin esto, después de ~30 fotos deja de procesar imágenes.
    canvas.width = 0;
    canvas.height = 0;
  }
}

// Algunos navegadores no abren HEIC con createImageBitmap pero sí con <img>.
async function decodificar(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } catch {
      throw new Error("Formato de foto no soportado");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// De a una foto por vez: decodificar una foto de 12 MP ocupa ~50 MB, y varias juntas cuelgan el celu.
// Las subidas y la IA sí siguen en paralelo.
let fila: Promise<unknown> = Promise.resolve();
function enFila<T>(tarea: () => Promise<T>): Promise<T> {
  const p = fila.then(tarea, tarea);
  fila = p.catch(() => {});
  return p;
}

export function fotoDesdeArchivo(file: File): Promise<Foto> {
  return enFila(async () => {
    const bitmap = await decodificar(file);
    try {
      return await aFoto(canvasDesde(bitmap, bitmap.width, bitmap.height));
    } finally {
      bitmap.close();
    }
  });
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
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(`No se pudieron preparar las subidas (${error})`);
  }
  const urls: { uploadUrl: string; publicUrl: string }[] = await res.json();

  await Promise.all(
    fotos.map(async (f, i) => {
      const r = await fetch(urls[i].uploadUrl, {
        method: "PUT",
        headers: { "content-type": "image/jpeg" },
        body: f.blob,
        signal: AbortSignal.timeout(60_000), // con mala señal en el galpón, mejor fallar y seguir
      });
      if (!r.ok) throw new Error("Falló la subida de una foto");
    }),
  );
  return urls.map((u) => u.publicUrl);
}
