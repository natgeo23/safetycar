"use client";

import { useCallback, useSyncExternalStore } from "react";

// Preferencias de vista guardadas en el navegador (vista lista/grilla, filtros). Si el storage
// no está disponible (modo privado), funciona igual con el valor por defecto.
const EVENTO = "sc-preferencias";

function leer(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function usePreferencia<T>(key: string, porDefecto: T): [T, (v: T) => void] {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener(EVENTO, cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(EVENTO, cb);
      window.removeEventListener("storage", cb);
    };
  }, []);
  const raw = useSyncExternalStore(subscribe, () => leer(key), () => null);

  let valor = porDefecto;
  if (raw !== null) {
    try {
      valor = JSON.parse(raw) as T;
    } catch {}
  }

  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {}
      window.dispatchEvent(new Event(EVENTO));
    },
    [key],
  );
  return [valor, set];
}
