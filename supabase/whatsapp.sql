-- Safetycar · Bot de WhatsApp
-- Pegar y ejecutar en Supabase → SQL Editor (después de schema.sql).

-- Un registro por chat de WhatsApp.
create table if not exists public.wa_chats (
  jid            text primary key,          -- remoteJid de WhatsApp (…@s.whatsapp.net o …@lid)
  telefono       text,                      -- número sin "+" si se conoce
  nombre         text,                      -- nombre de perfil de WhatsApp
  pausado_hasta  timestamptz,               -- el bot no contesta hasta esta hora (atiende una persona)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Historial de la conversación (memoria del bot).
create table if not exists public.wa_mensajes (
  id          text primary key,             -- id del mensaje de WhatsApp
  jid         text not null references public.wa_chats (jid) on delete cascade,
  rol         text not null check (rol in ('cliente', 'bot', 'humano', 'aviso')), -- aviso: al equipo, fuera de la memoria
  texto       text,
  media       jsonb,                        -- {mime, data base64} de audios/fotos recientes
  created_at  timestamptz not null default now()
);
create index if not exists wa_mensajes_jid_idx on public.wa_mensajes (jid, created_at desc);

-- Turnos, retiros, presupuestos y reservas que toma el bot para que el taller confirme.
create table if not exists public.wa_solicitudes (
  id               bigint generated always as identity primary key,
  created_at       timestamptz not null default now(),
  jid              text not null references public.wa_chats (jid) on delete cascade,
  tipo             text not null check (tipo in ('turno', 'retiro', 'presupuesto', 'reserva_repuesto', 'otro')),
  nombre           text,
  vehiculo         text,
  fecha_preferida  text,
  detalle          text,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'confirmada', 'cancelada', 'hecha'))
);
create index if not exists wa_solicitudes_estado_idx on public.wa_solicitudes (estado, created_at desc);

drop trigger if exists wa_chats_touch on public.wa_chats;
create trigger wa_chats_touch before update on public.wa_chats
  for each row execute function public.touch_updated_at();

-- Igual que el resto: solo la service role desde el servidor.
alter table public.wa_chats enable row level security;
alter table public.wa_mensajes enable row level security;
alter table public.wa_solicitudes enable row level security;
