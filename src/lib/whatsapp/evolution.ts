import "server-only";
import { crearCanalEvolution, type Canal } from "@natgeo23/nucleo-whatsapp";

// Cliente de Evolution API (del núcleo). Usa el token de la instancia, no la clave global del servidor.
let instancia: Canal | null = null;

export function canal() {
  if (instancia) return instancia;
  const url = process.env.EVOLUTION_URL;
  const token = process.env.EVOLUTION_API_KEY;
  const nombre = process.env.EVOLUTION_INSTANCE;
  if (!url || !token || !nombre) throw new Error("Faltan EVOLUTION_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE");
  instancia = crearCanalEvolution({ url, token, instancia: nombre });
  return instancia;
}

export async function enviarTexto(destino: string, texto: string) {
  return (await canal().enviarTexto(destino, texto)).id;
}

export const obtenerMedia = (id: string) => canal().obtenerMedia(id);

export const enviarMedia: Canal["enviarMedia"] = (destino, m, caption) => canal().enviarMedia(destino, m, caption);
