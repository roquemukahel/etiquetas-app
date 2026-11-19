-- ============================================================
-- Egresos que salen de la Caja (2026-11-18)
--
-- Correr UNA vez en Supabase > SQL Editor > Run. Seguro de correr las veces que quieras (aditivo).
-- Requiere haber corrido antes egresos_duenos_supabase.sql e ingresos_capital_supabase.sql.
--
-- Pedido real: "hice un egreso pero no se descontó de la plata que hay en la caja".
-- El efectivo esperado del turno solo sumaba ventas e ingresos de capital y nunca restaba los egresos. Ahora un egreso pagado en
-- efectivo desde la caja (no desde la billetera de un dueño) baja el efectivo esperado, tanto en pantalla como en el cierre.
-- ============================================================

-- 1) De qué caja sale el efectivo de un egreso (Venta diaria o Financiamiento). Vacío = Venta diaria.
alter table egresos add column if not exists caja_tipo text;
alter table egresos drop constraint if exists egresos_caja_tipo_valido;
alter table egresos add constraint egresos_caja_tipo_valido check (caja_tipo is null or caja_tipo in ('venta_diaria', 'financiamiento'));

-- 2) Cierre de turno: el efectivo esperado resta los egresos en efectivo de esa caja cargados durante el turno.
--    Se excluye el retiro automático del cierre (tiene caja_turno_id): es el efectivo ya contado, no un gasto del turno.
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
  v_ingresos_efectivo numeric;
  v_egresos_efectivo numeric;
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

  select coalesce(sum(importe), 0) into v_ingresos_efectivo
  from ingresos
  where negocio_id = negocio_actual()
    and caja_tipo = v_caja.tipo
    and medio_pago = 'efectivo'
    and moneda = v_turno.moneda
    and not anulado
    and created_at >= v_turno.abierta_en
    and created_at <= now()
    and coalesce(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(v_caja.sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid);

  select coalesce(sum(importe), 0) into v_egresos_efectivo
  from egresos
  where negocio_id = negocio_actual()
    and coalesce(caja_tipo, 'venta_diaria') = v_caja.tipo
    and medio_pago = 'efectivo'
    and pagado_desde = 'caja'
    and caja_turno_id is null
    and moneda = v_turno.moneda
    and not anulado
    and created_at >= v_turno.abierta_en
    and created_at <= now()
    and coalesce(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(v_caja.sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_esperado := v_turno.efectivo_inicial + v_total_efectivo + v_ingresos_efectivo - v_egresos_efectivo;

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
