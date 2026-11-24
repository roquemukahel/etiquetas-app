-- ============================================================
-- QOVENTO — Seguimiento público de órdenes de Servicio Técnico para otra app + avisos push (2026-11-02)
--
-- Correr en Supabase > SQL Editor > Run. Seguro de correr las veces que quieras (aditivo).
--
-- Qué agrega:
--  1) Cada reparación tiene un "código de seguimiento" de 8 caracteres al azar (ej. K7P2QX9M), único en todo Qovento.
--     Las órdenes que ya existen reciben el suyo ahora.
--  2) "nota_cliente": un texto opcional para el cliente, que se edita en la ficha de la orden.
--  3) Historial de cambios de estado (lo llena un disparador, así que cubre TODOS los lugares donde cambia el estado).
--  4) Tokens de las notificaciones push (Expo) por orden.
--  5) Tope de consultas por minuto por IP para los enlaces públicos.
--  6) Cuando una orden con tokens cambia de estado, la base avisa a /api/push-orden (con pg_net, igual que el aviso de pagos);
--     si ese aviso fallara, el cambio de estado se guarda igual.
-- ============================================================

create extension if not exists pg_net;

-- 1) Código de seguimiento --------------------------------------------------------------------------------------------
alter table reparaciones add column if not exists codigo_seguimiento text;
alter table reparaciones add column if not exists nota_cliente text;
alter table reparaciones add column if not exists seguimiento_actualizado_at timestamptz;
alter table reparaciones add column if not exists push_estado_avisado text;

-- 8 símbolos de un alfabeto sin I, O, 0 ni 1 (se confunden al leer o dictar). La aleatoriedad sale de gen_random_uuid()
-- (criptográficamente segura): se usan solo bytes del uuid que son 100 % al azar (0-5, 7 y 9), y 256 es múltiplo de 32,
-- así que todos los símbolos tienen la misma probabilidad.
create or replace function generar_codigo_seguimiento()
returns text
language plpgsql
volatile
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  nuevo text;
  i int;
begin
  loop
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    nuevo := '';
    for i in 0..7 loop
      nuevo := nuevo || substr(alfabeto, (get_byte(bytes, case when i < 6 then i when i = 6 then 7 else 9 end) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from reparaciones where codigo_seguimiento = nuevo);
  end loop;
  return nuevo;
end;
$$;

update reparaciones set codigo_seguimiento = generar_codigo_seguimiento() where codigo_seguimiento is null;

alter table reparaciones alter column codigo_seguimiento set default generar_codigo_seguimiento();
alter table reparaciones alter column codigo_seguimiento set not null;
create unique index if not exists reparaciones_codigo_seguimiento_idx on reparaciones(codigo_seguimiento);

-- 3) Historial de estados ---------------------------------------------------------------------------------------------
create table if not exists reparaciones_estados_historial (
  id uuid primary key default gen_random_uuid(),
  reparacion_id uuid not null references reparaciones(id) on delete cascade,
  estado text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_reparaciones_estados_historial on reparaciones_estados_historial(reparacion_id, created_at);
-- Sin políticas a propósito: el personal no lo lee desde el navegador, solo el servidor con la clave de servicio.
alter table reparaciones_estados_historial enable row level security;

-- Órdenes que ya existían: su ingreso y, si hoy están en otro estado, el cambio más reciente que se conoce.
insert into reparaciones_estados_historial (reparacion_id, estado, created_at)
select r.id, 'recibido', coalesce(r.fecha_ingreso_servicio, r.created_at)
from reparaciones r
where not exists (select 1 from reparaciones_estados_historial h where h.reparacion_id = r.id);

insert into reparaciones_estados_historial (reparacion_id, estado, created_at)
select r.id, r.estado, coalesce(r.estado_actualizado_at, now())
from reparaciones r
where r.estado <> 'recibido'
  and (select count(*) from reparaciones_estados_historial h where h.reparacion_id = r.id) = 1
  and exists (select 1 from reparaciones_estados_historial h where h.reparacion_id = r.id and h.estado = 'recibido');

-- 4) Tokens de notificaciones push -------------------------------------------------------------------------------------
create table if not exists reparaciones_push_tokens (
  id uuid primary key default gen_random_uuid(),
  reparacion_id uuid not null references reparaciones(id) on delete cascade,
  token text not null check (length(token) <= 200),
  created_at timestamptz not null default now(),
  unique (reparacion_id, token)
);
alter table reparaciones_push_tokens enable row level security;

