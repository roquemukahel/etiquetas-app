-- ============================================================
-- QOVENTO — Cuentas por pagar a proveedores (lo que VOS les debés)
-- Correr en Supabase > SQL Editor > Run. Seguro (aditivo, idempotente).
--
-- Espejo de la cuenta corriente de clientes, pero al revés: acá se lleva
-- lo que el negocio le debe a cada proveedor. El saldo NUNCA se guarda:
-- se calcula siempre como Σ(deudas) − Σ(pagos).
--   tipo 'cargo' = te endeudás más (una compra a deber / deuda)
--   tipo 'abono' = le pagás (baja lo que le debés)
-- ============================================================

create table if not exists proveedor_movimientos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  proveedor_id uuid not null references proveedores(id) on delete cascade,
  tipo text not null,                 -- 'cargo' (aumenta la deuda) | 'abono' (le pagaste)
  concepto text not null,             -- deuda | pago | ajuste
  monto numeric not null,             -- siempre positivo; el signo lo da "tipo"
  moneda text not null default 'ARS',
  medio text,                         -- para pagos: efectivo/transferencia/etc (opcional)
  observacion text,
  anulado boolean not null default false,
  registrado_por_nombre text,
  registrado_por_foto_url text,
  fecha timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table proveedor_movimientos enable row level security;

drop policy if exists "proveedor_movimientos de mi negocio" on proveedor_movimientos;
create policy "proveedor_movimientos de mi negocio" on proveedor_movimientos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create index if not exists idx_proveedor_mov on proveedor_movimientos (proveedor_id) where not anulado;

-- Saldo por proveedor (lo que le debés) en un solo llamado, para el panel de
-- Cuentas por pagar y la lista de proveedores. security definer + filtro por
-- negocio_actual() para respetar el aislamiento multi-negocio.
create or replace function saldos_proveedores()
returns table (proveedor_id uuid, saldo numeric)
language sql
security definer
stable
as $$
  select
    m.proveedor_id,
    sum(case when m.tipo = 'cargo' then m.monto else -m.monto end) as saldo
  from proveedor_movimientos m
  where m.negocio_id = negocio_actual() and not m.anulado
  group by m.proveedor_id
$$;

grant execute on function saldos_proveedores() to authenticated;
