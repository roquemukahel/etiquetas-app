-- ============================================================
-- AUDITORÍA EXHAUSTIVA (2026-08-22) — hallazgo P0: eliminar un vendedor con
-- comisiones generadas borraba en cascada TODO su libro de comisiones
-- (comision_movimientos, "libro inmutable y auditable (nunca se borra)"
-- según el propio comentario de comisiones_supabase.sql) y sus
-- liquidaciones (comision_liquidaciones) — mismo bug que ya se corrigió
-- para clientes.cta_cte_movimientos (ver clientes_proteger_borrado_
-- supabase.sql), pero del lado de comisiones.
--
-- Causa: comisiones_supabase.sql había creado
-- comision_liquidaciones.vendedor_id y comision_movimientos.vendedor_id
-- como "on delete restrict" (a propósito, para que nunca se pudieran
-- perder). Una migración posterior (arreglar_borrado_negocio_supabase.sql,
-- pensada para poder borrar un NEGOCIO entero sin que las FKs internas lo
-- bloquearan) las cambió a "on delete cascade" sin darse cuenta de que
-- eso también afecta el borrado de UN SOLO vendedor desde Configuración
-- → Vendedores, no solo el borrado del negocio completo.
--
-- Esta migración vuelve a dejarlas en "on delete restrict" — la app ya
-- fue corregida en paralelo (app/configuracion/vendedores/page.tsx) para
-- chequear antes de intentar borrar y no dejar que llegue a intentarlo si
-- el vendedor tiene comisiones/ventas.
--
-- comision_plan_vendedores.vendedor_id (la asignación de plan, no un
-- libro contable) se deja "on delete cascade" — ahí sí tiene sentido
-- que se vaya con el vendedor.
--
-- Es idempotente (drop constraint if exists + add). Se puede correr las
-- veces que haga falta. NO borra ni cambia ningún dato existente.
-- ============================================================

alter table comision_liquidaciones drop constraint if exists comision_liquidaciones_vendedor_id_fkey;
alter table comision_liquidaciones add constraint comision_liquidaciones_vendedor_id_fkey
  foreign key (vendedor_id) references vendedores(id) on delete restrict;

alter table comision_movimientos drop constraint if exists comision_movimientos_vendedor_id_fkey;
alter table comision_movimientos add constraint comision_movimientos_vendedor_id_fkey
  foreign key (vendedor_id) references vendedores(id) on delete restrict;
