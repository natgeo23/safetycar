"use client";

import { ESTADO_LABEL, type Repuesto } from "@/lib/types";

// Texto para WhatsApp (los *asteriscos* salen en negrita).
export function textoParaCompartir(r: Repuesto) {
  const precio = r.precio != null ? `$${r.precio.toLocaleString("es-AR")}` : null;
  return [
    `*${r.nombre}*`,
    [r.marca, ESTADO_LABEL[r.estado]].filter(Boolean).join(" · "),
    r.compatibilidad && `Compatible: ${r.compatibilidad}`,
    r.codigo && `Código: ${r.codigo}`,
    precio && `Precio: ${precio}`,
    "SafetyCar Autopartes",
  ].filter(Boolean).join("\n");
}

// Baja las fotos como archivos de antemano: el menú de compartir del celu tiene que abrirse
// en el mismo toque, sin esperar descargas.
export async function fotosComoArchivos(r: Repuesto): Promise<File[]> {
  const nombre = r.nombre.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase().slice(0, 40);
  const archivos = await Promise.all(
    r.fotos.slice(0, 4).map(async (u, i) => {
      try {
        const blob = await (await fetch(u)).blob();
        return new File([blob], `${nombre}-${i + 1}.jpg`, { type: blob.type || "image/jpeg" });
      } catch {
        return null;
      }
    }),
  );
  return archivos.filter((f): f is File => !!f);
}

// Abre el menú nativo para compartir (WhatsApp, etc.) con fotos y texto. Si el navegador no
// permite compartir archivos, abre WhatsApp con el texto y el link de la foto.
export async function compartir(r: Repuesto, archivos: File[]) {
  const texto = textoParaCompartir(r);
  // WhatsApp a veces descarta el texto cuando van fotos: lo dejamos copiado para pegarlo.
  navigator.clipboard?.writeText(texto).catch(() => {});
  if (archivos.length && navigator.canShare?.({ files: archivos })) {
    try {
      await navigator.share({ files: archivos, text: texto });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // el usuario cerró el menú
    }
  }
  const conFoto = r.fotos[0] ? `${texto}\n${r.fotos[0]}` : texto;
  window.open(`https://wa.me/?text=${encodeURIComponent(conFoto)}`, "_blank");
}
