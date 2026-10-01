-- ============================================================
-- Cuenta corriente: "Anular" un movimiento sin dejar rastro de por qué
-- (2026-09-30) — reclamo real de un cliente: cualquiera podía anular un
-- cobro/cargo con un simple confirm(), sin dejar motivo ni estar
-- restringido a un rol — en una pantalla de Movimientos compartida entre
-- varios vendedores, una anulación sin motivo es imposible de auditar
-- después.
--
-- Se agrega motivo_anulacion (igual criterio que observacion: texto libre,
-- no se borra nada). El botón ahora exige escribirlo y queda restringido al
-- mismo permiso que ya usa ajustar/reprogramar/anular un plan de
-- financiación (ajustar_financiacion → solo administrador).
-- ============================================================

alter table cta_cte_movimientos add column if not exists motivo_anulacion text;
