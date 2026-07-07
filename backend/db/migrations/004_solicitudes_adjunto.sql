-- ============================================================================
-- 004_solicitudes_adjunto.sql — Portal MaestranzaTMG
--
-- Agrega el adjunto opcional (1 foto-documento por solicitud) a
-- public.rrhh_solicitudes. El archivo vive en el mismo bucket privado de
-- Supabase Storage (pedidos-fotos) bajo el prefijo solicitud_{id}/; aquí solo
-- guardamos los metadatos. Columnas NULLABLE: no afectan filas existentes.
--
-- El saldo de vacaciones (15 días hábiles/año, solo 'Vacaciones' aprobadas)
-- NO necesita columnas: se calcula al vuelo desde fecha_inicio/fecha_fin/estado
-- (app/services/vacaciones.py).
--
-- Reversible: alter table public.rrhh_solicitudes drop column adjunto_ruta, ...
-- ============================================================================

alter table public.rrhh_solicitudes
  add column if not exists adjunto_ruta         text,
  add column if not exists adjunto_nombre       text,
  add column if not exists adjunto_content_type text,
  add column if not exists adjunto_tamano       integer;

-- Una ruta no puede repetirse entre solicitudes (defensa ante colisiones).
create unique index if not exists ux_rrhh_solicitudes_adjunto_ruta
  on public.rrhh_solicitudes (adjunto_ruta)
  where adjunto_ruta is not null;

comment on column public.rrhh_solicitudes.adjunto_ruta is
  'Ruta del adjunto (foto-documento) en el bucket privado pedidos-fotos '
  '(prefijo solicitud_{id}/). NULL = sin adjunto. Dato aportado por el '
  'trabajador; se conserva junto con la solicitud (5 años).';
