import "server-only";
import { db } from "@/lib/supabase";

// Búsqueda en el stock del local para el bot: entiende sinónimos del mostrador y ordena por cuántos
// conceptos de la consulta cubre cada repuesto.
export async function buscarRepuestos(consulta: string) {
  // Cada palabra de la consulta es un "concepto" que puede aparecer con cualquiera de sus variantes.
  const conceptos = consulta
    .toLowerCase()
    .replace(/[%,()*_.]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1 && !VACIAS.has(p))
    .slice(0, 6)
    .map(variantes);
  if (!conceptos.length) return [];

  // Trae todo lo que coincida con alguna variante y después ordena por cuántos conceptos cubre:
  // "burro arranque amarok" encuentra el motor de arranque aunque no diga Amarok.
  const terminos = [...new Set(conceptos.flat())];
  const { data, error } = await db()
    .from("repuestos")
    .select("nombre, marca, codigo, codigo_barras, categoria, compatibilidad, descripcion, estado, cantidad, precio")
    .or(terminos.flatMap((t) => COLUMNAS.map((c) => `${c}.ilike.%${t}%`)).join(","))
    .limit(80);
  if (error) throw new Error(error.message);

  const puntuados = (data ?? []).map((r) => {
    const texto = sinAcentos(COLUMNAS.map((c) => (r as Record<string, unknown>)[c] ?? "").join(" ").toLowerCase());
    return { r, puntos: conceptos.filter((vs) => vs.some((v) => texto.includes(sinAcentos(v)))).length };
  });
  puntuados.sort((a, b) => b.puntos - a.puntos || b.r.cantidad - a.r.cantidad);
  return puntuados.slice(0, 10).map(({ r, puntos }) => ({
    nombre: r.nombre,
    marca: r.marca,
    codigo: r.codigo,
    categoria: r.categoria,
    compatibilidad: r.compatibilidad,
    descripcion: r.descripcion,
    estado: r.estado,
    precio: r.precio,
    cantidad: r.cantidad > 0 ? r.cantidad : "sin stock",
    // Parcial: coincide con parte de la consulta (ej. es un burro pero no figura para ese auto).
    coincidencia: puntos === conceptos.length ? "completa" : "parcial",
  }));
}

const COLUMNAS = ["nombre", "marca", "codigo", "codigo_barras", "categoria", "compatibilidad", "descripcion"];
const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "para", "con", "un", "una", "y", "o", "en", "por", "que"]);
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// Cómo se dice lo mismo en el mostrador y cómo puede estar cargado en el stock.
const SINONIMOS = [
  ["burro", "arranque"],
  ["optica", "faro"],
  ["parrilla", "bandeja", "brazo"],
  ["paragolpe", "paragolpes"],
  ["amortiguador", "amortiguadores"],
  ["volkswagen", "volswagen", "wolkswagen", "vw"],
  ["chevrolet", "chevy"],
  ["mercedes", "benz"],
];

function variantes(palabra: string) {
  const p = sinAcentos(palabra);
  const grupo = SINONIMOS.find((g) => g.includes(p));
  // Las de 2 letras (ej. "vw") solo valen como sinónimo, no como búsqueda suelta.
  return [...new Set([palabra, p, ...(grupo ?? [])])].filter((v) => v.length > 2 || grupo?.includes(v));
}
