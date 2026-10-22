"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { RepuestoForm, type FormValues } from "@/components/RepuestoForm";
import type { Repuesto } from "@/lib/types";

export function EditarRepuesto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [rep, setRep] = useState<Repuesto | null>(null);
  const [form, setForm] = useState<FormValues | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/repuestos/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Repuesto & { error?: string }) => {
        if (d.error) return setError(d.error);
        setRep(d);
        setForm({
          nombre: d.nombre, marca: d.marca, codigo: d.codigo, codigo_barras: d.codigo_barras,
          categoria: d.categoria, compatibilidad: d.compatibilidad, descripcion: d.descripcion,
          estado: d.estado, cantidad: d.cantidad, stock_minimo: d.stock_minimo,
          ubicacion: d.ubicacion, precio: d.precio,
        });
      });
  }, [id]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const res = await fetch(`/api/repuestos/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      // La cantidad no se edita acá: se mueve con +/- para que quede el registro en movimientos.
      body: JSON.stringify({ ...form, cantidad: undefined }),
    });
    setGuardando(false);
    if (res.ok) router.push("/");
    else setError((await res.json()).error);
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

  async function borrar() {
    if (!confirm("¿Borrar este repuesto del stock?")) return;
    const res = await fetch(`/api/repuestos/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/");
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-32 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-mute">← Stock</Link>
        <h1 className="text-lg font-bold">Editar</h1>
        <button onClick={borrar} className="text-sm text-red-300">Borrar</button>
      </header>

      {error && <p className="mb-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{error}</p>}
      {!form && !error && <div className="h-96 animate-pulse rounded-xl bg-surface" />}

      {rep && rep.fotos.length > 0 && (
        <div className="mb-4 flex snap-x gap-2 overflow-x-auto">
          {rep.fotos.map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt="" className="h-48 shrink-0 snap-start rounded-xl object-cover" />
          ))}
        </div>
      )}

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
          <div className="fixed inset-x-0 bottom-0 border-t border-line bg-ink/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
            <button type="submit" disabled={guardando || !form.nombre.trim()}
              className="mx-auto block w-full max-w-xl rounded-xl bg-brand py-4 text-lg font-bold text-ink disabled:opacity-40">
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
