"use client";

import { useRouter } from "next/navigation";
import { IconoVolver } from "@/components/Iconos";

// Barra fija de las pantallas internas, estilo app: volver grande a la izquierda, título y una acción a la derecha.
export function BarraSuperior({ titulo, derecha }: { titulo: string; derecha?: React.ReactNode }) {
  const router = useRouter();
  // Volver con el historial conserva el scroll y los filtros del stock; si se entró directo, va al inicio.
  const volver = () => (window.history.length > 1 ? router.back() : router.push("/"));

  return (
    <header className="sticky top-0 z-30 -mx-4 mb-4 mt-[calc(-1*env(safe-area-inset-top))] border-b border-line/60 bg-ink/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 items-center gap-1 px-1">
        <button onClick={volver} aria-label="Volver" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-light active:bg-surface">
          <IconoVolver />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-base font-bold">{titulo}</h1>
        <div className="flex min-w-11 shrink-0 items-center justify-end pr-2">{derecha}</div>
      </div>
    </header>
  );
}
