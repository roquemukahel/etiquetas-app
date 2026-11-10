-- ============================================================
-- Clientes: fuente de ingreso, día de cobro, rango de pago pactado, calidad del cliente (2026-11-10)
--
-- Correr UNA vez en Supabase > SQL Editor > Run. Seguro de correr las veces que quieras (aditivo, no toca ningún dato).
-- Mientras no se corra, la app sigue como siempre: la ficha del cliente no muestra estos campos y los filtros nuevos no aparecen.
--
-- Pedido real de un cliente: saber de qué cobra cada cliente y cuándo (empleado estatal, jubilado, AUH...), poder avisar
-- "ya cobró y no pagó", y calificar al cliente (bueno / regular / riesgoso).
-- ============================================================

alter table clientes add column if not exists fuente_ingreso text;
alter table clientes add column if not exists dia_cobro smallint;
alter table clientes add column if not exists rango_pago text;
alter table clientes add column if not exists calificacion text;
alter table clientes add column if not exists observaciones_cobro text;

alter table clientes drop constraint if exists clientes_dia_cobro_valido;
alter table clientes add constraint clientes_dia_cobro_valido check (dia_cobro is null or (dia_cobro between 1 and 31));
alter table clientes drop constraint if exists clientes_calificacion_valida;
alter table clientes add constraint clientes_calificacion_valida check (calificacion is null or calificacion in ('bueno', 'regular', 'riesgoso'));

create index if not exists idx_clientes_calificacion on clientes(negocio_id, calificacion) where calificacion is not null;

-- Cronograma de cobro por terminación de DNI (jubilaciones y AUH pagan según el último dígito del DNI).
-- Una fila por fuente + terminación (0 a 9) con el día del mes en que cobran. Lo carga el negocio una vez (cambia poco).
create table if not exists cronograma_cobro (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  fuente text not null,
  terminacion smallint not null check (terminacion between 0 and 9),
  dia smallint not null check (dia between 1 and 31),
  created_at timestamptz not null default now()
);
create unique index if not exists uq_cronograma_cobro on cronograma_cobro(negocio_id, fuente, terminacion);

alter table cronograma_cobro enable row level security;
drop policy if exists "cronograma de mi negocio" on cronograma_cobro;
create policy "cronograma de mi negocio" on cronograma_cobro
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());
