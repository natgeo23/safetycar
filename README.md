# Safetycar · Stock con IA (MVP)

PWA para inventariar los repuestos del taller: sacás foto(s), un video o escaneás el código de barras,
la IA (Gemini) precarga nombre, marca, código OEM, categoría, compatibilidad, estado y descripción,
y queda en stock. Next.js 16 + Supabase, deploy en Vercel.

## Puesta en marcha (≈10 min)

1. **Supabase**: crear proyecto → SQL Editor → pegar y ejecutar [`supabase/schema.sql`](supabase/schema.sql)
   (crea las tablas `repuestos` y `movimientos`, la función `ajustar_stock` y el bucket público `repuestos`).
2. **Gemini**: crear una API key en aistudio.google.com/apikey.
3. **Variables** (ver [`.env.example`](.env.example)): copiar a `.env.local` para desarrollo y cargarlas en
   Vercel → Settings → Environment Variables:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `APP_PIN`, `AUTH_SECRET`.
4. **Vercel**: subir el repo a GitHub → Import Project en Vercel → Deploy. No necesita configuración extra.
5. En el celu: abrir la URL → Compartir/Menú → **Agregar a pantalla de inicio**.

```bash
npm install
npm run dev
```

## Cómo está armado

- `src/app/cargar` – flujo de carga. Las fotos se achican en el celu (1280 px) y se suben directo a Supabase
  Storage con URLs firmadas mientras la IA analiza, así el guardado es inmediato. El video se convierte en 5 cuadros.
- `src/app/api/analizar` – llamada a Gemini con salida JSON validada con Zod. Modelo configurable con `GEMINI_MODEL`.
- `src/app/page.tsx` – stock agrupado por categoría, búsqueda, filtro por categorías y vista lista/grilla (2-4 columnas).
  El stock se mueve con +/- desde el detalle de cada repuesto (cada ajuste queda en `movimientos`).
- `src/lib/categorias.ts` – categorías fijas; la IA siempre elige una. "Clasificar con IA" ordena las cargas viejas.
- `src/app/importar` – importador masivo: cada foto de la galería es un repuesto (de a 4 en paralelo, sin repetir fotos).
  Requiere ejecutar [`supabase/revisar.sql`](supabase/revisar.sql) una vez.
- `src/app/revisar` – cola para completar los importados uno por uno y unir fotos del mismo repuesto.
- `src/proxy.ts` – acceso por PIN compartido. La base solo se toca desde el servidor con la service role;
  RLS está activo sin políticas, así que la anon key no tiene acceso.
- Campo `publicado` y fotos públicas listos para conectar el e-commerce después.
