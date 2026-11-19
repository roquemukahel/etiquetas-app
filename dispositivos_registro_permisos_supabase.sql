-- ============================================================
-- Dispositivos: siempre con quién los agregó + permiso propio para eliminarlos del Stock (2026-11-18)
--
-- Correr UNA vez en Supabase > SQL Editor > Run. Seguro de correr las veces que quieras (aditivo e idempotente).
-- Mientras no se corra, todo funciona como siempre (la pantalla ya exige elegir quién sos al agregar un dispositivo).
-- ============================================================

-- 1) Permiso "Puede eliminar dispositivos del stock a mano", separado de "Puede eliminar" (que junta órdenes, clientes, canjes y compras).
--    Cada persona arranca con el MISMO valor que ya tenía en "Puede eliminar", así nadie gana ni pierde acceso de golpe.
--    Se completa SOLO al crear la columna (no pisa lo que el dueño configure después si se vuelve a correr).
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'vendedores' and column_name = 'puede_eliminar_dispositivos') then
    alter table vendedores add column puede_eliminar_dispositivos boolean not null default true;
    update vendedores set puede_eliminar_dispositivos = coalesce(puede_eliminar, true);
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'tecnicos' and column_name = 'puede_eliminar_dispositivos') then
    alter table tecnicos add column puede_eliminar_dispositivos boolean not null default true;
    update tecnicos set puede_eliminar_dispositivos = coalesce(puede_eliminar, true);
  end if;
end $$;

-- 2) Un dispositivo NUEVO no se puede guardar sin quién lo agregó. Es un candado en la base (no solo en la pantalla):
--    vale para cualquier forma de cargar equipos (a mano, importación, canje, compra, servicio técnico, standby…).
--    Solo mira las altas nuevas: los dispositivos que ya estaban sin registrar se pueden seguir vendiendo y editando.
create or replace function dispositivos_exigir_agregado_por()
returns trigger
language plpgsql
as $$
begin
  if new.agregado_por_nombre is null or length(trim(new.agregado_por_nombre)) = 0 then
    raise exception 'Falta indicar quién agregó el dispositivo. Elegí quién sos (arriba, donde dice "Cambiar") y volvé a intentar.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dispositivos_exigir_agregado_por on dispositivos;
create trigger trg_dispositivos_exigir_agregado_por
  before insert on dispositivos
  for each row execute function dispositivos_exigir_agregado_por();
