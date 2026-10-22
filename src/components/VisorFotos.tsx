"use client";

import { useEffect, useRef, useState } from "react";
import { IconoCerrar } from "@/components/Iconos";

// Fotos a todo el ancho; un toque abre el visor a pantalla completa, con deslizamiento entre fotos.
export function GaleriaFotos({ fotos }: { fotos: string[] }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const [actual, setActual] = useState(0);

  if (!fotos.length) return null;
  return (
    <>
      <div className="relative -mx-4 mb-4">
        <div
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
          onScroll={(e) => setActual(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        >
          {fotos.map((u, i) => (
            <button key={u} type="button" onClick={() => setAbierta(i)} className="w-full shrink-0 snap-center" aria-label={`Ver foto ${i + 1} en grande`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="aspect-[4/3] w-full bg-surface object-cover" />
            </button>
          ))}
        </div>
        {fotos.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {fotos.map((u, i) => (
              <span key={u} className={`h-1.5 rounded-full transition-all ${i === actual ? "w-4 bg-white" : "w-1.5 bg-white/50"}`} />
            ))}
          </div>
        )}
      </div>
      {abierta !== null && <VisorFotos fotos={fotos} inicial={abierta} onCerrar={() => setAbierta(null)} />}
    </>
  );
}

function VisorFotos({ fotos, inicial, onCerrar }: { fotos: string[]; inicial: number; onCerrar: () => void }) {
  const carril = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(inicial);

  useEffect(() => {
    const el = carril.current;
    if (el) el.scrollLeft = inicial * el.clientWidth;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [inicial, onCerrar]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <span className="px-3 text-sm text-white/70">{fotos.length > 1 ? `${actual + 1} / ${fotos.length}` : ""}</span>
        <button onClick={onCerrar} aria-label="Cerrar" className="flex h-12 w-12 items-center justify-center text-white">
          <IconoCerrar />
        </button>
      </div>
      <div
        ref={carril}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
        onScroll={(e) => setActual(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
      >
        {fotos.map((u) => (
          // touch-action permite el pellizco para hacer zoom sobre la foto.
          <div key={u} className="flex w-full shrink-0 snap-center items-center justify-center [touch-action:pan-x_pinch-zoom]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" className="max-h-full max-w-full object-contain" />
          </div>
        ))}
      </div>
      <div className="pb-[env(safe-area-inset-bottom)]" />
    </div>
  );
}
