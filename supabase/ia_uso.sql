-- Safetycar · Consumo de Gemini (para seguir el costo)
-- Pegar y ejecutar en Supabase → SQL Editor.

create table if not exists public.ia_uso (
  id               bigint generated always as identity primary key,
  created_at       timestamptz not null default now(),
  origen           text not null,           -- whatsapp | analizar
  modelo           text not null,
  tokens_entrada   integer not null default 0,
  tokens_salida    integer not null default 0, -- respuesta + pensamiento (se cobran igual)
  costo_usd        numeric(10, 6) not null default 0
);
create index if not exists ia_uso_created_at_idx on public.ia_uso (created_at desc);

alter table public.ia_uso enable row level security;
