-- ============================================================
-- AUDITORÍA EXHAUSTIVA (2026-08-22) — hallazgo P0: borrar un cliente que
-- tiene cuenta corriente borraba TODO su historial de cargos y pagos para
-- siempre, sin ningún aviso.
--
-- Causa: cta_cte_movimientos.cliente_id está definida como
-- "on delete cascade" (cuenta_corriente_supabase.sql, tabla creada así
-- desde el principio) — al borrar el cliente, Postgres borra en cascada
-- cada fila de su libro mayor (cargos y pagos), sin pasar por la app ni
-- por ningún registro de auditoría.
--
-- Ya se agregó una traba del lado de la app (app/clientes/[id]/page.tsx:
-- antes de borrar, revisa si el cliente tiene órdenes, reparaciones,
-- canjes, planes de ahorro, financiación o cuenta corriente, y si tiene
-- algo, rechaza el borrado con un mensaje claro). Este archivo es la
-- segunda capa de defensa, a nivel de base de datos: si en el futuro
-- cualquier otro código (un endpoint, una migración, un acceso directo)
-- intenta borrar un cliente con cuenta corriente, Postgres lo va a
-- bloquear en vez de borrar el historial en silencio — mismo criterio que
-- ya usa financiacion_planes.cliente_id ("on delete restrict").
--
-- Es idempotente (drop constraint if exists + add). Se puede correr las
-- veces que haga falta. NO borra ni cambia ningún dato existente.
-- ============================================================

alter table cta_cte_movimientos drop constraint if exists cta_cte_movimientos_cliente_id_fkey;
alter table cta_cte_movimientos add constraint cta_cte_movimientos_cliente_id_fkey
  foreign key (cliente_id) references clientes(id) on delete restrict;
