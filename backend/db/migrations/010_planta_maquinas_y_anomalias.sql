-- ============================================================================
-- 010_planta_maquinas_y_anomalias.sql — Portal MaestranzaTMG
--
-- Fundación del monitoreo de planta. Corrige tres defectos estructurales del
-- módulo IoT y deja el terreno listo para la detección de anomalías y el
-- cierre del ciclo con el módulo de pedidos.
--
--   1. La máquina era un `text` suelto: no se podía relacionar nada con ella.
--      -> tabla `maquinas` como entidad real, con su frecuencia nominal de
--         giro (necesaria para interpretar el espectro de vibración).
--
--   2. No existía el concepto de dispositivo: la ingesta iba protegida por
--      rol admin, así que cualquier token de admin podía inyectar métricas.
--      -> tabla `dispositivos`, con su última telemetría para poder detectar
--         el silencio de un sensor (que también es un evento).
--
--   3. La telemetría solo tenía 3 valores escalares y el servicio la podaba
--      a 30 filas: la app borraba su propia historia.
--      -> `iot_metricas` adopta el contrato de telemetría (características
--         de vibración, corriente, calidad del dato) y la poda desaparece;
--         la retención queda a cargo de fn_depurar_retencion (90 días).
--
-- Además se prepara el cierre del ciclo: un pedido puede ser 'comercial'
-- (se factura a un cliente) o de 'mantenimiento' (nace de una anomalía y no
-- se factura), y `anomalias` guarda el ciclo completo con realimentación.
--
-- Aditiva e idempotente. Los 7 registros históricos de iot_metricas se
-- conservan y se vinculan a su máquina por nombre.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. MÁQUINAS  (activo físico monitoreado)
-- ---------------------------------------------------------------------------
create table if not exists public.maquinas (
  id             bigint generated always as identity primary key,
  nombre         text not null unique,
  ubicacion      text,
  -- Frecuencia de giro nominal: define dónde caen 1x y sus armónicos en el
  -- espectro. Sin esto no se puede distinguir desbalance de otra cosa.
  rpm_nominal    integer check (rpm_nominal is null or rpm_nominal > 0),
  estado         text not null default 'operativa'
                 check (estado in ('operativa', 'detenida', 'mantenimiento', 'baja')),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz
);

-- Las 4 máquinas que ya aparecían como texto en la telemetría histórica.
insert into public.maquinas (nombre, rpm_nominal)
values ('Torno paralelo', 1500), ('Fresadora', 1200),
       ('Plasma CNC', 1800),     ('Prensa hidráulica', 900)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------
-- 2. DISPOSITIVOS  (ESP32 en planta o banco de pruebas por software)
-- ---------------------------------------------------------------------------
create table if not exists public.dispositivos (
  id                bigint generated always as identity primary key,
  device_id         text not null unique,         -- 'esp32-torno-01'
  maquina_id        bigint references public.maquinas(id) on delete set null,
  fw                text,
  -- Marca de vida: si se queda atrás, el sensor dejó de reportar.
  ultima_telemetria timestamptz,
  estado            text not null default 'activo'
                    check (estado in ('activo', 'inactivo')),
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz
);

create index if not exists ix_dispositivos_maquina on public.dispositivos (maquina_id);

-- ---------------------------------------------------------------------------
-- 3. TELEMETRÍA  (contrato de mensajes; el hardware es reemplazo transparente)
-- ---------------------------------------------------------------------------
alter table public.iot_metricas
  add column if not exists maquina_id        bigint references public.maquinas(id),
  add column if not exists dispositivo_id    bigint references public.dispositivos(id) on delete set null,
  add column if not exists ventana_ms        integer,
  -- Características de vibración: se transmiten features, NO la señal cruda.
  add column if not exists vib_rms           double precision,
  add column if not exists vib_kurtosis      double precision,
  add column if not exists vib_factor_cresta double precision,
  add column if not exists vib_picos         jsonb,   -- [[hz, amplitud], ...]
  add column if not exists corriente_a       double precision,
  add column if not exists calidad           text default 'ok';

alter table public.iot_metricas drop constraint if exists ck_iot_calidad;
alter table public.iot_metricas add constraint ck_iot_calidad
  check (calidad is null or calidad in ('ok', 'degradada', 'sensor_fallo'));

-- Vincula la historia existente (la máquina venía como texto libre).
update public.iot_metricas m
   set maquina_id = q.id
  from public.maquinas q
 where m.maquina_id is null and m.maquina = q.nombre;

-- Consulta natural del monitoreo: "últimas lecturas de esta máquina".
create index if not exists ix_iot_maquina_ts
  on public.iot_metricas (maquina_id, "timestamp" desc);

