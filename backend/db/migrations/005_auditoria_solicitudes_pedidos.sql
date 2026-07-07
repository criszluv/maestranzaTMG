-- ============================================================================
-- 005_auditoria_solicitudes_pedidos.sql — Portal MaestranzaTMG
--
-- Extiende la auditoría (Ley 21.719, responsabilidad) más allá de `users`:
-- ahora también se registra cada INSERT/UPDATE/DELETE de rrhh_solicitudes y
-- pedido en public.auditoria_datos, con el actor de la aplicación (actor_app).
--
-- Reutiliza la MISMA tabla auditoria_datos (no se crea una nueva). El backend
-- fija app.actor con fijar_actor_auditoria() antes de cada cambio; el trigger
-- lo copia. Estas tablas no tienen contraseñas, así que se guarda la fila
-- completa (a diferencia de users, que excluye 'password').
-- ============================================================================

create or replace function public.fn_auditar_generico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes   jsonb;
  v_despues jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_antes := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_despues := to_jsonb(new);
  end if;

  insert into public.auditoria_datos
    (tabla, operacion, registro_id, datos_antes, datos_despues, actor_app)
  values (
    tg_table_name,
    tg_op,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
    v_antes,
    v_despues,
    nullif(current_setting('app.actor', true), '')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

-- Endurecimiento: sin EXECUTE público (igual que fn_auditar_users).
revoke all on function public.fn_auditar_generico() from public, anon, authenticated;

drop trigger if exists trg_auditar_solicitudes on public.rrhh_solicitudes;
create trigger trg_auditar_solicitudes
  after insert or update or delete on public.rrhh_solicitudes
  for each row execute function public.fn_auditar_generico();

drop trigger if exists trg_auditar_pedido on public.pedido;
create trigger trg_auditar_pedido
  after insert or update or delete on public.pedido
  for each row execute function public.fn_auditar_generico();
