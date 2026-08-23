-- ============================================================
-- AUDITORÍA EXHAUSTIVA (2026-08-22) — hallazgo P1: el PIN de
-- vendedores/técnicos se guardaba y comparaba en TEXTO PLANO
-- (columna `pin text`, comparación `pin = pin_ingresado`). Cualquiera con
-- acceso a Configuración → Vendedores/Técnicos podía leer el PIN real de
-- cualquier persona con solo abrir "Editar" (el formulario lo mostraba
-- precargado), y cualquiera con acceso a la API de Supabase del negocio
-- podía leerlo directo de la tabla.
--
-- Esta migración:
-- 1) habilita pgcrypto (extensión estándar de Supabase, normalmente ya
--    disponible) y re-hashea con bcrypt cualquier PIN que hoy esté en
--    texto plano (los ya hasheados, si se corriera dos veces, se
--    detectan por el prefijo "$2" y no se tocan — segura de re-correr).
-- 2) actualiza verificar_pin_vendedor/verificar_pin_tecnico para comparar
--    con crypt() en vez de "=".
-- 3) agrega establecer_pin_vendedor/establecer_pin_tecnico — únicos
--    puntos por los que la app debe escribir un PIN nuevo de acá en más
--    (nunca un update directo a la columna).
--
-- La app (app/configuracion/vendedores/page.tsx y tecnicos/page.tsx) ya
-- se actualizó en paralelo para: dejar de mostrar el PIN existente en el
-- formulario de edición, y llamar a estos RPC en vez de escribir la
-- columna directamente.
-- ============================================================

create extension if not exists pgcrypto;

update vendedores set pin = crypt(pin, gen_salt('bf'))
  where pin is not null and pin !~ '^\$2[aby]\$';
update tecnicos set pin = crypt(pin, gen_salt('bf'))
  where pin is not null and pin !~ '^\$2[aby]\$';

create or replace function verificar_pin_vendedor(vendedor_id uuid, pin_ingresado text)
returns boolean
language sql
security definer
stable
as $$
  select exists(
    select 1 from vendedores
    where id = vendedor_id and negocio_id = negocio_actual() and pin is not null and pin = crypt(pin_ingresado, pin)
  )
$$;

create or replace function verificar_pin_tecnico(tecnico_id uuid, pin_ingresado text)
returns boolean
language sql
security definer
stable
as $$
  select exists(
    select 1 from tecnicos
    where id = tecnico_id and negocio_id = negocio_actual() and pin is not null and pin = crypt(pin_ingresado, pin)
  )
$$;

create or replace function establecer_pin_vendedor(p_vendedor_id uuid, p_pin text)
returns void language plpgsql security definer as $$
begin
  if negocio_actual() is null then raise exception 'Sin negocio'; end if;
  update vendedores
    set pin = case when p_pin is null or length(trim(p_pin)) = 0 then null else crypt(p_pin, gen_salt('bf')) end
    where id = p_vendedor_id and negocio_id = negocio_actual();
end $$;

create or replace function establecer_pin_tecnico(p_tecnico_id uuid, p_pin text)
returns void language plpgsql security definer as $$
begin
  if negocio_actual() is null then raise exception 'Sin negocio'; end if;
  update tecnicos
    set pin = case when p_pin is null or length(trim(p_pin)) = 0 then null else crypt(p_pin, gen_salt('bf')) end
    where id = p_tecnico_id and negocio_id = negocio_actual();
end $$;

grant execute on function establecer_pin_vendedor(uuid, text) to authenticated;
grant execute on function establecer_pin_tecnico(uuid, text) to authenticated;
