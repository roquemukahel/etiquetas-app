-- ============================================================
-- QOVENTO — Cuenta corriente de clientes (base de datos)
--
-- Correr TODO en Supabase > SQL Editor > Run. Es seguro correrlo las
-- veces que quieras: todo es aditivo (if not exists / or replace) y las
-- políticas se recrean con drop-if-exists antes. NO borra ni cambia nada
-- de lo que ya existe, así que se puede correr aunque la página en
-- producción esté funcionando: las tablas y columnas nuevas simplemente
-- quedan disponibles, y el código viejo las ignora.
-- ============================================================


-- ---------- 1) Configuración de crédito por cliente ----------
alter table clientes add column if not exists cta_cte_habilitada boolean not null default false;
alter table clientes add column if not exists limite_credito numeric;              -- null = sin límite
alter table clientes add column if not exists plazo_dias int;                       -- días de vencimiento por defecto
alter table clientes add column if not exists suspendido boolean not null default false;
alter table clientes add column if not exists cta_cte_observaciones text;


-- ---------- 2) Pagos: cada plata que entra ----------
create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  cliente_id uuid references clientes(id) on delete set null,
  orden_id uuid references ordenes(id) on delete set null,     -- null = pago a cuenta / seña
  medio text not null,                                          -- efectivo | transferencia | debito | credito | cheque | usdt
  monto numeric not null,
  moneda text not null default 'ARS',
  comprobante_url text,
  registrado_por_nombre text,
  registrado_por_foto_url text,
  anulado boolean not null default false,
  observacion text,
  fecha timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table pagos enable row level security;

drop policy if exists "pagos de mi negocio" on pagos;
create policy "pagos de mi negocio" on pagos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());


-- ---------- 3) Movimientos de cuenta corriente (el libro mayor) ----------
-- Una línea por cada cosa que mueve el saldo del cliente. El saldo NUNCA se
-- guarda como un campo: se calcula siempre como Σ(cargos) − Σ(abonos).
create table if not exists cta_cte_movimientos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo text not null,                       -- 'cargo' (sube deuda) | 'abono' (baja deuda)
  concepto text not null,                   -- venta | pago | nota_credito | ajuste | interes | sena
  monto numeric not null,                   -- siempre positivo; el signo lo da "tipo"
  moneda text not null default 'ARS',
  orden_id uuid references ordenes(id) on delete set null,
  pago_id uuid references pagos(id) on delete set null,
  vencimiento date,                         -- solo en cargos
  observacion text,
  revierte_a uuid references cta_cte_movimientos(id) on delete set null,  -- contra-asiento
  anulado boolean not null default false,
  registrado_por_nombre text,
  registrado_por_foto_url text,
  fecha timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table cta_cte_movimientos enable row level security;

drop policy if exists "cta_cte_movimientos de mi negocio" on cta_cte_movimientos;
create policy "cta_cte_movimientos de mi negocio" on cta_cte_movimientos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create index if not exists idx_cta_cte_mov_cliente on cta_cte_movimientos (cliente_id) where not anulado;
create index if not exists idx_pagos_cliente on pagos (cliente_id) where not anulado;


-- ---------- 4) Saldos por cliente (para el panel de cuentas por cobrar) ----------
-- Devuelve el saldo de cada cliente del negocio en un solo llamado, sin
-- tener que traer todos los movimientos al navegador. security definer +
-- filtro por negocio_actual() para respetar el aislamiento multi-negocio.
create or replace function saldos_cuenta_corriente()
returns table (cliente_id uuid, saldo numeric, vencido numeric)
language sql
security definer
stable
as $$
  select
    m.cliente_id,
    sum(case when m.tipo = 'cargo' then m.monto else -m.monto end) as saldo,
    sum(case
          when m.tipo = 'cargo' and m.vencimiento is not null and m.vencimiento < current_date
          then m.monto else 0 end) as vencido
  from cta_cte_movimientos m
  where m.negocio_id = negocio_actual() and not m.anulado
  group by m.cliente_id
$$;
