-- Enlace público de stock en tiempo real, uno por negocio (como
-- boleta_publica / seguimiento_publico: token + RPC security definer).
-- Apagado por defecto (stock_publico_activo = false) — el dueño lo prende
-- desde Configuración cuando quiera. Cada dispositivo se puede ocultar del
-- público individualmente (mostrar_en_stock_publico, true por defecto una
-- vez que el negocio activa el enlace).
alter table negocios add column if not exists stock_publico_activo boolean not null default false;
alter table negocios add column if not exists token_stock_publico uuid not null default gen_random_uuid();

create unique index if not exists negocios_token_stock_publico_idx on negocios(token_stock_publico);

alter table dispositivos add column if not exists mostrar_en_stock_publico boolean not null default true;

create or replace function stock_publico(token uuid)
returns jsonb
language sql
security definer
stable
as $$
  select jsonb_build_object(
    'nombre', n.nombre,
    'logo_url', n.logo_url,
    'telefono', n.telefono,
    'modelos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'modelo', t.modelo,
        'capacidad_gb', t.capacidad_gb,
        'color', t.color,
        'estado', t.estado,
        'cantidad', t.cantidad
      ) order by t.modelo, t.capacidad_gb), '[]'::jsonb)
      from (
        select d.modelo, d.capacidad_gb, d.color, d.estado, count(*) as cantidad
        from dispositivos d
        where d.negocio_id = n.id
          and d.en_stock = true
          and d.mostrar_en_stock_publico = true
        group by d.modelo, d.capacidad_gb, d.color, d.estado
      ) t
    )
  )
  from negocios n
  where n.token_stock_publico = token and n.stock_publico_activo = true
$$;

grant execute on function stock_publico(uuid) to anon, authenticated;
