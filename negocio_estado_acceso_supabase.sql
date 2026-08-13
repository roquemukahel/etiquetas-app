-- ============================================================
-- QOVENTO — Velocidad: combinar negocio_activo() + negocio_suscripcion_activa()
-- Correr en Supabase > SQL Editor > Run. Seguro (solo agrega una función
-- nueva, no toca ni borra las dos que ya existían — siguen funcionando
-- igual que antes para quien las use).
--
-- El middleware (que corre en CADA página que se visita) las llamaba una
-- después de la otra: dos viajes de ida y vuelta a la base en serie, para
-- dos preguntas chiquitas. Esta función nueva devuelve las dos respuestas
-- juntas en un solo viaje — el middleware pasa a llamar UNA función en vez
-- de dos.
--
-- IMPORTANTE: correr este SQL ANTES de mergear a producción la rama que
-- usa esta función (si el código nuevo llega a producción sin que la
-- función exista todavía, el chequeo de cuenta desactivada/suscripción
-- vencida queda sin efecto hasta correr esto — no rompe nada, pero no
-- protege esas dos pantallas mientras tanto).
-- ============================================================

create or replace function negocio_estado_acceso()
returns table (activo boolean, suscripcion_activa boolean)
language sql
security definer
stable
as $$
  select negocio_activo() as activo, negocio_suscripcion_activa() as suscripcion_activa
$$;
