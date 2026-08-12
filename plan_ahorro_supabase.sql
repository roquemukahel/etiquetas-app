-- Plan de ahorro: sección propia (separada de Proveedores). Un cliente va
-- pagando en cuotas/abonos hasta juntar el monto de un dispositivo puntual;
-- cuando completa el objetivo, se le entrega. Mismo patrón de cuenta
-- corriente que ya usan Proveedores/Clientes (saldo = suma de movimientos,
-- nunca se guarda), pero en tabla propia para no mezclar los dos negocios.
--
-- Correr una sola vez en el SQL Editor de Supabase.

create table if not exists planes_ahorro (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  cliente_id uuid references clientes(id) on delete set null,
  modelo text,
  capacidad_gb int,
  color text,
  monto_objetivo numeric not null,
  detalles text,
  estado text not null default 'activo', -- 'activo' | 'completado' | 'cancelado'
  created_at timestamptz not null default now()
);

alter table planes_ahorro enable row level security;

drop policy if exists "planes_ahorro de mi negocio" on planes_ahorro;
create policy "planes_ahorro de mi negocio" on planes_ahorro
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create table if not exists plan_ahorro_movimientos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  plan_id uuid not null references planes_ahorro(id) on delete cascade,
  monto numeric not null,
  medio text,
  observacion text,
  anulado boolean not null default false,
  registrado_por_nombre text,
  registrado_por_foto_url text,
  fecha timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table plan_ahorro_movimientos enable row level security;

drop policy if exists "plan_ahorro_movimientos de mi negocio" on plan_ahorro_movimientos;
create policy "plan_ahorro_movimientos de mi negocio" on plan_ahorro_movimientos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create index if not exists idx_plan_ahorro_mov on plan_ahorro_movimientos (plan_id) where not anulado;

create or replace function saldos_planes_ahorro()
returns table (plan_id uuid, pagado numeric)
language sql
security definer
stable
as $$
  select m.plan_id, sum(m.monto) as pagado
  from plan_ahorro_movimientos m
  where m.negocio_id = negocio_actual() and not m.anulado
  group by m.plan_id
$$;

grant execute on function saldos_planes_ahorro() to authenticated;

-- Términos y condiciones configurables para el comprobante de pago, propio
-- de Plan de ahorro (no comparte texto con la declaración de Proveedores).
alter table negocios add column if not exists texto_declaracion_plan_ahorro text;
alter table negocios add column if not exists texto_declaracion_plan_ahorro_tamano int not null default 11;
