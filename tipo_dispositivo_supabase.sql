-- Tipo de equipo recibido en Servicio Técnico (celular/notebook/tablet/
-- parlante/otro) — hasta ahora todo el flujo de recepción asumía celular
-- de forma implícita (checklist de cámaras, Face ID, MagSafe, pin de carga:
-- todo específico de celular). Default 'celular' para que cualquier
-- reparación ya existente, y cualquier código que todavía no mande este
-- campo, se comporte exactamente igual que hoy.
alter table reparaciones add column if not exists tipo_dispositivo text not null default 'celular';
