-- ============================================================
-- CAJA: separar "efectivo contado" de "vuelto para mañana" (2026-09-08) —
-- bug real reportado por un cliente, relayado por roque.
--
-- Hasta ahora "efectivo_declarado" cumplía DOS roles a la vez: (1) contra
-- qué se compara el efectivo esperado para calcular la diferencia
-- (faltante/sobrante) del turno que se cierra, y (2) la semilla del
-- efectivo_inicial del turno siguiente (ver caja_asegurar_turno_abierto,
-- caja_auto_apertura_supabase.sql). Esos dos números casi nunca son el
-- mismo en la práctica: alguien cuenta $150.000 en el cajón al cerrar,
-- pero solo quiere DEJAR $50.000 de cambio para mañana (el resto se
-- deposita/retira). Con un solo campo, declarar $150.000 hace que mañana
-- arranque con $150.000 (herencia de toda la recaudación como si fuera
-- vuelto); declarar solo $50.000 marca un "faltante" de $100.000 que en
-- realidad nunca faltó — ambos casos rompían el arqueo real del negocio.
--
-- Se separa en dos campos:
--   - efectivo_declarado (YA EXISTÍA): lo que hay contado físicamente en
--     el cajón — se sigue comparando contra el esperado para la
--     diferencia real. Sin cambios de significado acá.
--   - efectivo_vuelto (NUEVO): cuánto de eso se decide DEJAR para el
--     turno siguiente. Es lo que ahora alimenta el efectivo_inicial de
--     mañana (en vez de efectivo_declarado).
-- La diferencia entre ambos (declarado − vuelto, cuando es positiva) se
-- registra sola como un egreso tipo "retiro" — ni faltante ni cambio,
-- es plata que salió del cajón hacia otro lado (depósito, retiro del
-- dueño, etc.), así el negocio no pierde el rastro de esa plata.
-- ============================================================

alter table caja_turnos add column if not exists efectivo_vuelto numeric;

-- Vínculo explícito (no por texto/descripción, frágil) entre el retiro
-- automático y el turno que lo generó — hace falta para poder anularlo
-- solo si el cierre se deshace (ver caja_reabrir_turno más abajo).
alter table egresos add column if not exists caja_turno_id uuid references caja_turnos(id) on delete set null;

-- caja_cerrar_turno: mismo cálculo de diferencia que antes (siempre contra
-- efectivo_declarado, el conteo real), más el nuevo p_efectivo_vuelto y el
-- retiro automático por la diferencia entre lo contado y lo que se deja.
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

  -- Si no mandan vuelto explícito (llamadas viejas, o clientes que todavía
  -- no actualizaron), se mantiene el comportamiento anterior: se deja todo
  -- lo contado como vuelto, ningún retiro automático.
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

  -- Retiro automático: la plata que se contó pero NO se deja de cambio no
  -- es un faltante (ya se contó y está anotada acá) ni tampoco queda
  -- "perdida" — se registra como egreso tipo 'retiro' para que el negocio
  -- sepa adónde fue esa plata (depósito, retiro del dueño, etc.) sin tener
  -- que cargarlo a mano por separado.
  if v_retiro > 0.009 then
    insert into egresos (negocio_id, sucursal_id, caja_turno_id, tipo, descripcion, importe, moneda, medio_pago, registrado_por_nombre)
    values (
      negocio_actual(),
      v_caja.sucursal_id,
      p_turno_id,
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

-- caja_asegurar_turno_abierto: usa el VUELTO (no el declarado) del último
-- cierre como inicial del turno nuevo — con fallback a efectivo_declarado
-- para turnos cerrados ANTES de esta migración (que no tienen vuelto
-- propio cargado).
create or replace function caja_asegurar_turno_abierto(
  p_caja_id uuid,
  p_por text default null,
  p_moneda_default text default 'ARS'
)
returns caja_turnos
language plpgsql
security definer
as $$
declare
  v_ultimo_cerrado caja_turnos;
begin
  select * into v_ultimo_cerrado
    from caja_turnos
    where caja_id = p_caja_id and estado = 'cerrada'
    order by numero desc
    limit 1;

  return caja_abrir_turno(
    p_caja_id,
    coalesce(v_ultimo_cerrado.efectivo_vuelto, v_ultimo_cerrado.efectivo_declarado, 0),
    coalesce(v_ultimo_cerrado.moneda, p_moneda_default),
    p_por
  );
end;
$$;

-- caja_reabrir_turno: igual que antes, pero además resetea efectivo_vuelto
-- (columna nueva, quedaba afuera del reset) y ANULA el retiro automático
-- que caja_cerrar_turno pudo haber generado para este turno — si se
-- deshace el cierre, esa plata nunca "salió" de verdad, así que el retiro
-- tiene que dejar de contar (sin borrarlo: se anula, mismo criterio que
-- cualquier otro movimiento anulado en la app, para no perder el rastro).
create or replace function caja_reabrir_turno(p_turno_id uuid)
returns caja_turnos
language plpgsql
security definer
as $$
declare
  v_turno caja_turnos;
  v_siguiente caja_turnos;
begin
  select * into v_turno from caja_turnos where id = p_turno_id and negocio_id = negocio_actual() for update;
  if not found then
    raise exception 'Turno inexistente o de otro negocio';
  end if;
  if v_turno.estado <> 'cerrada' then
    raise exception 'Este turno no está cerrado';
  end if;

  select * into v_siguiente from caja_turnos
    where caja_id = v_turno.caja_id and numero = v_turno.numero + 1 for update;

  if found then
    if v_siguiente.estado <> 'abierta' then
      raise exception 'No se puede reabrir: ya se cerró un turno posterior de esta caja';
    end if;
    delete from caja_turnos where id = v_siguiente.id;
  end if;

  update egresos set anulado = true where caja_turno_id = p_turno_id and not anulado;

  update caja_turnos
  set estado = 'abierta',
      cerrada_en = null,
      cerrada_por = null,
      efectivo_declarado = null,
      efectivo_vuelto = null,
      efectivo_esperado = null,
      diferencia = null
  where id = p_turno_id
  returning * into v_turno;

  return v_turno;
end;
$$;
