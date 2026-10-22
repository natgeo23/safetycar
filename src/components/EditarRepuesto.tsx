"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { BarraSuperior } from "@/components/BarraSuperior";
import { IconoCompartir } from "@/components/Iconos";
import { RepuestoForm, type FormValues } from "@/components/RepuestoForm";
import { GaleriaFotos } from "@/components/VisorFotos";
import { compartir, fotosComoArchivos } from "@/lib/compartir";
import type { Repuesto } from "@/lib/types";

const aForm = (d: Repuesto): FormValues => ({
  nombre: d.nombre, marca: d.marca, codigo: d.codigo, codigo_barras: d.codigo_barras,
  categoria: d.categoria, compatibilidad: d.compatibilidad, descripcion: d.descripcion,
  estado: d.estado, cantidad: d.cantidad, stock_minimo: d.stock_minimo,
  ubicacion: d.ubicacion, precio: d.precio,
});

// La cantidad se mueve con +/-, así que no cuenta como cambio del formulario.
const firma = (f: FormValues | null) => JSON.stringify(f ? { ...f, cantidad: 0 } : null);

export function EditarRepuesto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [rep, setRep] = useState<Repuesto | null>(null);
  const [form, setForm] = useState<FormValues | null>(null);
  const [original, setOriginal] = useState<string>("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const archivos = useRef<File[]>([]); // fotos ya descargadas, para compartir en el mismo toque

  useEffect(() => {
    fetch(`/api/repuestos/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Repuesto & { error?: string }) => {
        if (d.error) return setError(d.error);
        setRep(d);
        setForm(aForm(d));
        setOriginal(firma(aForm(d)));
        fotosComoArchivos(d).then((f) => (archivos.current = f));
      });
  }, [id]);

  const cambios = form !== null && firma(form) !== original;

  function mostrarAviso(t: string) {
    setAviso(t);
    setTimeout(() => setAviso(null), 2500);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setGuardando(true);
    setError(null);
    const res = await fetch(`/api/repuestos/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      // La cantidad no se edita acá: se mueve con +/- para que quede el registro en movimientos.
      body: JSON.stringify({ ...form, cantidad: undefined }),
    });
    setGuardando(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "No se pudo guardar");
    const d: Repuesto = await res.json();
    setRep(d);
    setOriginal(firma(form));
    mostrarAviso("✓ Cambios guardados");
  }

  async function ajustar(delta: number) {
    if (!rep) return;
    setRep({ ...rep, cantidad: Math.max(0, rep.cantidad + delta) });
    const res = await fetch(`/api/repuestos/${id}/stock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delta, motivo: delta > 0 ? "ingreso" : "egreso" }),
    });
    if (res.ok) {
      const { cantidad } = await res.json();
      setRep((r) => (r ? { ...r, cantidad } : r));
    } else {
      setError("No se pudo actualizar el stock");
    }
  }

  async function onCompartir() {
    if (!rep) return;
    // Comparte lo que se ve en pantalla, aunque todavía no esté guardado.
    const datos = form ? { ...rep, ...form, cantidad: rep.cantidad } : rep;
    // Sin esperas antes de compartir: Safari solo abre el menú si es parte directa del toque.
    await compartir(datos, archivos.current);
  }

  async function borrar() {
    if (!confirm(`¿Borrar "${rep?.nombre}" del stock? No se puede deshacer.`)) return;
    const res = await fetch(`/api/repuestos/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/");
    else setError("No se pudo borrar");
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-32">
      <BarraSuperior
        titulo={rep?.nombre ?? "Repuesto"}
        derecha={
          rep && (
            <button onClick={onCompartir} aria-label="Compartir por WhatsApp"
              className="flex h-11 w-11 items-center justify-center rounded-full text-brand active:bg-surface">
              <IconoCompartir />
            </button>
          )
        }
      />

      {aviso && (
        <div className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+4rem)] z-40 mx-auto max-w-xl rounded-xl bg-brand px-4 py-3 font-semibold text-ink shadow-lg">
          {aviso}
        </div>
      )}

      {error && <p className="mb-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{error}</p>}
      {!form && !error && <div className="h-96 animate-pulse rounded-xl bg-surface" />}

      {rep && <GaleriaFotos fotos={rep.fotos} />}

      {rep && (
        <section className="mb-6 flex items-center justify-between rounded-2xl border border-line bg-surface p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-mute">Stock</p>
            <p className={`text-4xl font-bold tabular-nums ${rep.cantidad <= rep.stock_minimo ? "text-amber-300" : "text-brand"}`}>
              {rep.cantidad}
            </p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => ajustar(-1)} disabled={rep.cantidad === 0} aria-label="Restar uno"
              className="h-14 w-14 rounded-xl bg-ink text-2xl disabled:opacity-30 active:scale-95">−</button>
            <button type="button" onClick={() => ajustar(1)} aria-label="Sumar uno"
              className="h-14 w-14 rounded-xl bg-ink text-2xl active:scale-95">+</button>
          </div>
        </section>
      )}

      {form && (
        <form onSubmit={guardar}>
          <RepuestoForm value={form} onChange={setForm} conCantidad={false} />

          <button type="button" onClick={onCompartir}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-brand/50 py-4 font-semibold text-brand active:bg-brand/10">
            <IconoCompartir /> Compartir por WhatsApp
          </button>

          {/* Borrar queda al final, lejos de las acciones de todos los días. */}
          <button type="button" onClick={borrar}
            className="mt-10 w-full rounded-xl py-3 text-sm text-red-300/80 active:bg-red-500/10">
            Borrar repuesto
          </button>

          <div className={`fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform ${cambios ? "translate-y-0" : "translate-y-full"}`}>
            <div className="mx-auto flex max-w-xl gap-3">
              <button type="button" onClick={() => setForm(rep && aForm(rep))} disabled={guardando}
                className="rounded-xl border border-line px-4 py-4 text-mute">
                Descartar
              </button>
              <button type="submit" disabled={guardando || !form.nombre.trim()}
                className="flex-1 rounded-xl bg-brand py-4 text-lg font-bold text-ink disabled:opacity-40">
                {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
