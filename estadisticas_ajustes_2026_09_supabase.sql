-- ============================================================
-- Estadísticas: excluir "ajustes contables" de Ventas/rankings +
-- clasificar categorías de egresos como Fijo/Variable/No es gasto
-- (2026-09-24) — pedido real del dueño, dos cosas sin relación entre sí que
-- se juntan en un solo archivo por practicidad.
-- ============================================================

-- 1) Productos que en realidad son un ajuste contable (ej. "CREDITO
-- ANTIGUO", usado para dejar asentada una deuda vieja de un cliente, no una
-- venta nueva) no deben sumar en "Ventas netas" ni en los rankings de
-- Estadísticas. Antes no había forma de distinguirlos de una venta real —
-- se agrega un flag explícito en vez de matchear por nombre (que se rompe
-- si alguien lo renombra).
alter table productos add column if not exists excluir_de_estadisticas boolean not null default false;

-- Se marca el que ya existe hoy. Si en el futuro se necesita otro producto
-- así, alcanza con tildarlo desde el mismo lugar donde se edita el
-- producto (o pedir que se corra un update puntual como este).
update productos set excluir_de_estadisticas = true where lower(trim(nombre)) = 'credito antiguo';

-- 2) Categorías de egresos: permitir marcar cada una como Fijo, Variable o
-- "No es gasto" (para separar retiros/ajustes que ya viven en su categoría
-- propia, sin que cuenten como gasto operativo real). Base para un futuro
-- cálculo de punto de equilibrio (gastos fijos / margen).
alter table egresos_categorias add column if not exists tipo_gasto text not null default 'variable';
alter table egresos_categorias drop constraint if exists egresos_categorias_tipo_gasto_check;
alter table egresos_categorias add constraint egresos_categorias_tipo_gasto_check
  check (tipo_gasto in ('fijo', 'variable', 'no_es_gasto'));
