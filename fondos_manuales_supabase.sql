-- ============================================================
-- QOVENTO — Fondos disponibles: saldo manual de la empresa en 3 categorías
-- (efectivo en pesos, transferencias en pesos, dólares en efectivo),
-- INDEPENDIENTE de la apertura/cierre de turno de Caja. Solo
-- administradores lo ven y lo mueven (permiso 'gestionar_fondos', ya
-- resuelto en el código — no necesita columna nueva en vendedores/tecnicos).
-- Migración ADITIVA e IDEMPOTENTE: se puede correr más de una vez.
-- ============================================================

create table if not exists fondos_movimientos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  fecha date not null default current_date,
  categoria text not null,  -- efectivo_ars | transferencia_ars | efectivo_usd
  tipo text not null,       -- ingreso | egreso
  importe numeric not null,
  descripcion text not null,
  notas text,
  anulado boolean not null default false,
  registrado_por_nombre text,
  registrado_por_foto_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fondos_mov_importe_positivo check (importe > 0),
  constraint fondos_mov_descripcion_no_vacia check (length(trim(descripcion)) > 0),
  constraint fondos_mov_categoria_valida check (categoria in ('efectivo_ars', 'transferencia_ars', 'efectivo_usd')),
  constraint fondos_mov_tipo_valido check (tipo in ('ingreso', 'egreso'))
);
create index if not exists idx_fondos_movimientos_negocio on fondos_movimientos(negocio_id, fecha desc) where not anulado;

alter table fondos_movimientos enable row level security;
drop policy if exists "fondos_movimientos de mi negocio" on fondos_movimientos;
create policy "fondos_movimientos de mi negocio" on fondos_movimientos
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());