-- ---------------------------------------------------------------------------
-- 4. ANOMALÍAS  (ciclo completo, con realimentación)
-- ---------------------------------------------------------------------------
--   detectada -> validada  -> resuelta   (era_real = true)
--   detectada -> descartada             (era_real = false: falso positivo)
-- `pedido_id` es el enlace con la orden de trabajo: ahí se cierra el ciclo.
create table if not exists public.anomalias (
  id             bigint generated always as identity primary key,
  maquina_id     bigint not null references public.maquinas(id) on delete cascade,
  tipo           text not null,     -- desbalance | rodamiento | sobrecarga | sensor_fallo | silencio
  severidad      text not null default 'media'
                 check (severidad in ('baja', 'media', 'alta', 'critica')),
  score          double precision,  -- puntaje del detector (0..1)
  detectada_en   timestamptz not null default now(),
  ventana_inicio timestamptz,
  ventana_fin    timestamptz,
  detalle        text,
  estado         text not null default 'detectada'
                 check (estado in ('detectada', 'validada', 'descartada', 'resuelta')),
  -- Orden de trabajo de mantenimiento generada al validar la anomalía.
  pedido_id      bigint references public.pedido(id) on delete set null,
  validada_por   bigint references public.users(id),
  validada_en    timestamptz,
  -- Realimentación del técnico al cerrar: alimenta la tasa de falsos positivos.
  era_real       boolean,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz
);

create index if not exists ix_anomalias_maquina on public.anomalias (maquina_id, detectada_en desc);
create index if not exists ix_anomalias_estado  on public.anomalias (estado);

-- ---------------------------------------------------------------------------
-- 5. PEDIDOS: comercial vs mantenimiento
-- ---------------------------------------------------------------------------
-- Un pedido de mantenimiento nace de una anomalía, apunta a una máquina y NO
-- se factura: por eso su cierre no exige cliente ni genera trabajo/factura.
alter table public.pedido
  add column if not exists tipo       text not null default 'comercial',
  add column if not exists maquina_id bigint references public.maquinas(id) on delete set null;

alter table public.pedido drop constraint if exists ck_pedido_tipo;
alter table public.pedido add constraint ck_pedido_tipo
  check (tipo in ('comercial', 'mantenimiento'));

-- 'interno' = cierre de una orden de mantenimiento (sin efecto comercial).
alter table public.pedido drop constraint if exists ck_pedido_cierre_tipo;
alter table public.pedido add constraint ck_pedido_cierre_tipo
  check (cierre_tipo is null or cierre_tipo in ('pagado', 'pendiente', 'interno'));

create index if not exists ix_pedido_tipo on public.pedido (tipo);

-- ---------------------------------------------------------------------------
-- 6. SEGURIDAD Y AUDITORÍA (mismo estándar que el resto del esquema)
-- ---------------------------------------------------------------------------
alter table public.maquinas     enable row level security;
alter table public.dispositivos enable row level security;
alter table public.anomalias    enable row level security;
revoke all on public.maquinas     from anon, authenticated;
revoke all on public.dispositivos from anon, authenticated;
revoke all on public.anomalias    from anon, authenticated;

drop trigger if exists trg_touch_maquinas on public.maquinas;
create trigger trg_touch_maquinas before update on public.maquinas
  for each row execute function public.fn_touch_actualizado();

drop trigger if exists trg_touch_dispositivos on public.dispositivos;
create trigger trg_touch_dispositivos before update on public.dispositivos
  for each row execute function public.fn_touch_actualizado();

drop trigger if exists trg_touch_anomalias on public.anomalias;
create trigger trg_touch_anomalias before update on public.anomalias
  for each row execute function public.fn_touch_actualizado();

-- La anomalía y su validación son decisiones con consecuencias (generan
-- trabajo real): quedan auditadas con el actor de aplicación.
drop trigger if exists trg_auditar_anomalias on public.anomalias;
create trigger trg_auditar_anomalias
  after insert or update or delete on public.anomalias
  for each row execute function public.fn_auditar_generico();

drop trigger if exists trg_auditar_maquinas on public.maquinas;
create trigger trg_auditar_maquinas
  after insert or update or delete on public.maquinas
  for each row execute function public.fn_auditar_generico();

comment on table public.maquinas is
  'Activos físicos monitoreados. rpm_nominal define dónde caen 1x y armónicos en el espectro de vibración.';
comment on table public.dispositivos is
  'Dispositivos de campo (ESP32) o bancos de pruebas que publican telemetría. ultima_telemetria permite detectar silencio de sensor.';
comment on table public.anomalias is
  'Ciclo de vida de una anomalía detectada: validación por un técnico, orden de trabajo generada y realimentación (era_real) para medir falsos positivos.';
comment on column public.pedido.tipo is
  'comercial: se factura a un cliente. mantenimiento: nace de una anomalía, apunta a una máquina y cierra como interno.';
