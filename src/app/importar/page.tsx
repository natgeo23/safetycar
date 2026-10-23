"use client";

import Link from "next/link";
import { BarraSuperior } from "@/components/BarraSuperior";
import { useEffect, useRef, useState } from "react";
import { fotoDesdeArchivo, subirFotos } from "@/lib/media";
import { ESTADOS, ESTADO_LABEL, type Estado } from "@/lib/types";

// Cuántas fotos se procesan a la vez. Más rápido sin saturar a Gemini ni la conexión del celu.
const EN_PARALELO = 4;
const CLAVE_HECHAS = "sc-importadas";

type Hecho = { nombre: string; url?: string; error?: boolean };

// Huella de cada archivo para no importar dos veces la misma foto si se corta y se vuelve a elegir.
const huella = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

function leerHechas(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE_HECHAS) ?? "[]"));
  } catch {
    return new Set();
  }
}

function guardarHecha(h: string) {
  try {
    const s = leerHechas();
    s.add(h);
    localStorage.setItem(CLAVE_HECHAS, JSON.stringify([...s].slice(-5000)));
  } catch {}
}

async function analizar(base64: string) {
  for (let intento = 0; intento < 2; intento++) {
    const res = await fetch("/api/analizar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imagenes: [{ data: base64, media_type: "image/jpeg" }] }),
      signal: AbortSignal.timeout(55_000), // el servidor corta a los 45 s; esto cubre una conexión colgada
    }).catch(() => null);
    if (res?.ok) return res.json();
  }
  return null; // sin IA igual se crea el repuesto con la foto, para completarlo en la revisión
}

// Ninguna foto puede trabar la importación: si en este tiempo no terminó, se marca con error y se sigue.
const MAX_POR_FOTO = 150_000;

function conLimite<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, err) => setTimeout(() => err(new Error("Tardó demasiado")), ms))]);
}

async function importarUna(file: File, ubicacion: string, estado: Estado): Promise<Hecho> {
  const foto = await fotoDesdeArchivo(file);
  // La subida se reintenta una vez (señal floja en el galpón).
  const subir = () => subirFotos([foto]).catch(() => subirFotos([foto]));
  const [urls, ia] = await Promise.all([subir(), analizar(foto.base64)]);
  const res = await fetch("/api/repuestos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nombre: ia?.nombre || "Sin identificar",
      marca: ia?.marca ?? null,
      codigo: ia?.codigo ?? null,
      codigo_barras: ia?.codigo_barras ?? null,
      categoria: ia?.categoria ?? null,
      compatibilidad: ia?.compatibilidad ?? null,
      descripcion: ia?.descripcion ?? null,
      estado: ia?.estado ?? estado,
      cantidad: 1,
      ubicacion: ubicacion || null,
      fotos: urls,
      revisar: true,
      ia_datos: ia,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    URL.revokeObjectURL(foto.url);
    const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(error);
  }
  return { nombre: ia?.nombre || "Sin identificar", url: foto.url };
}

