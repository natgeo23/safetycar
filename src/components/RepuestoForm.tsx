"use client";

import { ESTADOS, ESTADO_LABEL, type RepuestoInput } from "@/lib/types";

export type FormValues = Omit<RepuestoInput, "fotos">;

export const VACIO: FormValues = {
  nombre: "", marca: null, codigo: null, codigo_barras: null, categoria: null, compatibilidad: null,
  descripcion: null, estado: "usado", cantidad: 1, stock_minimo: 0, ubicacion: null, precio: null,
};

const input =
  "w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-white placeholder:text-mute focus:border-brand focus:outline-none";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-mute">{label}</span>
      {children}
    </label>
  );
}

export function RepuestoForm({ value, onChange }: { value: FormValues; onChange: (v: FormValues) => void }) {
  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => onChange({ ...value, [k]: v });
  const txt = (k: keyof FormValues) => ({
    value: (value[k] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never),
  });

  return (
    <div className="space-y-4">
      <Campo label="Nombre *">
        <input className={input} required {...txt("nombre")} placeholder="Ej: Alternador 90A" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Marca"><input className={input} {...txt("marca")} /></Campo>
        <Campo label="Código / OEM"><input className={input} {...txt("codigo")} /></Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Categoría"><input className={input} {...txt("categoria")} /></Campo>
        <Campo label="Estado">
          <select className={input} value={value.estado} onChange={(e) => set("estado", e.target.value as FormValues["estado"])}>
            {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
          </select>
        </Campo>
      </div>
      <Campo label="Compatibilidad">
        <textarea className={input} rows={2} {...txt("compatibilidad")} placeholder="Marca, modelo, años, motor" />
      </Campo>
      <Campo label="Descripción">
        <textarea className={input} rows={3} {...txt("descripcion")} />
      </Campo>
      <div className="grid grid-cols-3 gap-3">
        <Campo label="Cantidad">
          <input className={input} type="number" inputMode="numeric" min={0} value={value.cantidad}
            onChange={(e) => set("cantidad", Math.max(0, parseInt(e.target.value) || 0))} />
        </Campo>
        <Campo label="Ubicación"><input className={input} {...txt("ubicacion")} placeholder="Estante A3" /></Campo>
        <Campo label="Precio $">
          <input className={input} type="number" inputMode="decimal" min={0} value={value.precio ?? ""}
            onChange={(e) => set("precio", e.target.value === "" ? null : Number(e.target.value))} />
        </Campo>
      </div>
      <Campo label="Código de barras"><input className={input} inputMode="numeric" {...txt("codigo_barras")} /></Campo>
    </div>
  );
}
