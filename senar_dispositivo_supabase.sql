-- "Señar" un dispositivo específico del Stock: un plan de ahorro normal
-- junta plata para un modelo genérico ("algún día un iPhone 13"); señar
-- reserva un dispositivo PUNTUAL que ya está en Stock (dispositivo_id) —
-- reusa toda la mecánica de planes_ahorro (movimientos, comprobante,
-- WhatsApp) que ya existe, en vez de un sistema aparte.
alter table planes_ahorro add column if not exists dispositivo_id uuid references dispositivos(id) on delete set null;
