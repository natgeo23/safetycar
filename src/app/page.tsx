"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiltroCategorias } from "@/components/FiltroCategorias";
import { IconoFiltro, IconoGrilla, IconoImportar, IconoLista } from "@/components/Iconos";
import { Logo } from "@/components/Logo";
import { CATEGORIAS } from "@/lib/categorias";
import { usePreferencia } from "@/lib/preferencias";
import type { Repuesto } from "@/lib/types";

type Vista = "lista" | 2 | 3 | 4;
const VISTAS: Vista[] = ["lista", 2, 3, 4];
const SIN_CATEGORIA = "Sin categoría";

const GRILLA: Record<2 | 3 | 4, string> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };

// Lo que no es una categoría fija (vacío o texto viejo) va a "Sin categoría" hasta clasificarlo.
const categoriaDe = (r: Repuesto) =>
  (CATEGORIAS as readonly string[]).includes(r.categoria ?? "") ? r.categoria! : SIN_CATEGORIA;

// Búsqueda sin tildes ni mayúsculas.
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function obtenerStock(): Promise<Repuesto[]> {
  const res = await fetch("/api/repuestos", { cache: "no-store" });
  const data = await res.json().catch(() => ({ error: "No se pudo conectar con el servidor" }));
  if (!res.ok) throw new Error(data.error);
  return data;
}

