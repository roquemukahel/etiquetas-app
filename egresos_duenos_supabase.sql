-- ============================================================
-- QOVENTO — Egresos: retiros automáticos de caja con categoría propia, categorías
-- "solo dueños", función de cada categoría (retiros de dueños / sueldo de dueños /
-- traslado-arqueo) y "Pagado desde" (caja del local / billetera del dueño).
-- Migración ADITIVA e IDEMPOTENTE: se puede correr más de una vez.
-- Requiere haber corrido antes egresos_supabase.sql y caja_vuelto_separado_supabase.sql.
-- ============================================================

-- 1) Categorías: "solo dueños" y función
alter table egresos_categorias add column if not exists solo_duenos boolean not null default false;
alter table egresos_categorias add column if not exists rol text;
alter table egresos_categorias drop constraint if exists egresos_categorias_rol_valido;
alter table egresos_categorias add constraint egresos_categorias_rol_valido
  check (rol is null or rol in ('retiro_duenos', 'sueldo_duenos', 'traslado_arqueo'));
-- Una sola categoría activa por función en cada negocio.
create unique index if not exists uq_egresos_categorias_rol
  on egresos_categorias(negocio_id, rol) where rol is not null and not archivada;

-- 2) Egresos: desde dónde se pagó
alter table egresos add column if not exists pagado_desde text not null default 'caja';
alter table egresos drop constraint if exists egresos_pagado_desde_valido;
alter table egresos add constraint egresos_pagado_desde_valido check (pagado_desde in ('caja', 'billetera_dueno'));

-- 3) Las categorías que el negocio ya tenía para dueños se reconocen por nombre (sin tildes, sin
--    mayúsculas). Se puede cambiar después desde Configuración > Categorías de egresos.
update egresos_categorias
   set solo_duenos = true
 where not archivada
   and lower(translate(nombre, 'áéíóúñ', 'aeioun')) in
       ('sueldo duenos', 'sueldos duenos', 'sueldo de duenos', 'retiros de duenos', 'retiro de duenos', 'retiros duenos',
        'inversiones', 'pago de capital de prestamos');

with elegido as (
  select distinct on (negocio_id) id
    from egresos_categorias
   where not archivada and rol is null
     and lower(translate(nombre, 'áéíóúñ', 'aeioun')) in ('retiros de duenos', 'retiro de duenos', 'retiros duenos')
     and not exists (select 1 from egresos_categorias x where x.negocio_id = egresos_categorias.negocio_id and x.rol = 'retiro_duenos' and not x.archivada)
   order by negocio_id, created_at
)
update egresos_categorias c set rol = 'retiro_duenos' from elegido e where c.id = e.id;

with elegido as (
  select distinct on (negocio_id) id
    from egresos_categorias
   where not archivada and rol is null
     and lower(translate(nombre, 'áéíóúñ', 'aeioun')) in ('sueldo duenos', 'sueldos duenos', 'sueldo de duenos')
     and not exists (select 1 from egresos_categorias x where x.negocio_id = egresos_categorias.negocio_id and x.rol = 'sueldo_duenos' and not x.archivada)
   order by negocio_id, created_at
)
update egresos_categorias c set rol = 'sueldo_duenos' from elegido e where c.id = e.id;

-- 4) Categoría "Traslado / arqueo" para los retiros automáticos del cierre de turno (una por negocio).
update egresos_categorias c
   set rol = 'traslado_arqueo'
 where not c.archivada and c.rol is null
   and lower(translate(c.nombre, 'áéíóúñ', 'aeioun')) = 'traslado / arqueo'
   and not exists (select 1 from egresos_categorias x where x.negocio_id = c.negocio_id and x.rol = 'traslado_arqueo' and not x.archivada);

insert into egresos_categorias (negocio_id, nombre, orden, rol)
select n.id, 'Traslado / arqueo', 99, 'traslado_arqueo'
  from negocios n
 where not exists (select 1 from egresos_categorias x where x.negocio_id = n.id and x.rol = 'traslado_arqueo' and not x.archivada)
   and not exists (select 1 from egresos_categorias y where y.negocio_id = n.id and lower(y.nombre) = 'traslado / arqueo' and not y.archivada);

