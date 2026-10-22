"use client";

import { CATEGORIAS } from "@/lib/categorias";
import { ESTADOS, ESTADO_LABEL, type RepuestoInput } from "@/lib/types";

export type FormValues = Omit<RepuestoInput, "fotos">;

export const VACIO: FormValues = {
  nombre: "", marca: null, codigo: null, codigo_barras: null, categoria: null, compatibilidad: null,
  descripcion: null, estado: "usado", cantidad: 1, stock_minimo: 0, ubicacion: null, precio: null,
};

const base =
  "w-full rounded-lg border bg-surface px-3 py-3 text-base text-white placeholder:text-mute focus:border-brand focus:outline-none";
const input = `${base} border-line`;

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-mute">{label}</span>
      {children}
    </label>
  );
}

export function RepuestoForm({ value, onChange, conCantidad = true, resaltarFaltantes = false }: {
  value: FormValues;
  onChange: (v: FormValues) => void;
  conCantidad?: boolean; // en el detalle el stock se mueve con +/-, no editando el número
  resaltarFaltantes?: boolean; // marca en ámbar los campos vacíos (cola de revisión)
}) {
  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => onChange({ ...value, [k]: v });
  const falta = (k: keyof FormValues) => resaltarFaltantes && (value[k] === null || value[k] === "");
  const cls = (k: keyof FormValues) => `${base} ${falta(k) ? "border-amber-400/70" : "border-line"}`;
  const txt = (k: keyof FormValues) => ({
    className: cls(k),
    value: (value[k] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never),
  });

  return (
    <div className="space-y-4">
      <Campo label="Nombre *">
        <input required {...txt("nombre")} placeholder="Ej: Alternador 90A" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Marca"><input {...txt("marca")} /></Campo>
        <Campo label="Código / OEM"><input {...txt("codigo")} /></Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Categoría">
          <select className={cls("categoria")} value={value.categoria ?? ""}
            onChange={(e) => set("categoria", e.target.value || null)}>
            <option value="">Sin categoría</option>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo label="Estado">
          <select className={input} value={value.estado} onChange={(e) => set("estado", e.target.value as FormValues["estado"])}>
            {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
          </select>
        </Campo>
      </div>
      <Campo label="Compatibilidad">
        <textarea rows={2} {...txt("compatibilidad")} placeholder="Marca, modelo, años, motor" />
      </Campo>
      <Campo label="Descripción">
        <textarea rows={3} {...txt("descripcion")} />
      </Campo>
      <div className={`grid gap-3 ${conCantidad ? "grid-cols-3" : "grid-cols-2"}`}>
        {conCantidad && (
          <Campo label="Cantidad">
            <input className={input} type="number" inputMode="numeric" min={0} value={value.cantidad}
              onChange={(e) => set("cantidad", Math.max(0, parseInt(e.target.value) || 0))} />
          </Campo>
        )}
        <Campo label="Ubicación"><input {...txt("ubicacion")} placeholder="Estante A3" /></Campo>
        <Campo label="Precio $">
          <input className={cls("precio")} type="number" inputMode="decimal" min={0} value={value.precio ?? ""}
            onChange={(e) => set("precio", e.target.value === "" ? null : Number(e.target.value))} />
        </Campo>
      </div>
      <Campo label="Código de barras"><input inputMode="numeric" {...txt("codigo_barras")} /></Campo>
    </div>
  );
}