-- 5) Tope de consultas por IP -----------------------------------------------------------------------------------------
create table if not exists limite_consultas (
  clave text not null,
  ventana timestamptz not null,
  cantidad int not null default 0,
  primary key (clave, ventana)
);
create index if not exists idx_limite_consultas_ventana on limite_consultas(ventana);
alter table limite_consultas enable row level security;

-- Suma una consulta a la clave (ej. 'orden:200.1.2.3') en el minuto actual y devuelve cuántas lleva. De vez en cuando
-- limpia lo viejo para que la tabla no crezca.
create or replace function consumir_limite_consulta(p_clave text)
returns int
language plpgsql
security definer
as $$
declare
  v_cantidad int;
begin
  insert into limite_consultas (clave, ventana, cantidad)
  values (p_clave, date_trunc('minute', now()), 1)
  on conflict (clave, ventana) do update set cantidad = limite_consultas.cantidad + 1
  returning cantidad into v_cantidad;

  if random() < 0.02 then
    delete from limite_consultas where ventana < now() - interval '1 hour';
  end if;

  return v_cantidad;
end;
$$;

revoke all on function consumir_limite_consulta(text) from public, anon, authenticated;
grant execute on function consumir_limite_consulta(text) to service_role;

-- Reclama el aviso del estado actual de una orden: devuelve el estado si todavía no se avisó (y lo deja marcado), o null si
-- ya se avisó. Así, aunque lleguen dos pedidos a la vez por el mismo cambio, el cliente recibe un solo aviso.
create or replace function reparacion_reclamar_aviso(p_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_estado text;
begin
  update reparaciones
  set push_estado_avisado = estado
  where id = p_id and push_estado_avisado is distinct from estado
  returning estado into v_estado;
  return v_estado;
end;
$$;

revoke all on function reparacion_reclamar_aviso(uuid) from public, anon, authenticated;
grant execute on function reparacion_reclamar_aviso(uuid) to service_role;

-- 2 y 3) Disparadores ---------------------------------------------------------------------------------------------------
-- La hora de "última novedad" que ve el cliente cambia solo cuando cambia el estado o la nota para el cliente.
create or replace function reparacion_antes_de_actualizar()
returns trigger
language plpgsql
as $$
begin
  if new.estado is distinct from old.estado or new.nota_cliente is distinct from old.nota_cliente then
    new.seguimiento_actualizado_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reparacion_antes_de_actualizar on reparaciones;
create trigger trg_reparacion_antes_de_actualizar
  before update on reparaciones
  for each row
  execute function reparacion_antes_de_actualizar();

-- Registra cada estado en el historial y, si la orden tiene dispositivos suscriptos, avisa al servidor para mandar el push.
create or replace function reparacion_registrar_estado()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    insert into reparaciones_estados_historial (reparacion_id, estado, created_at)
    values (new.id, new.estado, coalesce(new.fecha_ingreso_servicio, now()));
  elsif new.estado is distinct from old.estado then
    insert into reparaciones_estados_historial (reparacion_id, estado) values (new.id, new.estado);

    if exists (select 1 from reparaciones_push_tokens where reparacion_id = new.id) then
      -- Que falle el aviso (sin red, pg_net apagado, etc.) nunca puede impedir que se guarde el cambio de estado.
      begin
        perform net.http_post(
          url := 'https://www.qovento.app/api/push-orden',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := jsonb_build_object('reparacion_id', new.id),
          timeout_milliseconds := 8000
        );
      exception when others then
        null;
      end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reparacion_registrar_estado on reparaciones;
create trigger trg_reparacion_registrar_estado
  after insert or update of estado on reparaciones
  for each row
  execute function reparacion_registrar_estado();
