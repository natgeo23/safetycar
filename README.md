# Safetycar · Stock con IA (MVP)

PWA para inventariar los repuestos del taller: sacás foto(s), un video o escaneás el código de barras,
la IA (Claude) precarga nombre, marca, código OEM, categoría, compatibilidad, estado y descripción,
y queda en stock. Next.js 16 + Supabase, deploy en Vercel.

## Puesta en marcha (≈10 min)

1. **Supabase**: crear proyecto → SQL Editor → pegar y ejecutar [`supabase/schema.sql`](supabase/schema.sql)
   (crea las tablas `repuestos` y `movimientos`, la función `ajustar_stock` y el bucket público `repuestos`).
2. **Anthropic**: crear una API key en console.anthropic.com.
3. **Variables** (ver [`.env.example`](.env.example)): copiar a `.env.local` para desarrollo y cargarlas en
   Vercel → Settings → Environment Variables:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `APP_PIN`, `AUTH_SECRET`.
4. **Vercel**: subir el repo a GitHub → Import Project en Vercel → Deploy. No necesita configuración extra.
5. En el celu: abrir la URL → Compartir/Menú → **Agregar a pantalla de inicio**.

```bash
npm install
npm run dev
```

## Cómo está armado

- `src/app/cargar` – flujo de carga. Las fotos se achican en el celu (1280 px) y se suben directo a Supabase
  Storage con URLs firmadas mientras la IA analiza, así el guardado es inmediato. El video se convierte en 5 cuadros.
- `src/app/api/analizar` – llamada a Claude con salida estructurada (Zod). Modelo configurable con `ANTHROPIC_MODEL`.
- `src/app/page.tsx` – stock con búsqueda y +/- de unidades (cada ajuste queda en `movimientos`).
- `src/proxy.ts` – acceso por PIN compartido. La base solo se toca desde el servidor con la service role;
  RLS está activo sin políticas, así que la anon key no tiene acceso.
- Campo `publicado` y fotos públicas listos para conectar el e-commerce después.
