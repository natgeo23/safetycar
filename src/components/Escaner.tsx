"use client";

import { useEffect, useRef, useState } from "react";

// Lector de código de barras con la cámara trasera. Se cierra solo al leer un código.
export function Escaner({ onCodigo, onCerrar }: { onCodigo: (c: string) => void; onCerrar: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let controls: { stop: () => void } | undefined;
    let cancelado = false;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current!,
          (result) => {
            if (result && !cancelado) {
              cancelado = true;
              navigator.vibrate?.(80);
              controls?.stop();
              onCodigo(result.getText());
            }
          },
        );
        if (cancelado) controls.stop();
      } catch {
        setError("No se pudo abrir la cámara. Revisá los permisos.");
      }
    })();
    return () => {
      cancelado = true;
      controls?.stop();
    };
  }, [onCodigo]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-32 -translate-y-1/2 rounded-xl border-2 border-brand" />
        <p className="absolute inset-x-0 top-6 text-center text-sm text-white/80">
          {error ?? "Apuntá al código de barras"}
        </p>
      </div>
      <button onClick={onCerrar} className="m-4 rounded-xl bg-surface py-4 font-semibold text-white">
        Cancelar
      </button>
    </div>
  );
}