-- Esa categoría no es un gasto (si el negocio ya usa el campo tipo_gasto).
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'egresos_categorias' and column_name = 'tipo_gasto') then
    execute $q$update egresos_categorias set tipo_gasto = 'no_es_gasto' where rol = 'traslado_arqueo' and tipo_gasto is distinct from 'no_es_gasto'$q$;
  end if;
end $$;

-- Los retiros automáticos que ya existían (sin categoría) pasan a "Traslado / arqueo".
update egresos e
   set categoria_id = c.id
  from egresos_categorias c
 where e.categoria_id is null
   and e.caja_turno_id is not null
   and c.negocio_id = e.negocio_id
   and c.rol = 'traslado_arqueo'
   and not c.archivada;

-- 5) caja_cerrar_turno: igual que en caja_vuelto_separado_supabase.sql, pero el retiro automático
--    queda con la categoría "Traslado / arqueo" (la crea si no existe).
create or replace function caja_cerrar_turno(
  p_turno_id uuid,
  p_efectivo_declarado numeric,
  p_observacion text default null,
  p_cerrada_por text default null,
  p_efectivo_vuelto numeric default null
)
returns caja_turnos
language plpgsql
security definer
as $$
declare
  v_turno caja_turnos;
  v_caja cajas;
  v_total_efectivo numeric;
  v_esperado numeric;
  v_vuelto numeric;
  v_retiro numeric;
  v_categoria uuid;
begin
  select * into v_turno from caja_turnos where id = p_turno_id and negocio_id = negocio_actual() for update;
  if not found then
    raise exception 'Turno inexistente o de otro negocio';
  end if;
  if v_turno.estado <> 'abierta' then
    raise exception 'Este turno ya está cerrado';
  end if;

  select * into v_caja from cajas where id = v_turno.caja_id;

  select coalesce(sum(monto), 0) into v_total_efectivo
  from pagos
  where negocio_id = negocio_actual()
    and caja_tipo = v_caja.tipo
    and medio = 'efectivo'
    and moneda = v_turno.moneda
    and not anulado
    and fecha >= v_turno.abierta_en
    and fecha <= now()
    and coalesce(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(v_caja.sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_esperado := v_turno.efectivo_inicial + v_total_efectivo;

  v_vuelto := coalesce(p_efectivo_vuelto, p_efectivo_declarado);
  v_retiro := greatest(0, p_efectivo_declarado - v_vuelto);

  update caja_turnos
  set estado = 'cerrada',
      cerrada_en = now(),
      cerrada_por = p_cerrada_por,
      efectivo_declarado = p_efectivo_declarado,
      efectivo_vuelto = v_vuelto,
      efectivo_esperado = v_esperado,
      diferencia = p_efectivo_declarado - v_esperado,
      observacion = p_observacion
  where id = p_turno_id
  returning * into v_turno;

  if v_retiro > 0.009 then
    select id into v_categoria from egresos_categorias
     where negocio_id = negocio_actual() and rol = 'traslado_arqueo' and not archivada limit 1;
    if v_categoria is null then
      begin
        insert into egresos_categorias (negocio_id, nombre, orden, rol)
        values (negocio_actual(), 'Traslado / arqueo', 99, 'traslado_arqueo')
        returning id into v_categoria;
      exception when unique_violation then
        select id into v_categoria from egresos_categorias
         where negocio_id = negocio_actual() and lower(nombre) = 'traslado / arqueo' and not archivada limit 1;
      end;
    end if;

    insert into egresos (negocio_id, sucursal_id, caja_turno_id, categoria_id, tipo, descripcion, importe, moneda, medio_pago, registrado_por_nombre)
    values (
      negocio_actual(),
      v_caja.sucursal_id,
      p_turno_id,
      v_categoria,
      'retiro',
      'Retiro de caja al cerrar el turno N° ' || v_turno.numero || ' de ' || v_caja.nombre,
      v_retiro,
      v_turno.moneda,
      'efectivo',
      p_cerrada_por
    );
  end if;

  return v_turno;
end;
$$;
