-- ============================================================================
-- 003_fotos_pedidos_storage.sql — APLICADA el 2026-07-02 en "PeroyectoEv4"
-- (registrada en Supabase como fotos_pedidos_storage).
-- Bucket privado pedidos-fotos (5 MB, jpeg/png/webp) + tabla de metadatos con
-- soft-delete auditado + retención integrada (los objetos del bucket caen
-- junto con los pedidos a los 6 años). Ver contenido íntegro en el historial
-- de migraciones de Supabase; este archivo es copia de referencia.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pedidos-fotos','pedidos-fotos', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.pedido_fotos (
  id              bigint generated always as identity primary key,
  pedido_id       bigint      not null references public.pedido(id) on delete cascade,
  subido_por      bigint      not null references public.users(id),
  ruta            text        not null unique,
  nombre_original text,
  tamano_bytes    integer     not null check (tamano_bytes > 0),
  content_type    text        not null check (content_type in ('image/jpeg','image/png','image/webp')),
  estado          text        not null default 'visible' check (estado in ('visible','oculta')),
  subida_en       timestamptz not null default now(),
  oculta_en       timestamptz,
  oculta_por      bigint      references public.users(id)
);

create index if not exists ix_pedido_fotos_pedido on public.pedido_fotos (pedido_id, estado);
alter table public.pedido_fotos enable row level security;
revoke all on public.pedido_fotos from anon, authenticated;
-- (+ comments y fn_depurar_retencion() extendida con storage.objects; ver 001/BD)
