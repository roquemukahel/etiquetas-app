-- Nueva columna para saber si una reparación de un equipo propio ya se pasó
-- al Stock (antes no había forma de distinguirlo, así que el botón
-- "Agregar al Stock" solo podía mostrarse mientras estaba "Listo para
-- entregar" — una vez "Entregado" desaparecía para siempre, se haya
-- agregado o no).
alter table reparaciones add column if not exists agregado_a_stock boolean not null default false;

-- Backfill: marcamos como ya agregadas las reparaciones "Entregado" de
-- equipo propio (sin cliente) cuyo IMEI ya aparece en Stock — así, para
-- reparaciones viejas que sí se habían agregado, no vuelve a aparecer el
-- cartel de "Agregar al Stock" y no hay riesgo de duplicar el dispositivo.
update reparaciones r
set agregado_a_stock = true
where r.cliente_id is null
  and r.estado = 'entregado'
  and r.imei is not null
  and exists (
    select 1 from dispositivos d where d.imei = r.imei and d.negocio_id = r.negocio_id
  );
