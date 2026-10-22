-- Safetycar · marca de "a revisar" para los repuestos creados por el importador masivo.
-- Pegar y ejecutar una vez en Supabase → SQL Editor.

alter table public.repuestos add column if not exists revisar boolean not null default false;
create index if not exists repuestos_revisar_idx on public.repuestos (created_at) where revisar;
