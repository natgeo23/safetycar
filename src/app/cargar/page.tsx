"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Escaner } from "@/components/Escaner";
import { RepuestoForm, VACIO, type FormValues } from "@/components/RepuestoForm";
import { cuadrosDeVideo, fotoDesdeArchivo, subirFotos, type Foto } from "@/lib/media";

type IA = { confianza: "alta" | "media" | "baja"; dudas: string | null };

export default function Cargar() {
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(VACIO);
  const [ia, setIa] = useState<IA | null>(null);
  const [iaRaw, setIaRaw] = useState<unknown>(null);
  const [estado, setEstado] = useState<"idle" | "procesando" | "analizando" | "guardando">("idle");
  const [error, setError] = useState<string | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [guardados, setGuardados] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  // Subidas en segundo plano: arrancan apenas se saca la foto.
  const subidas = useRef(new Map<string, Promise<string>>());
  const ultimaConsulta = useRef(0); // descarta respuestas de análisis viejos

  const fotoInput = useRef<HTMLInputElement>(null);
  const galeriaInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const analizar = useCallback(async (imgs: Foto[], cod: string | null) => {
    const n = ++ultimaConsulta.current;
    setEstado("analizando");
    setError(null);
    try {
      const res = await fetch("/api/analizar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imagenes: imgs.slice(0, 8).map((f) => ({ data: f.base64, media_type: "image/jpeg" })),
          codigo_barras: cod ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({ error: "No se pudo conectar con el servidor" }));
      if (n !== ultimaConsulta.current) return;
      if (!res.ok) throw new Error(data.error ?? "Error al analizar");
      setIaRaw(data);
      setIa({ confianza: data.confianza, dudas: data.dudas });
      setForm((f) => ({
        ...f,
        nombre: data.nombre ?? f.nombre,
        marca: data.marca ?? f.marca,
        codigo: data.codigo ?? f.codigo,
        codigo_barras: cod ?? data.codigo_barras ?? f.codigo_barras,
        categoria: data.categoria ?? f.categoria,
        compatibilidad: data.compatibilidad ?? f.compatibilidad,
        descripcion: data.descripcion ?? f.descripcion,
        estado: data.estado ?? f.estado,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (n === ultimaConsulta.current) setEstado("idle");
    }
  }, []);

  function agregar(nuevas: Foto[]) {
    for (const f of nuevas) {
      const p = subirFotos([f]).then((u) => u[0]);
      p.catch(() => {}); // el error se muestra al guardar
      subidas.current.set(f.id, p);
    }
    const todas = [...fotos, ...nuevas];
    setFotos(todas);
    analizar(todas, codigo);
  }

  async function onArchivos(files: FileList | null, tipo: "foto" | "video") {
    if (!files?.length) return;
    setEstado("procesando");
    try {
      const nuevas =
        tipo === "video"
          ? await cuadrosDeVideo(files[0])
          : await Promise.all(Array.from(files).map(fotoDesdeArchivo));
      agregar(nuevas);
    } catch (e) {
      setError((e as Error).message);
      setEstado("idle");
    }
  }

  const onCodigo = useCallback(
    (c: string) => {
      setEscaneando(false);
      setCodigo(c);
      setForm((f) => ({ ...f, codigo_barras: c }));
      analizar(fotos, c);
    },
    [analizar, fotos],
  );

  function quitar(id: string) {
    subidas.current.delete(id);
    setFotos((fs) => fs.filter((f) => f.id !== id));
  }

  function reiniciar() {
    ultimaConsulta.current++;
    fotos.forEach((f) => URL.revokeObjectURL(f.url));
    subidas.current.clear();
    setFotos([]);
    setCodigo(null);
    setForm(VACIO);
    setIa(null);
    setIaRaw(null);
    setError(null);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) return setError("Poné al menos el nombre");
    setEstado("guardando");
    setError(null);
    try {
      const urls = await Promise.all(fotos.map((f) => subidas.current.get(f.id)!));
      const res = await fetch("/api/repuestos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, fotos: urls, ia_datos: iaRaw }),
      });
      const data = await res.json().catch(() => ({ error: "No se pudo conectar con el servidor" }));
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      setGuardados((n) => n + 1);
      setAviso(`✓ ${form.nombre} guardado`);
      setTimeout(() => setAviso(null), 2500);
      reiniciar();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEstado("idle");
    }
  }

  const ocupado = estado !== "idle";
  const hayMedia = fotos.length > 0 || codigo;

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-32 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-mute">← Stock</Link>
        <h1 className="text-lg font-bold">Cargar repuesto</h1>
        <span className="min-w-12 text-right text-sm text-brand">{guardados > 0 && `${guardados} hoy`}</span>
      </header>

      {aviso && (
        <div className="fixed inset-x-4 top-4 z-40 mx-auto max-w-xl rounded-xl bg-brand px-4 py-3 font-semibold text-ink shadow-lg">
          {aviso}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <BotonCaptura label="Foto" icon="📷" onClick={() => fotoInput.current?.click()} disabled={ocupado} />
        <BotonCaptura label="Video" icon="🎥" onClick={() => videoInput.current?.click()} disabled={ocupado} />
        <BotonCaptura label="Código" icon="▥" onClick={() => setEscaneando(true)} disabled={ocupado} />
      </div>
      <button type="button" onClick={() => galeriaInput.current?.click()} className="mt-2 w-full py-2 text-sm text-mute underline">
        o elegir fotos de la galería
      </button>

      <input ref={fotoInput} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { onArchivos(e.target.files, "foto"); e.target.value = ""; }} />
      <input ref={galeriaInput} type="file" accept="image/*" multiple hidden
        onChange={(e) => { onArchivos(e.target.files, "foto"); e.target.value = ""; }} />
      <input ref={videoInput} type="file" accept="video/*" capture="environment" hidden
        onChange={(e) => { onArchivos(e.target.files, "video"); e.target.value = ""; }} />

      {hayMedia && (
        <section className="mt-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {fotos.map((f) => (
              <div key={f.id} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                <button type="button" onClick={() => quitar(f.id)} aria-label="Quitar foto"
                  className="absolute -right-1 -top-1 h-6 w-6 rounded-full bg-ink text-xs text-white ring-1 ring-line">✕</button>
              </div>
            ))}
            {codigo && (
              <div className="flex h-20 shrink-0 items-center rounded-lg bg-surface px-3 font-mono text-sm">▥ {codigo}</div>
            )}
          </div>
        </section>
      )}

      {(estado === "procesando" || estado === "analizando") && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-brand/40 bg-brand/10 p-4">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <span>{estado === "procesando" ? "Procesando…" : "La IA está identificando el repuesto…"}</span>
        </div>
      )}

      {ia && estado === "idle" && (
        <div className={`mt-4 rounded-xl p-3 text-sm ${ia.confianza === "baja" ? "bg-amber-500/15 text-amber-200" : "bg-brand/10 text-brand"}`}>
          Confianza {ia.confianza}. {ia.dudas && <span className="text-white/80">Verificá: {ia.dudas}</span>}
          {fotos.length > 0 && (
            <button type="button" onClick={() => analizar(fotos, codigo)} className="ml-1 underline">Re-analizar</button>
          )}
        </div>
      )}

      {error && <p className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{error}</p>}

      <form onSubmit={guardar} className="mt-6">
        <RepuestoForm value={form} onChange={setForm} />
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-ink/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-xl gap-3">
            <button type="button" onClick={reiniciar} disabled={ocupado} className="rounded-xl border border-line px-4 py-4 text-mute">
              Limpiar
            </button>
            <button type="submit" disabled={ocupado || !form.nombre.trim()}
              className="flex-1 rounded-xl bg-brand py-4 text-lg font-bold text-ink disabled:opacity-40">
              {estado === "guardando" ? "Guardando…" : "Guardar y cargar otro"}
            </button>
          </div>
        </div>
      </form>

      {escaneando && <Escaner onCodigo={onCodigo} onCerrar={() => setEscaneando(false)} />}
    </main>
  );
}

function BotonCaptura({ label, icon, onClick, disabled }: { label: string; icon: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-white active:scale-95 active:border-brand disabled:opacity-50">
      <span className="text-3xl" aria-hidden>{icon}</span>
      <span className="font-semibold">{label}</span>
    </button>
  );
}
