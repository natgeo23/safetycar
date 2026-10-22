"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RepuestoForm, type FormValues } from "@/components/RepuestoForm";
import type { Repuesto } from "@/lib/types";

type ConIA = Repuesto & { ia_datos?: { dudas?: string | null; confianza?: string } | null };

const aForm = (r: Repuesto): FormValues => ({
  nombre: r.nombre === "Sin identificar" ? "" : r.nombre, marca: r.marca, codigo: r.codigo,
  codigo_barras: r.codigo_barras, categoria: r.categoria, compatibilidad: r.compatibilidad,
  descripcion: r.descripcion, estado: r.estado, cantidad: r.cantidad, stock_minimo: r.stock_minimo,
  ubicacion: r.ubicacion, precio: r.precio,
});

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(error);
  }
  return res.json();
}

// Cola de los repuestos importados en masa: uno por pantalla, para completar lo que falta rápido.
export default function Revisar() {
  const [cola, setCola] = useState<ConIA[] | null>(null);
  const [form, setForm] = useState<FormValues | null>(null);
  const [anterior, setAnterior] = useState<Repuesto | null>(null); // último guardado, para unir fotos
  const [revisados, setRevisados] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    fetch("/api/repuestos", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: ConIA[]) => {
        if (!vigente || !Array.isArray(data)) return;
        // Del más viejo al más nuevo: mismo orden en que se sacaron/importaron las fotos.
        const pendientes = data.filter((r) => r.revisar).reverse();
        setCola(pendientes);
        setForm(pendientes[0] ? aForm(pendientes[0]) : null);
      })
      .catch(() => vigente && setError("No se pudo cargar la lista"));
    return () => { vigente = false; };
  }, []);

  const actual = cola?.[0];

  // Pasa al siguiente de la cola (o, con alFinal, manda el actual al final sin perderlo).
  function mover(alFinal = false) {
    if (!cola) return;
    const resto = alFinal ? [...cola.slice(1), cola[0]] : cola.slice(1);
    setCola(resto);
    setForm(resto[0] ? aForm(resto[0]) : null);
    window.scrollTo({ top: 0 });
  }

  async function accion(fn: () => Promise<void>) {
    setOcupado(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!actual || !form) return;
    accion(async () => {
      const r = await api(`/api/repuestos/${actual.id}`, "PATCH", { ...form, revisar: false });
      setAnterior(r);
      setRevisados((n) => n + 1);
      mover();
    });
  };

  // Varias fotos del mismo repuesto: suma estas fotos al anterior y borra este duplicado.
  const unirConAnterior = () =>
    actual && anterior && accion(async () => {
      const r = await api(`/api/repuestos/${anterior.id}`, "PATCH", { fotos: [...anterior.fotos, ...actual.fotos] });
      await api(`/api/repuestos/${actual.id}`, "DELETE");
      setAnterior(r);
      mover();
    });

  const borrar = () =>
    actual && confirm("¿Borrar esta foto? No es un repuesto.") && accion(async () => {
      await api(`/api/repuestos/${actual.id}`, "DELETE");
      mover();
    });

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-36 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-mute">← Stock</Link>
        <h1 className="text-lg font-bold">Revisar importados</h1>
        <span className="min-w-12 text-right text-sm text-mute">{cola ? `${cola.length} ${cola.length === 1 ? "queda" : "quedan"}` : ""}</span>
      </header>

      {error && <p className="mb-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{error}</p>}
      {!cola && !error && <div className="h-96 animate-pulse rounded-xl bg-surface" />}

      {cola && !actual && (
        <div className="mt-16 text-center">
          <p className="text-2xl font-bold text-brand">¡Listo!</p>
          <p className="mt-2 text-mute">{revisados ? `Revisaste ${revisados} repuestos.` : "No hay repuestos para revisar."}</p>
          <Link href="/" className="mt-6 inline-block rounded-xl bg-brand px-6 py-3 font-bold text-ink">Ir al stock</Link>
        </div>
      )}

      {actual && form && (
        <form onSubmit={guardar}>
          <div className="mb-4 flex snap-x gap-2 overflow-x-auto">
            {actual.fotos.map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={u} src={u} alt="" className="max-h-72 w-full shrink-0 snap-start rounded-xl object-contain bg-surface" />
            ))}
          </div>

          {actual.ia_datos?.dudas && (
            <p className="mb-4 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">Verificá: {actual.ia_datos.dudas}</p>
          )}
          {!actual.ia_datos && (
            <p className="mb-4 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">La IA no pudo identificarlo: completalo a mano.</p>
          )}

          {anterior && (
            <button type="button" onClick={unirConAnterior} disabled={ocupado}
              className="mb-4 flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left active:border-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {anterior.fotos[0] && <img src={anterior.fotos[0]} alt="" className="h-12 w-12 rounded-lg object-cover" />}
              <span className="text-sm">
                <b>Es el mismo repuesto que el anterior</b>
                <span className="block text-mute">Sumar esta foto a “{anterior.nombre}”</span>
              </span>
            </button>
          )}

          <RepuestoForm value={form} onChange={setForm} resaltarFaltantes />

          <div className="fixed inset-x-0 bottom-0 border-t border-line bg-ink/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
            <div className="mx-auto flex max-w-xl gap-2">
              <button type="button" onClick={borrar} disabled={ocupado} className="rounded-xl border border-line px-3 py-4 text-sm text-red-300">
                Borrar
              </button>
              <button type="button" onClick={() => mover(true)} disabled={ocupado || cola!.length < 2} className="rounded-xl border border-line px-3 py-4 text-sm text-mute disabled:opacity-40">
                Saltar
              </button>
              <button type="submit" disabled={ocupado || !form.nombre.trim()}
                className="flex-1 rounded-xl bg-brand py-4 text-lg font-bold text-ink disabled:opacity-40">
                {ocupado ? "Guardando…" : "Listo, siguiente"}
              </button>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
