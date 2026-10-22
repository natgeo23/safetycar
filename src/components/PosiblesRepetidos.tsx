"use client";

import type { Parecido } from "@/lib/parecidos";

// Aviso de "¿ya lo tenés?": muestra los repuestos parecidos del stock con su foto,
// para sumar una unidad al existente en vez de crear un duplicado.
export function PosiblesRepetidos({ parecidos, accion, onElegir, ocupado }: {
  parecidos: Parecido[];
  accion: string;
  onElegir: (p: Parecido) => void;
  ocupado?: boolean;
}) {
  if (!parecidos.length) return null;
  return (
    <section className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3">
      <p className="mb-2 text-sm font-semibold text-amber-200">¿Ya lo tenés? Hay {parecidos.length === 1 ? "uno parecido" : "parecidos"} en stock:</p>
      <ul className="space-y-2">
        {parecidos.map((p) => (
          <li key={p.repuesto.id} className="rounded-xl bg-ink/60 p-2">
            <div className="flex items-center gap-3">
              {p.repuesto.fotos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.repuesto.fotos[0]} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-surface text-mute">⚙</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold leading-tight">{p.repuesto.nombre}</p>
                <p className="truncate text-xs text-mute">{[p.repuesto.compatibilidad, p.repuesto.ubicacion && `📍 ${p.repuesto.ubicacion}`].filter(Boolean).join(" · ")}</p>
                <p className="text-xs text-amber-200/80">{p.motivo} · {p.repuesto.cantidad} en stock</p>
              </div>
            </div>
            <button type="button" onClick={() => onElegir(p)} disabled={ocupado}
              className="mt-2 w-full rounded-lg bg-amber-300 py-2.5 text-sm font-bold text-ink active:scale-[0.98] disabled:opacity-50">
              {accion}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-mute">Si es otro repuesto, seguí normalmente.</p>
    </section>
  );
}
