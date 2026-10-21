import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";

// Resumen del gasto en Gemini (hoy, 7 días, mes en curso y proyección). Interno: usa CRON_SECRET.
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const ahora = new Date();
  const ar = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const hoyAr = ar(ahora);
  // Inicio del día y del mes en hora argentina (UTC-3).
  const inicioDia = new Date(Date.UTC(hoyAr.getFullYear(), hoyAr.getMonth(), hoyAr.getDate(), 3));
  const inicioMes = new Date(Date.UTC(hoyAr.getFullYear(), hoyAr.getMonth(), 1, 3));
  const hace7 = new Date(ahora.getTime() - 7 * 86_400_000);
  const desde = inicioMes < hace7 ? inicioMes : hace7;

  const { data, error } = await db()
    .from("ia_uso")
    .select("created_at, origen, modelo, tokens_entrada, tokens_salida, costo_usd")
    .gte("created_at", desde.toISOString())
    .limit(50_000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resumir = (filas: typeof data) => {
    const porOrigen: Record<string, { llamadas: number; usd: number }> = {};
    let usd = 0;
    let entrada = 0;
    let salida = 0;
    for (const f of filas) {
      usd += Number(f.costo_usd);
      entrada += f.tokens_entrada;
      salida += f.tokens_salida;
      const o = (porOrigen[f.origen] ??= { llamadas: 0, usd: 0 });
      o.llamadas++;
      o.usd += Number(f.costo_usd);
    }
    for (const o of Object.values(porOrigen)) o.usd = redondear(o.usd);
    return { llamadas: filas.length, usd: redondear(usd), tokens_entrada: entrada, tokens_salida: salida, por_origen: porOrigen };
  };

  const mes = data.filter((f) => new Date(f.created_at) >= inicioMes);
  const diasMes = new Date(hoyAr.getFullYear(), hoyAr.getMonth() + 1, 0).getDate();
  const transcurridos = Math.max((ahora.getTime() - inicioMes.getTime()) / 86_400_000, 1);
  const modelos = [...new Set(data.map((f) => f.modelo))];

  return NextResponse.json({
    hoy: resumir(data.filter((f) => new Date(f.created_at) >= inicioDia)),
    ultimos_7_dias: resumir(data.filter((f) => new Date(f.created_at) >= hace7)),
    mes_en_curso: resumir(mes),
    proyeccion_mes_usd: redondear((resumir(mes).usd / transcurridos) * diasMes),
    modelos,
    nota: "Estimado con precios públicos de Gemini; el gasto exacto está en la consola de facturación de Google.",
  });
}

const redondear = (n: number) => Math.round(n * 10_000) / 10_000;
