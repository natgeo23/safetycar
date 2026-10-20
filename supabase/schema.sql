-- Safetycar · Stock MVP
-- Pegar y ejecutar en Supabase → SQL Editor.

create extension if not exists pg_trgm;

create table if not exists public.repuestos (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  nombre         text not null,
  marca          text,
  codigo         text,            -- número de parte / OEM
  codigo_barras  text,
  categoria      text,
  compatibilidad text,            -- vehículos compatibles
  descripcion    text,
  estado         text not null default 'usado' check (estado in ('nuevo', 'usado', 'reacondicionado', 'para_reparar')),
  cantidad       integer not null default 1 check (cantidad >= 0),
  stock_minimo   integer not null default 0,
  ubicacion      text,            -- dónde está en el taller
  precio         numeric(12, 2),
  fotos          text[] not null default '{}', -- URLs públicas en Storage
  ia_datos       jsonb,           -- respuesta cruda de la IA, para auditar
  publicado      boolean not null default false -- para el futuro e-commerce
);

create index if not exists repuestos_created_at_idx on public.repuestos (created_at desc);
create index if not exists repuestos_busqueda_idx on public.repuestos
  using gin ((coalesce(nombre,'') || ' ' || coalesce(marca,'') || ' ' || coalesce(codigo,'') || ' ' || coalesce(codigo_barras,'') || ' ' || coalesce(compatibilidad,'')) gin_trgm_ops);

create table if not exists public.movimientos (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  repuesto_id uuid not null references public.repuestos (id) on delete cascade,
  delta       integer not null,     -- +ingreso / -egreso
  motivo      text
);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists repuestos_touch on public.repuestos;
create trigger repuestos_touch before update on public.repuestos
  for each row execute function public.touch_updated_at();

-- Ajuste atómico de stock + registro del movimiento.
create or replace function public.ajustar_stock(p_id uuid, p_delta integer, p_motivo text default null)
returns integer language plpgsql as $$
declare nueva integer;
begin
  update public.repuestos set cantidad = greatest(cantidad + p_delta, 0)
    where id = p_id returning cantidad into nueva;
  insert into public.movimientos (repuesto_id, delta, motivo) values (p_id, p_delta, p_motivo);
  return nueva;
end $$;

-- Toda la app accede con la service role desde el servidor: RLS activado y sin políticas
-- públicas, así la anon key no puede leer ni escribir nada.
alter table public.repuestos enable row level security;
alter table public.movimientos enable row level security;

-- Bucket público de fotos (luego se reutilizan en el e-commerce).
insert into storage.buckets (id, name, public)
values ('repuestos', 'repuestos', true)
on conflict (id) do nothing;
