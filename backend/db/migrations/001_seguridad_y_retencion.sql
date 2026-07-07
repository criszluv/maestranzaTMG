-- ============================================================================
-- 001_seguridad_y_retencion.sql — Portal MaestranzaTMG
--
-- ESTADO: APLICADA el 2026-07-02 en el proyecto Supabase "PeroyectoEv4"
-- (mgulybixftokpgjezuzc) vía MCP, registrada allí como 4 migraciones:
--   1. seguridad_rls_y_revocacion_grants
--   2. integridad_y_columnas_de_tiempo
--   3. auditoria_y_retencion_legal
--   4. endurecer_funciones
-- Este archivo es la copia de referencia (disaster recovery / re-provisión).
--
-- Marco legal aplicado:
--   - Ley 21.719 (protección de datos personales, vigencia 01-12-2026):
--     seguridad, responsabilidad (auditoría), transparencia (COMMENT) y
--     limitación del plazo de conservación (depuración automática).
--   - Art. 17 Código Tributario: 6 años para documentación de transacciones.
--   - Criterio Dirección del Trabajo (Res. Ex. N°38): 5 años doc. laboral.
-- ============================================================================

-- ---------- 1) seguridad_rls_y_revocacion_grants ----------
alter table public.users            enable row level security;
alter table public.rrhh_solicitudes enable row level security;
alter table public.iot_metricas     enable row level security;
alter table public.pedido           enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

drop table if exists public.iot_mediciones;  -- tabla muerta (0 filas)

-- ---------- 2) integridad_y_columnas_de_tiempo ----------
alter table public.users
  add constraint ck_users_rol check (rol in ('admin','rrhh','empleado'));
update public.users set creado_en = now() where creado_en is null;
alter table public.users alter column creado_en set default now();
alter table public.users alter column creado_en set not null;

update public.rrhh_solicitudes set estado = 'Pendiente' where estado is null;
alter table public.rrhh_solicitudes alter column estado set default 'Pendiente';
alter table public.rrhh_solicitudes alter column estado set not null;
alter table public.rrhh_solicitudes alter column trabajador_id set not null;
update public.rrhh_solicitudes set creado_en = now() where creado_en is null;
alter table public.rrhh_solicitudes alter column creado_en set default now();
alter table public.rrhh_solicitudes alter column creado_en set not null;
alter table public.rrhh_solicitudes
  add constraint ck_solicitudes_estado check (estado in ('Pendiente','Aprobada','Rechazada'));
alter table public.rrhh_solicitudes
  add constraint ck_solicitudes_rango_fechas check (fecha_fin >= fecha_inicio);

alter table public.pedido
  add constraint ck_pedido_valor check (valor is null or valor >= 0);
alter table public.pedido add column if not exists creado_en timestamptz not null default now();
alter table public.pedido add column if not exists actualizado_en timestamptz;
create index if not exists ix_pedido_creado_en on public.pedido (creado_en);

alter table public.users add column if not exists actualizado_en timestamptz;

alter table public.iot_metricas
  alter column "timestamp" type timestamptz using "timestamp" at time zone 'utc';

create or replace function public.fn_touch_actualizado()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists trg_touch_pedido on public.pedido;
create trigger trg_touch_pedido
  before update on public.pedido
  for each row execute function public.fn_touch_actualizado();

drop trigger if exists trg_touch_users on public.users;
create trigger trg_touch_users
  before update on public.users
  for each row execute function public.fn_touch_actualizado();

-- ---------- 3) auditoria_y_retencion_legal ----------
create table if not exists public.auditoria_datos (
  id            bigint generated always as identity primary key,
  tabla         text        not null,
  operacion     text        not null check (operacion in ('INSERT','UPDATE','DELETE')),
  registro_id   text,
  actor_bd      text        not null default current_user,
  datos_antes   jsonb,
  datos_despues jsonb,
  ocurrido_en   timestamptz not null default now()
);

alter table public.auditoria_datos enable row level security;
revoke all on public.auditoria_datos from anon, authenticated;

create index if not exists ix_auditoria_ocurrido_en on public.auditoria_datos (ocurrido_en);
create index if not exists ix_auditoria_tabla       on public.auditoria_datos (tabla, registro_id);

create or replace function public.fn_auditar_users()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_antes   jsonb;
  v_despues jsonb;
begin
  if tg_op in ('UPDATE','DELETE') then
    v_antes := to_jsonb(old) - 'password';
  end if;
  if tg_op in ('INSERT','UPDATE') then
    v_despues := to_jsonb(new) - 'password';
  end if;

  insert into public.auditoria_datos (tabla, operacion, registro_id, datos_antes, datos_despues)
  values ('users', tg_op, coalesce(new.id::text, old.id::text), v_antes, v_despues);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists trg_auditar_users on public.users;
create trigger trg_auditar_users
  after insert or update or delete on public.users
  for each row execute function public.fn_auditar_users();

create or replace function public.fn_depurar_retencion()
returns table (tabla text, filas_eliminadas bigint)
language plpgsql security definer
set search_path = public
as $$
declare
  n bigint;
begin
  delete from public.rrhh_solicitudes
   where fecha_fin < (current_date - interval '5 years');
  get diagnostics n = row_count;
  tabla := 'rrhh_solicitudes'; filas_eliminadas := n; return next;

  delete from public.pedido
   where estado = 'terminado' and creado_en < (now() - interval '6 years');
  get diagnostics n = row_count;
  tabla := 'pedido'; filas_eliminadas := n; return next;

  delete from public.iot_metricas
   where "timestamp" < (now() - interval '90 days');
  get diagnostics n = row_count;
  tabla := 'iot_metricas'; filas_eliminadas := n; return next;

  delete from public.auditoria_datos
   where ocurrido_en < (now() - interval '3 years');
  get diagnostics n = row_count;
  tabla := 'auditoria_datos'; filas_eliminadas := n; return next;
end $$;

create extension if not exists pg_cron;
select cron.schedule(
  'depuracion-retencion-mensual',
  '0 4 1 * *',
  'select public.fn_depurar_retencion();'
);

comment on table public.users is
  'Cuentas del portal. Contiene DATOS PERSONALES (Ley 21.719): nombre y correo. Finalidad: autenticación y control de acceso. Conservación: mientras exista relación con la empresa; revisar cuentas inactivas anualmente.';
comment on column public.users.email    is 'Dato personal (identificador de contacto).';
comment on column public.users.nombre   is 'Dato personal.';
comment on column public.users.password is 'Hash bcrypt. NUNCA texto plano. Excluido de la auditoría.';
comment on table public.rrhh_solicitudes is
  'Solicitudes de días libres/permisos/licencias. Datos laborales. Conservación: 5 años desde fecha_fin (criterio DT); depuración mensual automática.';
comment on table public.pedido is
  'Órdenes de trabajo / transacciones. Conservación: 6 años para pedidos terminados (art. 17 Código Tributario); depuración mensual automática.';
comment on table public.iot_metricas is
  'Telemetría de máquinas (sin datos personales). Poda operativa a 30 filas desde la app + red de seguridad de 90 días.';
comment on table public.auditoria_datos is
  'Auditoría de tratamiento de datos personales (Ley 21.719, responsabilidad). Sin hashes de contraseña. Conservación: 3 años.';

-- ---------- 4) endurecer_funciones ----------
revoke all on function public.fn_auditar_users()     from public, anon, authenticated;
revoke all on function public.fn_touch_actualizado() from public, anon, authenticated;
revoke all on function public.fn_depurar_retencion() from public, anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
