-- ============================================================================
-- 002_auditoria_actor_app.sql — Portal MaestranzaTMG
--
-- Ley 21.719 (responsabilidad): la auditoría debe decir QUIÉN hizo el cambio
-- a nivel de PERSONA. Como el backend conecta siempre con el mismo rol de BD,
-- `actor_bd` no distingue usuarios. El backend ahora fija la variable de
-- transacción `app.actor` ("id|email", ver services/privacidad.py ->
-- fijar_actor_auditoria) y el trigger la copia a `actor_app`.
-- ============================================================================

alter table public.auditoria_datos
  add column if not exists actor_app text;

comment on column public.auditoria_datos.actor_app is
  'Usuario de la APLICACIÓN que ejecutó la operación (id|email), fijado por '
  'el backend vía set_config(''app.actor'', ..., true). NULL = operación '
  'directa en BD (consola/scripts).';

create or replace function public.fn_auditar_users()
returns trigger
language plpgsql
security definer
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

  insert into public.auditoria_datos
    (tabla, operacion, registro_id, datos_antes, datos_despues, actor_app)
  values (
    'users',
    tg_op,
    coalesce(new.id::text, old.id::text),
    v_antes,
    v_despues,
    nullif(current_setting('app.actor', true), '')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;
