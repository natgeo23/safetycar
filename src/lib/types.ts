export const ESTADOS = ["nuevo", "usado", "reacondicionado", "para_reparar"] as const;
export type Estado = (typeof ESTADOS)[number];

export const ESTADO_LABEL: Record<Estado, string> = {
  nuevo: "Nuevo",
  usado: "Usado",
  reacondicionado: "Reacondicionado",
  para_reparar: "Para reparar",
};

export type Repuesto = {
  id: string;
  created_at: string;
  nombre: string;
  marca: string | null;
  codigo: string | null;
  codigo_barras: string | null;
  categoria: string | null;
  compatibilidad: string | null;
  descripcion: string | null;
  estado: Estado;
  cantidad: number;
  stock_minimo: number;
  ubicacion: string | null;
  precio: number | null;
  fotos: string[];
};

export type RepuestoInput = Omit<Repuesto, "id" | "created_at">;

// Campos que el usuario puede editar (whitelist para insert/update).
export const CAMPOS_EDITABLES = [
  "nombre", "marca", "codigo", "codigo_barras", "categoria", "compatibilidad",
  "descripcion", "estado", "cantidad", "stock_minimo", "ubicacion", "precio", "fotos",
] as const;

export function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of CAMPOS_EDITABLES) if (k in body) out[k] = body[k] === "" ? null : body[k];
  return out;
}
