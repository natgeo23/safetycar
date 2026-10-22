"use client";

import { useState } from "react";
import { CATEGORIAS } from "@/lib/categorias";

// Hoja inferior para elegir una o varias categorías. Solo muestra las que tienen repuestos.
export function FiltroCategorias({ conteo, seleccion, sinCategoria, onAplicar, onCerrar }: {
  conteo: Map<string, number>;
  seleccion: string[];
  sinCategoria: string | null;
  onAplicar: (sel: string[]) => void;
  onCerrar: () => void;
}) {
  const [sel, setSel] = useState<string[]>(seleccion);
  const opciones = [...CATEGORIAS, ...(sinCategoria ? [sinCategoria] : [])].filter((c) => conteo.get(c));
  const total = sel.length ? sel.reduce((s, c) => s + (conteo.get(c) ?? 0), 0) : [...conteo.values()].reduce((a, b) => a + b, 0);
  const alternar = (c: string) => setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onCerrar}>
      <div onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-3xl rounded-t-3xl border-t border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Categorías</h2>
          {sel.length > 0 && <button onClick={() => setSel([])} className="text-sm text-mute underline">Limpiar</button>}
        </div>
        <div className="flex max-h-[50dvh] flex-wrap gap-2 overflow-y-auto">
          {opciones.map((c) => {
            const activa = sel.includes(c);
            return (
              <button key={c} onClick={() => alternar(c)} aria-pressed={activa}
                className={`rounded-full border px-4 py-2 text-sm ${activa ? "border-brand bg-brand text-ink font-semibold" : "border-line bg-ink text-light"}`}>
                {c} <span className={activa ? "text-ink/70" : "text-mute"}>{conteo.get(c)}</span>
              </button>
            );
          })}
          {!opciones.length && <p className="text-mute">Todavía no hay categorías.</p>}
        </div>
        <button onClick={() => onAplicar(sel)} className="mt-5 w-full rounded-xl bg-brand py-4 text-lg font-bold text-ink">
          Ver {total} {total === 1 ? "repuesto" : "repuestos"}
        </button>
      </div>
    </div>
  );
}