export default function Stock() {
  const [items, setItems] = useState<Repuesto[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = usePreferencia<Vista>("sc-vista", "lista");
  const [filtro, setFiltro] = usePreferencia<string[]>("sc-filtro", []);
  const [plegadas, setPlegadas] = usePreferencia<string[]>("sc-plegadas", []);
  const [filtroAbierto, setFiltroAbierto] = useState(false);
  const [clasificando, setClasificando] = useState(false);

  const cargar = useCallback(
    () =>
      obtenerStock()
        .then((data) => { setItems(data); setError(null); })
        .catch((e: Error) => setError(e.message || "No se pudo cargar el stock")),
    [],
  );

  // Se vuelve a pedir cada vez que la pantalla se muestra (por ejemplo, al volver de editar).
  useEffect(() => {
    let vigente = true;
    obtenerStock()
      .then((data) => { if (vigente) { setItems(data); setError(null); } })
      .catch((e: Error) => vigente && setError(e.message || "No se pudo cargar el stock"));
    return () => { vigente = false; };
  }, []);

  const conteo = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of items ?? []) m.set(categoriaDe(r), (m.get(categoriaDe(r)) ?? 0) + 1);
    return m;
  }, [items]);

  const visibles = useMemo(() => {
    const t = plano(q.trim());
    return (items ?? []).filter((r) => {
      if (filtro.length && !filtro.includes(categoriaDe(r))) return false;
      if (!t) return true;
      const texto = plano([r.nombre, r.marca, r.codigo, r.codigo_barras, r.compatibilidad, r.categoria, r.ubicacion, r.descripcion]
        .filter(Boolean).join(" "));
      return t.split(/\s+/).every((p) => texto.includes(p));
    });
  }, [items, q, filtro]);

  // Agrupado por categoría, en el orden fijo de la lista y "Sin categoría" al final.
  const grupos = useMemo(() => {
    const orden = [...CATEGORIAS, SIN_CATEGORIA] as string[];
    const m = new Map<string, Repuesto[]>();
    for (const r of visibles) m.set(categoriaDe(r), [...(m.get(categoriaDe(r)) ?? []), r]);
    return [...m.entries()].sort(([a], [b]) => orden.indexOf(a) - orden.indexOf(b));
  }, [visibles]);

  const buscando = q.trim().length > 0;
  const todasPlegadas = grupos.length > 0 && grupos.every(([c]) => plegadas.includes(c));
  const alternarPlegada = (c: string) =>
    setPlegadas(plegadas.includes(c) ? plegadas.filter((x) => x !== c) : [...plegadas, c]);

  const unidades = visibles.reduce((s, x) => s + x.cantidad, 0);
  const aRevisar = items?.filter((r) => r.revisar).length ?? 0;
  const sinCategoria = conteo.get(SIN_CATEGORIA) ?? 0;

  async function clasificar() {
    setClasificando(true);
    const res = await fetch("/api/repuestos/clasificar", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "No se pudo clasificar");
    await cargar();
    setClasificando(false);
  }

  const siguienteVista = () => setVista(VISTAS[(VISTAS.indexOf(vista) + 1) % VISTAS.length]);
  const boton = "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-light active:scale-95";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <Logo className="text-2xl" />
        {items && <p className="text-right text-sm text-mute">{visibles.length} ítems · {unidades} u.</p>}
      </header>

      <div className="flex gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, marca, código, auto…"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-base placeholder:text-mute focus:border-brand focus:outline-none"
        />
        <button onClick={() => setFiltroAbierto(true)} aria-label="Filtrar por categoría"
          className={`${boton} relative ${filtro.length ? "border-brand text-brand" : ""}`}>
          <IconoFiltro />
          {filtro.length > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-ink">
              {filtro.length}
            </span>
          )}
        </button>
        <button onClick={siguienteVista} className={boton}
          aria-label={vista === "lista" ? "Vista en lista (cambiar a grilla)" : `Grilla de ${vista} columnas (cambiar)`}>
          {vista === "lista" ? <IconoLista /> : <IconoGrilla columnas={vista} />}
        </button>
      </div>

      {filtro.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {filtro.map((c) => (
            <button key={c} onClick={() => setFiltro(filtro.filter((x) => x !== c))}
              className="rounded-full bg-brand/15 px-3 py-1 text-sm text-brand">
              {c} ✕
            </button>
          ))}
        </div>
      )}

      {aRevisar > 0 && (
        <Link href="/revisar" className="mt-3 flex items-center justify-between rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-amber-200">
          <span><b>{aRevisar}</b> {aRevisar === 1 ? "importado para revisar" : "importados para revisar"}</span>
          <span className="whitespace-nowrap font-semibold">Revisar →</span>
        </Link>
      )}

      {error && <p className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{error}</p>}

      {!items && !error && (
        <div className="mt-4 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />)}</div>
      )}

      {items && visibles.length === 0 && (
        <div className="mt-16 text-center text-mute">
          <p className="text-lg">{items.length ? "Sin resultados" : "Todavía no hay repuestos cargados"}</p>
          {!items.length && <p className="mt-1 text-sm">Tocá el botón verde para empezar</p>}
        </div>
      )}

      {grupos.length > 1 && !buscando && (
        <div className="mt-3 flex justify-end">
          <button onClick={() => setPlegadas(todasPlegadas ? [] : grupos.map(([c]) => c))} className="text-sm text-mute underline">
            {todasPlegadas ? "Desplegar todas" : "Plegar todas"}
          </button>
        </div>
      )}

      {grupos.map(([categoria, lista]) => {
        // Mientras se busca se muestran todas, para no esconder resultados.
        const abierta = buscando || !plegadas.includes(categoria);
        return (
          <section key={categoria} className="mt-3">
            <h2 className="sticky top-0 z-10 -mx-4 flex items-center justify-between bg-ink/95 px-4 backdrop-blur">
              <button onClick={() => alternarPlegada(categoria)} aria-expanded={abierta}
                className="flex flex-1 items-center gap-2 py-3 text-left">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  strokeLinejoin="round" aria-hidden className={`text-mute transition-transform ${abierta ? "rotate-90" : ""}`}>
                  <path d="m9 6 6 6-6 6" />
                </svg>
                <span className="text-sm font-bold uppercase tracking-wide text-light">
                  {categoria} <span className="font-normal text-mute">· {lista.length}</span>
                </span>
              </button>
              {categoria === SIN_CATEGORIA && (
                <button onClick={clasificar} disabled={clasificando} className="py-3 text-sm text-brand disabled:opacity-50">
                  {clasificando ? "Clasificando…" : "Clasificar con IA"}
                </button>
              )}
            </h2>
            {abierta && (vista === "lista" ? (
              <ul className="space-y-2">
                {lista.map((r) => <FilaLista key={r.id} r={r} />)}
              </ul>
            ) : (
              <ul className={`grid gap-2 ${GRILLA[vista]}`}>
                {lista.map((r) => <Tarjeta key={r.id} r={r} columnas={vista} />)}
              </ul>
            ))}
          </section>
        );
      })}

      <div className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-3xl gap-3">
        <Link href="/importar" aria-label="Importar muchas fotos"
          className="flex w-16 items-center justify-center rounded-2xl border border-line bg-surface text-light active:scale-95">
          <IconoImportar />
        </Link>
        <Link href="/cargar"
          className="flex-1 rounded-2xl bg-brand py-5 text-center text-lg font-bold text-ink shadow-[0_8px_30px_rgba(32,180,134,0.35)] active:scale-[0.98]">
          + Cargar repuestos
        </Link>
      </div>

      {filtroAbierto && (
        <FiltroCategorias
          conteo={conteo}
          seleccion={filtro}
          sinCategoria={sinCategoria > 0 ? SIN_CATEGORIA : null}
          onAplicar={(sel) => { setFiltro(sel); setFiltroAbierto(false); }}
          onCerrar={() => setFiltroAbierto(false)}
        />
      )}
    </main>
  );
}

