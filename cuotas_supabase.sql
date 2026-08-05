-- ============================================================
-- QOVENTO — Financiación en cuotas
-- Correr en Supabase > SQL Editor > Run. Seguro (aditivo, idempotente).
-- ============================================================

-- Interés (%) por plan de cuotas, configurable por negocio en
-- Configuración > Financiación. Formato: {"3": 10, "6": 20, "12": 40}.
-- Si un plan no está en el objeto, ese plan no se ofrece. Contado (1
-- cuota) siempre existe y no tiene interés.
alter table negocios add column if not exists interes_cuotas jsonb;

-- Plan de cuotas elegido al vender (1 = contado). Informativo y para la
-- boleta. El "total" de la orden ya queda con el interés aplicado.
alter table ordenes add column if not exists cuotas int not null default 1;
