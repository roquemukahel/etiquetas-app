-- Plan Canje: condición del dispositivo recibido (usado/sellado) y ubicación
-- física (dónde está guardado, ej. "Tribuna", "Estante A-3"). "condicion" es
-- un campo NUEVO y distinto de "estado" (que ya existe y es el estado del
-- FLUJO del canje: en_canje | servicio_tecnico) — no se reutiliza esa
-- columna para no pisar su significado actual.
alter table canjes add column if not exists condicion text not null default 'usado' check (condicion in ('usado', 'sellado'));
alter table canjes add column if not exists ubicacion_fisica text;