export default function Importar() {
  const [archivos, setArchivos] = useState<File[]>([]);
  const [repetidas, setRepetidas] = useState(0);
  const [ubicacion, setUbicacion] = useState("");
  const [estadoDef, setEstadoDef] = useState<Estado>("usado");
  const [fase, setFase] = useState<"elegir" | "importando" | "pausado" | "listo">("elegir");
  const [hechas, setHechas] = useState(0);
  const [errores, setErrores] = useState<string[]>([]);
  const [ultimas, setUltimas] = useState<Hecho[]>([]);
  const [inicio, setInicio] = useState(0);
  const [ahora, setAhora] = useState(0);
  const pausar = useRef(false);
  const siguiente = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const fallidas = useRef<File[]>([]);

  function elegir(files: FileList | null) {
    if (!files) return;
    const ya = leerHechas();
    const todas = Array.from(files);
    const nuevas = todas.filter((f) => !ya.has(huella(f)));
    setArchivos(nuevas);
    setRepetidas(todas.length - nuevas.length);
    siguiente.current = 0;
    setHechas(0);
    setErrores([]);
    setUltimas([]);
    fallidas.current = [];
  }

  // Vuelve a intentar solo las fotos que dieron error.
  function reintentar() {
    const lista = fallidas.current;
    fallidas.current = [];
    setArchivos(lista);
    siguiente.current = 0;
    setHechas(0);
    setErrores([]);
    arrancar(lista);
  }

  async function arrancar(lista: File[] = archivos) {
    pausar.current = false;
    setFase("importando");
    setInicio(Date.now() - (hechas > 0 ? (ahora - inicio) : 0));

    // Mantiene la pantalla encendida mientras importa (si el navegador lo permite).
    let lock: WakeLockSentinel | null = null;
    try {
      lock = await navigator.wakeLock?.request("screen");
    } catch {}

    const trabajador = async () => {
      while (!pausar.current && siguiente.current < lista.length) {
        const file = lista[siguiente.current++];
        try {
          const hecho = await conLimite(importarUna(file, ubicacion.trim(), estadoDef), MAX_POR_FOTO);
          guardarHecha(huella(file));
          setUltimas((u) => {
            const nuevo = [hecho, ...u];
            // Pocas miniaturas en pantalla: cada una ocupa memoria del celu.
            nuevo.slice(8).forEach((h) => h.url && URL.revokeObjectURL(h.url));
            return nuevo.slice(0, 8);
          });
        } catch (e) {
          fallidas.current.push(file);
          setErrores((er) => [...er, `${file.name}: ${(e as Error).message}`]);
        }
        setHechas((n) => n + 1);
      }
    };
    await Promise.all(Array.from({ length: EN_PARALELO }, trabajador));
    lock?.release().catch(() => {});
    setFase(siguiente.current >= lista.length ? "listo" : "pausado");
  }

  useEffect(() => {
    if (fase !== "importando") return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [fase]);

  // Avisa antes de cerrar o recargar la página en medio de una importación.
  useEffect(() => {
    if (fase !== "importando") return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [fase]);

  const total = archivos.length;
  const pct = total ? Math.round((hechas / total) * 100) : 0;
  const transcurrido = ahora && inicio ? (ahora - inicio) / 1000 : 0;
  const restante = hechas > 2 ? Math.round(((transcurrido / hechas) * (total - hechas)) / 60) : null;
  const campo = "w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-white placeholder:text-mute focus:border-brand focus:outline-none";

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-32">
      <BarraSuperior titulo="Importar fotos" />

      {fase === "elegir" && (
        <>
          <p className="text-mute">
            Elegí todas las fotos de la galería. Cada foto se convierte en un repuesto: la IA completa los datos y
            después los revisás uno por uno. Si un repuesto tiene varias fotos, en la revisión los podés unir.
          </p>

          <button onClick={() => input.current?.click()}
            className="mt-5 w-full rounded-2xl border-2 border-dashed border-line bg-surface py-10 text-center active:border-brand">
            <span className="block text-4xl" aria-hidden>🖼️</span>
            <span className="mt-2 block font-semibold">{total ? `${total} fotos elegidas` : "Elegir fotos"}</span>
            {repetidas > 0 && <span className="mt-1 block text-sm text-mute">{repetidas} ya estaban importadas y se saltean</span>}
          </button>
          <input ref={input} type="file" accept="image/*" multiple hidden
            onChange={(e) => { elegir(e.target.files); e.target.value = ""; }} />

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-mute">Ubicación para todas (opcional)</span>
              <input className={campo} value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Ej: Galpón, estante A" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-mute">Estado si la IA no lo distingue</span>
              <select className={campo} value={estadoDef} onChange={(e) => setEstadoDef(e.target.value as Estado)}>
                {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
              </select>
            </label>
          </div>
        </>
      )}

      {fase !== "elegir" && (
        <section>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-end justify-between">
              <p className="text-4xl font-bold tabular-nums">{hechas}<span className="text-xl text-mute"> / {total}</span></p>
              <p className="text-sm text-mute">
                {fase === "listo" ? "Terminado" : fase === "pausado" ? "Pausado" : restante !== null ? `~${restante} min restantes` : "Calculando…"}
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
            </div>
            {fase === "importando" && (
              <p className="mt-3 text-sm text-amber-200">Dejá la app abierta. Si la cerrás, después elegí las mismas fotos y sigue desde donde quedó.</p>
            )}
            {errores.length > 0 && <p className="mt-3 text-sm text-red-300">{errores.length} con error (se pueden volver a elegir)</p>}
          </div>

          {ultimas.length > 0 && (
            <ul className="mt-4 grid grid-cols-4 gap-2">
              {ultimas.map((h, i) => (
                <li key={`${h.url}-${i}`} className="overflow-hidden rounded-lg bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {h.url && <img src={h.url} alt="" className="aspect-square w-full object-cover" />}
                  <p className="line-clamp-2 px-1 py-1 text-[10px] leading-tight">{h.nombre}</p>
                </li>
              ))}
            </ul>
          )}

          {errores.length > 0 && (
            <details className="mt-4 text-sm text-mute">
              <summary>Ver errores</summary>
              <ul className="mt-2 space-y-1">{errores.map((e) => <li key={e}>{e}</li>)}</ul>
            </details>
          )}
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-ink/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-xl">
          {fase === "elegir" && (
            <button onClick={() => arrancar()} disabled={!total}
              className="w-full rounded-xl bg-brand py-4 text-lg font-bold text-ink disabled:opacity-40">
              Importar {total || ""} {total === 1 ? "foto" : "fotos"}
            </button>
          )}
          {fase === "importando" && (
            <button onClick={() => { pausar.current = true; }} className="w-full rounded-xl border border-line py-4 text-lg text-light">
              Pausar
            </button>
          )}
          {fase === "pausado" && (
            <button onClick={() => arrancar()} className="w-full rounded-xl bg-brand py-4 text-lg font-bold text-ink">Continuar</button>
          )}
          {fase === "listo" && errores.length > 0 && (
            <button onClick={reintentar} className="mb-3 w-full rounded-xl border border-amber-400/50 py-3 font-semibold text-amber-200">
              Reintentar {errores.length} con error
            </button>
          )}
          {fase === "listo" && (
            <Link href="/revisar" className="block w-full rounded-xl bg-brand py-4 text-center text-lg font-bold text-ink">
              Revisar los {hechas - errores.length} importados →
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
