-- Enlace de stock en JSON para otra app (/stock-publico/<token_stock_json>/json), INDEPENDIENTE del enlace público que se
-- le manda a los clientes (/stock-publico/<token_stock_publico>). Son dos enlaces distintos: el de los clientes sigue
-- mostrando lo mismo de siempre (sin precios), y este trae además batería y precio, así que no se comparte con cualquiera.
-- Apagado por defecto: el dueño lo enciende en Configuración -> Stock público. Se puede generar uno nuevo cuando quiera
-- (el anterior deja de funcionar).
alter table negocios add column if not exists stock_json_activo boolean not null default false;
alter table negocios add column if not exists token_stock_json uuid not null default gen_random_uuid();

create unique index if not exists negocios_token_stock_json_idx on negocios(token_stock_json);
