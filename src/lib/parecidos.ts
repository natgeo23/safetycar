import type { Repuesto } from "@/lib/types";

// Detección de repetidos por texto: compara la ficha nueva con el stock de la misma categoría.
// No usa IA (es instantáneo y gratis); la IA ya normalizó nombre, categoría y compatibilidad.

const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "y", "con", "para", "sin", "a", "en", "x"]);

function palabras(s: string | null | undefined) {
  return new Set(
    plano(s ?? "")
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length > 1 && !VACIAS.has(p))
      .map((p) => (p.length > 4 ? p.replace(/s$/, "") : p)), // "guardabarros" = "guardabarro"
  );
}

// Lados y posiciones: si uno dice "izquierdo" y el otro "derecho", no son el mismo repuesto.
const OPUESTOS: [RegExp, RegExp][] = [
  [/\bizq/, /\bder/],
  [/\bdelanter/, /\btraser/],
  [/\bsuperior/, /\binferior/],
];

function ladosChocan(a: string, b: string) {
  return OPUESTOS.some(([x, y]) => (x.test(a) && y.test(b)) || (y.test(a) && x.test(b)));
}

// Parecido entre 0 y 1 según palabras en común (Jaccard).
function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let comunes = 0;
  for (const p of a) if (b.has(p)) comunes++;
  return comunes / (a.size + b.size - comunes);
}

export type Ficha = Pick<Repuesto, "nombre" | "marca" | "codigo" | "codigo_barras" | "categoria" | "compatibilidad">;
export type Parecido = { repuesto: Repuesto; motivo: string };

export function buscarParecidos(f: Ficha, stock: Repuesto[], excluirId?: string, max = 3): Parecido[] {
  const nombre = plano(f.nombre);
  const pNombre = palabras(f.nombre);
  const pAuto = palabras(`${f.marca ?? ""} ${f.compatibilidad ?? ""}`);
  const codigo = plano(f.codigo ?? "").replace(/[^a-z0-9]/g, "");
  const barras = (f.codigo_barras ?? "").trim();

  const puntajes: { repuesto: Repuesto; puntaje: number; motivo: string }[] = [];
  for (const r of stock) {
    if (r.id === excluirId) continue;

    // Mismo código de barras o de pieza: casi seguro es el mismo.
    if (barras && r.codigo_barras?.trim() === barras) {
      puntajes.push({ repuesto: r, puntaje: 2, motivo: "Mismo código de barras" });
      continue;
    }
    const rCodigo = plano(r.codigo ?? "").replace(/[^a-z0-9]/g, "");
    if (codigo.length >= 4 && rCodigo === codigo) {
      puntajes.push({ repuesto: r, puntaje: 1.9, motivo: "Mismo código de pieza" });
      continue;
    }

    if (f.categoria && r.categoria && f.categoria !== r.categoria) continue;
    if (ladosChocan(nombre, plano(r.nombre))) continue;

    const sNombre = jaccard(pNombre, palabras(r.nombre));
    const rAuto = palabras(`${r.marca ?? ""} ${r.compatibilidad ?? ""}`);
    const sAuto = jaccard(pAuto, rAuto);
    if (pAuto.size && rAuto.size && sAuto === 0) continue; // autos distintos
    // El nombre pesa más; el auto confirma (una puerta de Peugeot no es repetida de una de Fiat).
    const puntaje = sNombre * 0.65 + sAuto * 0.35;
    if (sNombre >= 0.5 && puntaje >= 0.45) {
      puntajes.push({ repuesto: r, puntaje, motivo: sAuto >= 0.3 ? "Mismo repuesto y auto" : "Nombre muy parecido" });
    }
  }
  return puntajes
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, max)
    .map(({ repuesto, motivo }) => ({ repuesto, motivo }));
}
