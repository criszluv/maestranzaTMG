-- ============================================================================
-- 007_auditoria_cliente_detalle.sql — Portal MaestranzaTMG
--
-- Los CONTACTOS de clientes (nombre + teléfono de personas) son los datos
-- personales del módulo: sus cambios también deben quedar en la auditoría
-- (Ley 21.719, responsabilidad). Mismo mecanismo que el resto
-- (fn_auditar_generico + app.actor).
-- ============================================================================

drop trigger if exists trg_auditar_cliente_contactos on public.cliente_contactos;
create trigger trg_auditar_cliente_contactos
  after insert or update or delete on public.cliente_contactos
  for each row execute function public.fn_auditar_generico();

drop trigger if exists trg_auditar_cliente_entidades on public.cliente_entidades;
create trigger trg_auditar_cliente_entidades
  after insert or update or delete on public.cliente_entidades
  for each row execute function public.fn_auditar_generico();
