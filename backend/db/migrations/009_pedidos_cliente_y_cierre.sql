-- ============================================================================
-- 009_pedidos_cliente_y_cierre.sql — Portal MaestranzaTMG
--
-- Cierra el ciclo de vida del PEDIDO (orden de trabajo interna) conectándolo
-- con el módulo comercial:
--
--   1. RRHH crea el pedido y le asigna un CLIENTE (nuevo campo cliente_id) y
--      un encargado (empleado).
--   2. El encargado trabaja y marca el pedido como 'terminado'.
--   3. RRHH lo CIERRA eligiendo el destino comercial:
--        'pagado'    -> se crea una fila en `trabajos`  (trabajos realizados)
--        'pendiente' -> se crea una fila en `facturas`  (pagos pendientes)
--
-- Trazabilidad: el pedido guarda cuándo se cerró (cerrado_en), con qué
-- criterio (cierre_tipo) y a qué registro comercial dio origen (trabajo_id /
-- factura_id). Los FK usan ON DELETE SET NULL: si un admin corrige el
-- registro comercial, el pedido no se rompe y el cierre sigue documentado.
--
-- Aditiva y idempotente: no altera datos existentes. Los pedidos históricos
-- quedan con cliente_id/cerrado_en NULL (sin cerrar), que es lo correcto.
-- ============================================================================

alter table public.pedido
  add column if not exists cliente_id  bigint references public.clientes(id),
  add column if not exists cerrado_en  timestamptz,
  add column if not exists cierre_tipo text,
  add column if not exists trabajo_id  bigint references public.trabajos(id) on delete set null,
  add column if not exists factura_id  bigint references public.facturas(id) on delete set null;

-- Dominio cerrado del tipo de cierre (misma filosofía que estado/rol).
alter table public.pedido drop constraint if exists ck_pedido_cierre_tipo;
alter table public.pedido add constraint ck_pedido_cierre_tipo
  check (cierre_tipo is null or cierre_tipo in ('pagado', 'pendiente'));

-- Coherencia: o el pedido está cerrado (fecha + tipo) o no lo está. Se apoya
-- solo en columnas propias, así un ON DELETE SET NULL del trabajo/factura
-- nunca puede violar la restricción.
alter table public.pedido drop constraint if exists ck_pedido_cierre_coherente;
alter table public.pedido add constraint ck_pedido_cierre_coherente
  check ((cerrado_en is null) = (cierre_tipo is null));

create index if not exists ix_pedido_cliente on public.pedido (cliente_id);
-- Parcial: la consulta frecuente es "pedidos terminados AÚN sin cerrar".
create index if not exists ix_pedido_sin_cerrar
  on public.pedido (estado) where cerrado_en is null;

comment on column public.pedido.cliente_id is
  'Cliente al que se factura el pedido. NULL en los pedidos históricos; obligatorio para poder cerrarlo.';
comment on column public.pedido.cerrado_en is
  'Momento en que RRHH derivó el pedido terminado al módulo comercial. NULL = aún sin cerrar.';
comment on column public.pedido.cierre_tipo is
  'Criterio del cierre: pagado (originó un trabajo realizado) o pendiente (originó una factura por cobrar).';
comment on column public.pedido.trabajo_id is
  'Trabajo realizado generado al cerrar como pagado. NULL si el cierre fue pendiente o si el trabajo se eliminó.';
comment on column public.pedido.factura_id is
  'Factura por cobrar generada al cerrar como pendiente. NULL si el cierre fue pagado o si la factura se eliminó.';
