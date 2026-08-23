-- ============================================================
-- AUDITORÍA EXHAUSTIVA (2026-08-22) — hallazgo P2: dos clientes distintos
-- podían terminar con un plan de ahorro activo señando el MISMO
-- dispositivo. La pantalla de "Nuevo plan de ahorro" arma la lista de
-- equipos disponibles para señar excluyendo los ya reservados, pero esa
-- lista se carga una sola vez al abrir la pantalla — no hay ningún chequeo
-- atómico contra otro plan que se cree casi al mismo tiempo (señar un
-- equipo NO cambia dispositivos.en_stock, eso solo pasa recién al
-- completar la venta), así que dos personas podían confirmar casi
-- simultáneo sobre el mismo equipo sin que la base lo impidiera.
--
-- Este índice único parcial hace que la base rechace directamente el
-- segundo intento: solo puede existir UN plan 'activo' por dispositivo a
-- la vez. Un plan 'completado' o 'cancelado' no cuenta (ese dispositivo
-- ya se vendió o el plan se dio de baja, así que puede señarse de nuevo
-- para otro cliente sin problema).
--
-- Es aditivo y seguro de re-correr (if not exists). Si ya existiera algún
-- caso de dos planes activos sobre el mismo dispositivo (por el bug de
-- arriba), este CREATE fallará avisando cuáles son —revisalos a mano
-- (cancelá o reasigná uno) antes de volver a correrlo.
-- ============================================================

create unique index if not exists idx_planes_ahorro_dispositivo_activo_unico
  on planes_ahorro (dispositivo_id)
  where estado = 'activo' and dispositivo_id is not null;