function Foto({ r, className }: { r: Repuesto; className: string }) {
  return r.fotos[0] ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={r.fotos[0]} alt="" loading="lazy" className={`object-cover ${className}`} />
  ) : (
    <div className={`flex items-center justify-center bg-ink text-2xl text-mute ${className}`}>⚙</div>
  );
}

function Cantidad({ r, className = "" }: { r: Repuesto; className?: string }) {
  return (
    <span className={`font-bold tabular-nums ${r.cantidad <= r.stock_minimo ? "text-amber-300" : "text-brand"} ${className}`}>
      {r.cantidad}
    </span>
  );
}

function FilaLista({ r }: { r: Repuesto }) {
  return (
    <li>
      <Link href={`/repuesto/${r.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 active:bg-line">
        <Foto r={r} className="h-16 w-16 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{r.nombre}</p>
          <p className="truncate text-sm text-mute">{[r.marca, r.compatibilidad, r.codigo].filter(Boolean).join(" · ") || "—"}</p>
          {r.ubicacion && <p className="truncate text-xs text-mute">📍 {r.ubicacion}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-center">
          <Cantidad r={r} className="text-xl" />
          <span className="text-[10px] uppercase text-mute">u.</span>
        </div>
      </Link>
    </li>
  );
}

function Tarjeta({ r, columnas }: { r: Repuesto; columnas: 2 | 3 | 4 }) {
  return (
    <li>
      <Link href={`/repuesto/${r.id}`} className="block overflow-hidden rounded-xl border border-line bg-surface active:bg-line">
        <div className="relative">
          <Foto r={r} className="aspect-square w-full" />
          <span className="absolute right-1 top-1 rounded-md bg-ink/85 px-1.5 py-0.5 text-xs">
            <Cantidad r={r} />
          </span>
          {r.revisar && <span className="absolute left-1 top-1 h-2.5 w-2.5 rounded-full bg-amber-400" aria-label="A revisar" />}
        </div>
        <p className={`line-clamp-2 px-2 py-1.5 leading-tight ${columnas === 4 ? "text-[11px]" : columnas === 3 ? "text-xs" : "text-sm font-semibold"}`}>
          {r.nombre}
        </p>
      </Link>
    </li>
  );
}
