"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Repuesto } from "@/lib/types";

export default function Stock() {
  const [items, setItems] = useState<Repuesto[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/repuestos?q=${encodeURIComponent(q)}`, { signal: ctrl.signal, cache: "no-store" });
        const data = await res.json().catch(() => ({ error: "No se pudo conectar con el servidor" }));
        if (!res.ok) throw new Error(data.error);
        setItems(data);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message || "No se pudo cargar el stock");
      }
    }, q ? 250 : 0);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  async function ajustar(id: string, delta: number) {
    setItems((xs) => xs?.map((x) => (x.id === id ? { ...x, cantidad: Math.max(0, x.cantidad + delta) } : x)) ?? null);
    const res = await fetch(`/api/repuestos/${id}/stock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delta, motivo: delta > 0 ? "ingreso" : "egreso" }),
    });
    if (res.ok) {
      const { cantidad } = await res.json();
      setItems((xs) => xs?.map((x) => (x.id === id ? { ...x, cantidad } : x)) ?? null);
    }
  }

  const unidades = items?.reduce((s, x) => s + x.cantidad, 0) ?? 0;

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-32 pt-4">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <p className="logo text-2xl">Safetycar</p>
          <div className="mt-1 h-0.5 w-24 bg-brand" />
        </div>
        {items && <p className="text-right text-sm text-mute">{items.length} ítems · {unidades} u.</p>}
      </header>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre, marca, código, auto…"
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base placeholder:text-mute focus:border-brand focus:outline-none"
      />

      {error && <p className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{error}</p>}

      {!items && !error && (
        <div className="mt-4 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />)}</div>
      )}

      {items?.length === 0 && (
        <div className="mt-16 text-center text-mute">
          <p className="text-lg">{q ? "Sin resultados" : "Todavía no hay repuestos cargados"}</p>
          {!q && <p className="mt-1 text-sm">Tocá el botón verde para empezar</p>}
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {items?.map((r) => (
          <li key={r.id} className="flex gap-3 rounded-xl border border-line bg-surface p-3">
            <Link href={`/repuesto/${r.id}`} className="flex min-w-0 flex-1 gap-3">
              {r.fotos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.fotos[0]} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-ink text-2xl text-mute">⚙</div>
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold">{r.nombre}</p>
                <p className="truncate text-sm text-mute">{[r.marca, r.codigo].filter(Boolean).join(" · ") || "—"}</p>
                {r.ubicacion && <p className="truncate text-xs text-mute">📍 {r.ubicacion}</p>}
              </div>
            </Link>
            <div className="flex shrink-0 flex-col items-center justify-between">
              <button onClick={() => ajustar(r.id, 1)} className="h-8 w-10 rounded-lg bg-ink text-lg" aria-label="Sumar uno">+</button>
              <span className={`font-bold ${r.cantidad <= r.stock_minimo ? "text-amber-300" : "text-brand"}`}>{r.cantidad}</span>
              <button onClick={() => ajustar(r.id, -1)} disabled={r.cantidad === 0} className="h-8 w-10 rounded-lg bg-ink text-lg disabled:opacity-30" aria-label="Restar uno">−</button>
            </div>
          </li>
        ))}
      </ul>

      <Link
        href="/cargar"
        className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] mx-auto block max-w-xl rounded-2xl bg-brand py-5 text-center text-lg font-bold text-ink shadow-[0_8px_30px_rgba(0,214,107,0.35)] active:scale-[0.98]"
      >
        + Cargar repuestos
      </Link>
    </main>
  );
}
