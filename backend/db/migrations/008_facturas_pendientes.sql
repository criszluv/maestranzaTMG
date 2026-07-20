-- ============================================================================
-- 008_facturas_pendientes.sql — Portal MaestranzaTMG
--
-- Módulo de PAGOS PENDIENTES (facturas por cobrar), migrado desde el Excel
-- "MAESTRANZA TMG (1).xlsx" (hoja Facturas pendientes, 233 filas).
--
-- Diseño HÍBRIDO (decisión ante nombres informales en el Excel):
--   cliente_texto  SIEMPRE guarda el nombre tal como se escribió (sin pérdida)
--   cliente_id     vínculo OPCIONAL al cliente real; en la carga solo se
--                  auto-vinculó lo inequívoco (igualdad normalizada o mismo
--                  set de palabras con match único: 60/233). El resto se
--                  vincula a mano desde la app.
--
-- Ley 21.719 / tributario: registro comercial; las facturas PAGADAS se
-- depuran a los 6 años desde el pago; las pendientes no caducan (cobranza).
-- ============================================================================

create table if not exists public.facturas (
  id             bigint generated always as identity primary key,
  cliente_id     bigint references public.clientes(id),
  cliente_texto  text not null,
  numero         integer,
  monto          integer check (monto is null or monto >= 0),  -- CLP
  fecha_emision  date,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'pagada')),
  pagada_en      date,
  nota           text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz
);

create index if not exists ix_facturas_estado  on public.facturas (estado);
create index if not exists ix_facturas_cliente on public.facturas (cliente_id);
create index if not exists ix_facturas_fecha   on public.facturas (fecha_emision desc);

-- Seguridad: mismo estándar del resto (RLS deny-by-default, sin grants).
alter table public.facturas enable row level security;
revoke all on public.facturas from anon, authenticated;

-- Triggers: touch + auditoría con actor de aplicación.
drop trigger if exists trg_touch_facturas on public.facturas;
create trigger trg_touch_facturas
  before update on public.facturas
  for each row execute function public.fn_touch_actualizado();

drop trigger if exists trg_auditar_facturas on public.facturas;
create trigger trg_auditar_facturas
  after insert or update or delete on public.facturas
  for each row execute function public.fn_auditar_generico();

-- Retención: facturas pagadas se depuran a los 6 años desde el pago.
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

  delete from public.facturas
   where estado = 'pagada' and pagada_en < (current_date - interval '6 years');
  get diagnostics n = row_count;
  tabla := 'facturas'; filas_eliminadas := n; return next;

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

comment on table public.facturas is
  'Facturas por cobrar (pagos pendientes de clientes). cliente_texto conserva el nombre tal como se digitó; cliente_id es el vínculo opcional al cliente real. Pagadas: conservación 6 años desde el pago (art. 17 C. Tributario), depuración automática. Pendientes: sin caducidad (cobranza activa).';
