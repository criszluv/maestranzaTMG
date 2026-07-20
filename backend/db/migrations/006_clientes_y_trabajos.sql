-- ============================================================================
-- 006_clientes_y_trabajos.sql — Portal MaestranzaTMG
--
-- Módulos nuevos: CLIENTES (habilitados) y TRABAJOS realizados, migrados desde
-- los Excel de la empresa (clientes_habilitados / ultimos_trabajos).
--
-- Diseño normalizado (3NF): la planilla original violaba 1NF (hasta 3
-- teléfonos y 2 RUT por celda-fila). Se separa en:
--   clientes            1 fila por cliente (nombre único, email, ingreso)
--   cliente_contactos   1:N teléfonos/personas de contacto (nota: "pagos"...)
--   cliente_entidades   1:N razones sociales/RUT de facturación
--   trabajos            1:N trabajos realizados por cliente (FK real)
--
-- Ley 21.719: los contactos son DATOS PERSONALES (nombre+teléfono+email de
-- personas). RLS deny-by-default, auditoría con actor y retención:
--   - clientes/contactos: mientras dure la relación comercial.
--   - trabajos: 6 años (art. 17 Código Tributario), depuración automática.
-- ============================================================================

-- ---------- 1) Tablas ----------

create table if not exists public.clientes (
  id             bigint generated always as identity primary key,
  nombre         text not null,
  email          text,
  fecha_ingreso  date,
  estado         text not null default 'habilitado'
                 check (estado in ('habilitado', 'deshabilitado')),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz
);

-- Nombre único (sin distinguir mayúsculas): evita clientes duplicados como
-- ocurría en la planilla original.
create unique index if not exists ux_clientes_nombre on public.clientes (upper(nombre));

create table if not exists public.cliente_contactos (
  id         bigint generated always as identity primary key,
  cliente_id bigint not null references public.clientes(id) on delete cascade,
  nombre     text,
  telefono   text,
  nota       text,               -- "pagos", "jefe servicios", etc.
  orden      smallint not null default 1
);
create index if not exists ix_cliente_contactos_cliente on public.cliente_contactos (cliente_id);

create table if not exists public.cliente_entidades (
  id         bigint generated always as identity primary key,
  cliente_id bigint not null references public.clientes(id) on delete cascade,
  rut        text not null,
  nombre     text
);
create index if not exists ix_cliente_entidades_cliente on public.cliente_entidades (cliente_id);

create table if not exists public.trabajos (
  id             bigint generated always as identity primary key,
  cliente_id     bigint not null references public.clientes(id),
  fecha          date not null,
  hora           time,
  estado         text not null default 'Finalizado'
                 check (estado in ('Pendiente', 'En proceso', 'Finalizado')),
  valor          integer check (valor is null or valor >= 0),  -- CLP
  detalle        text not null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz
);
create index if not exists ix_trabajos_cliente on public.trabajos (cliente_id);
create index if not exists ix_trabajos_fecha on public.trabajos (fecha desc);

-- ---------- 2) Seguridad (RLS deny-by-default, igual que el resto) ----------

alter table public.clientes          enable row level security;
alter table public.cliente_contactos enable row level security;
alter table public.cliente_entidades enable row level security;
alter table public.trabajos          enable row level security;
revoke all on public.clientes, public.cliente_contactos,
              public.cliente_entidades, public.trabajos
  from anon, authenticated;

-- ---------- 3) Triggers: touch + auditoría con actor ----------

drop trigger if exists trg_touch_clientes on public.clientes;
create trigger trg_touch_clientes
  before update on public.clientes
  for each row execute function public.fn_touch_actualizado();

drop trigger if exists trg_touch_trabajos on public.trabajos;
create trigger trg_touch_trabajos
  before update on public.trabajos
  for each row execute function public.fn_touch_actualizado();

drop trigger if exists trg_auditar_clientes on public.clientes;
create trigger trg_auditar_clientes
  after insert or update or delete on public.clientes
  for each row execute function public.fn_auditar_generico();

drop trigger if exists trg_auditar_trabajos on public.trabajos;
create trigger trg_auditar_trabajos
  after insert or update or delete on public.trabajos
  for each row execute function public.fn_auditar_generico();

-- ---------- 4) Retención (Ley 21.719 + art. 17 C. Tributario) ----------

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

  delete from public.trabajos
   where estado = 'Finalizado' and fecha < (current_date - interval '6 years');
  get diagnostics n = row_count;
  tabla := 'trabajos'; filas_eliminadas := n; return next;

  delete from public.iot_metricas
   where "timestamp" < (now() - interval '90 days');
  get diagnostics n = row_count;
  tabla := 'iot_metricas'; filas_eliminadas := n; return next;

  delete from public.auditoria_datos
   where ocurrido_en < (now() - interval '3 years');
  get diagnostics n = row_count;
  tabla := 'auditoria_datos'; filas_eliminadas := n; return next;
end $$;

revoke all on function public.fn_depurar_retencion() from public, anon, authenticated;

-- ---------- 5) Transparencia (COMMENT, registro de tratamiento) ----------

comment on table public.clientes is
  'Clientes de la maestranza. Contiene datos comerciales; los datos PERSONALES de personas de contacto viven en cliente_contactos. Conservación: mientras dure la relación comercial.';
comment on table public.cliente_contactos is
  'Personas de contacto de clientes: nombre y teléfono son DATOS PERSONALES (Ley 21.719). Finalidad: coordinación comercial y cobros. Se eliminan junto con el cliente (ON DELETE CASCADE).';
comment on table public.cliente_entidades is
  'Razones sociales / RUT de facturación asociadas a cada cliente.';
comment on table public.trabajos is
  'Trabajos realizados a clientes (registro comercial). Conservación: 6 años desde la fecha para finalizados (art. 17 Código Tributario); depuración mensual automática.';
