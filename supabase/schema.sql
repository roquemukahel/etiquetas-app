-- ============================================================
-- Esquema de Qovento
-- Pegar este archivo completo en Supabase: SQL Editor > New query > Run
-- ============================================================

-- Un "negocio" es cada local/empresa que usa la app.
create table negocios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  logo_url text,
  texto_garantia text,
  created_at timestamptz default now()
);

-- Cada usuario que se registra queda vinculado a un negocio.
-- (perfiles.id = mismo id que auth.users, así Supabase los conecta solo)
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  negocio_id uuid not null references negocios(id) on delete cascade,
  rol text not null default 'admin',
  created_at timestamptz default now()
);

create table dispositivos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  modelo text,
  capacidad_gb int,
  imei text,
  numero_serie text,
  salud_bateria int,
  color text,
  precio numeric,
  estado text,
  codigo_interno text,
  garantia text,
  en_stock boolean not null default true,
  created_at timestamptz default now()
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  nombre text not null,
  apellido text,
  domicilio text,
  email text,
  telefono text,
  dni text,
  created_at timestamptz default now()
);

create table ordenes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  cliente_id uuid references clientes(id),
  dispositivo_id uuid references dispositivos(id),
  forma_pago text,
  total numeric,
  canje jsonb, -- datos del dispositivo entregado como parte de pago, si aplica
  estado text not null default 'pendiente', -- pendiente | pagado | entregado
  created_at timestamptz default now()
);

-- ============================================================
-- Función auxiliar: a qué negocio pertenece el usuario logueado
-- ============================================================
create or replace function negocio_actual()
returns uuid
language sql
security definer
stable
as $$
  select negocio_id from perfiles where id = auth.uid()
$$;

-- ============================================================
-- Seguridad: cada negocio solo ve sus propios datos
-- ============================================================
alter table negocios enable row level security;
alter table perfiles enable row level security;
alter table dispositivos enable row level security;
alter table clientes enable row level security;
alter table ordenes enable row level security;

create policy "ver mi negocio" on negocios
  for select using (id = negocio_actual());
create policy "actualizar mi negocio" on negocios
  for update using (id = negocio_actual());
-- Nota: a propósito NO hay policy de insert acá. Crear un negocio y
-- vincularlo a un perfil pasa únicamente por la función
-- crear_negocio_y_perfil() (más abajo), que es security definer y
-- bypassea RLS. Si hubiera una policy de insert con un check débil
-- (ej. "auth.uid() is not null"), cualquier usuario logueado podría
-- insertar filas directo por la API de Supabase sin pasar por esa
-- función.

create policy "ver mi perfil" on perfiles
  for select using (id = auth.uid());
-- Ídem: sin policy de insert. Si la hubiera con un check que solo
-- valide "id = auth.uid()" (sin validar negocio_id), cualquier
-- usuario logueado podría insertarse un perfil apuntando al
-- negocio_id de otro negocio ya existente y ganar acceso completo
-- a sus datos (clientes, stock, órdenes) vía negocio_actual().

create policy "dispositivos de mi negocio" on dispositivos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create policy "clientes de mi negocio" on clientes
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create policy "ordenes de mi negocio" on ordenes
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

-- ============================================================
-- Función para crear el negocio + perfil juntos al registrarse.
-- Evita el problema de "orden": la política para VER un negocio
-- necesita que el perfil ya exista, pero el perfil se crea recién
-- después de crear el negocio. Esta función hace las dos cosas
-- en un solo paso interno, sin pasar por esa restricción.
-- ============================================================
create or replace function crear_negocio_y_perfil(nombre_negocio text)
returns uuid
language plpgsql
security definer
as $$
declare
  nuevo_negocio_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if exists (select 1 from perfiles where id = auth.uid()) then
    raise exception 'Ya tenés un negocio configurado';
  end if;

  insert into negocios (nombre) values (nombre_negocio) returning id into nuevo_negocio_id;
  insert into perfiles (id, negocio_id) values (auth.uid(), nuevo_negocio_id);

  return nuevo_negocio_id;
end;
$$;

-- ============================================================
-- Los inserts desde el navegador completan negocio_id solos,
-- tomando el negocio del usuario logueado. Así no hace falta
-- mandarlo a mano desde el código y no hay forma de mandar
-- uno equivocado (la política RLS lo sigue verificando igual).
-- ============================================================
alter table dispositivos alter column negocio_id set default negocio_actual();
alter table clientes alter column negocio_id set default negocio_actual();
alter table ordenes alter column negocio_id set default negocio_actual();

-- ============================================================
-- Ajustes al cargar el módulo de Stock: código interno y n° de
-- serie no se cargan a mano, y la garantía es un texto por
-- negocio (negocios.texto_garantia) que va en la boleta, no un
-- dato por dispositivo.
-- ============================================================
alter table dispositivos drop column if exists codigo_interno;
alter table dispositivos drop column if exists garantia;

-- ============================================================
-- Órdenes con carrito: vendedores, catálogo de productos/
-- accesorios (cada negocio arma el suyo), e ítems de la orden
-- (antes una orden apuntaba a un solo dispositivo; ahora puede
-- tener varias líneas, sean dispositivos, productos del catálogo
-- o ítems cargados a mano).
-- ============================================================
alter table negocios add column if not exists telefono text;
alter table negocios add column if not exists direccion text;

create table if not exists vendedores (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  created_at timestamptz default now()
);

create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  precio numeric,
  created_at timestamptz default now()
);

alter table ordenes add column if not exists vendedor_id uuid references vendedores(id);
alter table ordenes add column if not exists anticipo numeric default 0;
alter table ordenes add column if not exists impuesto_porcentaje numeric default 0;
alter table ordenes add column if not exists fecha_entrega timestamptz;

create table if not exists orden_items (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes(id) on delete cascade,
  dispositivo_id uuid references dispositivos(id),
  descripcion text not null,
  cantidad int not null default 1,
  precio_unitario numeric not null default 0,
  created_at timestamptz default now()
);

alter table vendedores enable row level security;
alter table productos enable row level security;
alter table orden_items enable row level security;

create policy "vendedores de mi negocio" on vendedores
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create policy "productos de mi negocio" on productos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create policy "items de ordenes de mi negocio" on orden_items
  for all using (orden_id in (select id from ordenes where negocio_id = negocio_actual()))
  with check (orden_id in (select id from ordenes where negocio_id = negocio_actual()));

-- ============================================================
-- Plan canje: el dispositivo que el cliente entrega como parte
-- de pago NO entra directo al stock (puede tener detalles/fallas
-- que haya que revisar primero). Tiene su propia sección, y desde
-- ahí se puede derivar a Servicio Técnico.
-- ============================================================
alter table ordenes add column if not exists monto_canje numeric default 0;
alter table ordenes drop column if exists canje;
alter table ordenes drop column if exists dispositivo_canje_id;

create table if not exists tecnicos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  created_at timestamptz default now()
);

create table if not exists canjes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  orden_id uuid references ordenes(id) on delete set null,
  modelo text,
  capacidad_gb int,
  color text,
  salud_bateria int,
  detalles text,
  monto numeric,
  vendedor_id uuid references vendedores(id),
  tecnico_id uuid references tecnicos(id),
  estado text not null default 'en_canje', -- en_canje | servicio_tecnico
  created_at timestamptz default now()
);

alter table ordenes add column if not exists canje_id uuid references canjes(id);

alter table tecnicos enable row level security;
alter table canjes enable row level security;

create policy "tecnicos de mi negocio" on tecnicos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create policy "canjes de mi negocio" on canjes
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

-- ============================================================
-- Servicio Técnico: catálogo de arreglos (mismo concepto que
-- productos, pero para trabajos de reparación), marcar equipos de
-- Plan Canje como reparados, y poder facturar un arreglo a un
-- cliente como ítem de una orden común (con su propia garantía,
-- distinta a la de los productos).
-- ============================================================
create table if not exists trabajos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  precio numeric,
  created_at timestamptz default now()
);

alter table trabajos enable row level security;
create policy "trabajos de mi negocio" on trabajos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

alter table canjes add column if not exists trabajos_realizados text[];

alter table orden_items add column if not exists tipo text not null default 'producto';

alter table negocios add column if not exists texto_garantia_servicio text;

-- ============================================================
-- Redes sociales del negocio, cada una opcional y con su propio
-- check para decidir si aparece o no en la boleta.
-- ============================================================
alter table negocios add column if not exists instagram text;
alter table negocios add column if not exists facebook text;
alter table negocios add column if not exists tiktok text;
alter table negocios add column if not exists mostrar_instagram boolean not null default false;
alter table negocios add column if not exists mostrar_facebook boolean not null default false;
alter table negocios add column if not exists mostrar_tiktok boolean not null default false;

-- ============================================================
-- Moneda con la que trabaja el negocio (afecta cómo se muestran
-- los montos en la boleta).
-- ============================================================
alter table negocios add column if not exists moneda text not null default 'ARS';

-- ============================================================
-- Carpetas de Stock (por modelo): existen independientemente de
-- que tengan dispositivos cargados o no, para poder crearlas,
-- renombrarlas o eliminarlas sin depender del stock actual.
-- ============================================================
create table if not exists modelos_stock (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  created_at timestamptz default now()
);

alter table modelos_stock enable row level security;
create policy "modelos de mi negocio" on modelos_stock
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

-- ============================================================
-- Compra de dispositivos: cuando el local le compra un celular a
-- una persona (no una venta). Genera su propia boleta, sin opción
-- de WhatsApp, con un texto de declaración configurable y espacio
-- para firma/aclaración/DNI de quien vende.
-- ============================================================
create table if not exists compras (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  cliente_id uuid references clientes(id),
  modelo text,
  capacidad_gb int,
  detalles text,
  precio numeric,
  created_at timestamptz default now()
);

alter table compras enable row level security;
create policy "compras de mi negocio" on compras
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

alter table negocios add column if not exists texto_declaracion_compra text;

-- ============================================================
-- Estado de la compra: si el dispositivo comprado ya se derivó al
-- Stock (para vender directo) o a Servicio Técnico (si tenía un
-- detalle que arreglar antes).
-- ============================================================
alter table compras add column if not exists estado text not null default 'pendiente';

-- ============================================================
-- IMEI en canjes/compras (el "DNI" del celular, debe verse en
-- todos lados) y fechas de ingreso/reparado en Servicio Técnico.
-- ============================================================
alter table canjes add column if not exists imei text;
alter table canjes add column if not exists fecha_ingreso_servicio timestamptz;
alter table canjes add column if not exists fecha_reparado timestamptz;

alter table compras add column if not exists imei text;

-- ============================================================
-- Panel de super admin (dueño del software), separado de los
-- negocios que usan la app. Nadie se puede agregar a sí mismo acá:
-- se hace a mano, directo en SQL, pegando el propio user id.
--
-- Para encontrar tu user id: Authentication > Users en el panel de
-- Supabase, copiá el "UID" de tu usuario, y corré:
--   insert into super_admins (id) values ('TU-UID-ACA');
-- ============================================================
create table if not exists super_admins (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

alter table super_admins enable row level security;
-- A propósito no hay ninguna policy: nadie puede leer ni escribir
-- esta tabla desde la app (ni con la anon key ni logueado). Solo
-- las funciones de abajo (security definer) pueden consultarla.

alter table negocios add column if not exists activo boolean not null default true;

create or replace function es_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists(select 1 from super_admins where id = auth.uid())
$$;

-- Para que cada negocio pueda chequear si sigue activo (usado por
-- el middleware para bloquear el acceso si lo desactivás).
create or replace function negocio_activo()
returns boolean
language sql
security definer
stable
as $$
  select coalesce((select activo from negocios where id = negocio_actual()), true)
$$;

create or replace function admin_listar_negocios()
returns table (
  id uuid,
  nombre text,
  activo boolean,
  creado timestamptz,
  cantidad_usuarios bigint,
  cantidad_dispositivos bigint,
  cantidad_ordenes bigint,
  ultima_actividad timestamptz
)
language plpgsql
security definer
as $$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  return query
    select
      n.id,
      n.nombre,
      n.activo,
      n.created_at,
      (select count(*) from perfiles p where p.negocio_id = n.id),
      (select count(*) from dispositivos d where d.negocio_id = n.id),
      (select count(*) from ordenes o where o.negocio_id = n.id),
      greatest(
        n.created_at,
        coalesce((select max(created_at) from ordenes o where o.negocio_id = n.id), n.created_at),
        coalesce((select max(created_at) from dispositivos d where d.negocio_id = n.id), n.created_at)
      )
    from negocios n
    order by n.created_at desc;
end;
$$;

create or replace function admin_set_negocio_activo(negocio_id_param uuid, nuevo_estado boolean)
returns void
language plpgsql
security definer
as $$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  update negocios set activo = nuevo_estado where id = negocio_id_param;
end;
$$;

create or replace function admin_usuarios_de_negocio(negocio_id_param uuid)
returns table (email text, creado timestamptz)
language plpgsql
security definer
as $$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  return query
    select u.email, p.created_at
    from perfiles p
    join auth.users u on u.id = p.id
    where p.negocio_id = negocio_id_param;
end;
$$;

-- ============================================================
-- Tamaño de letra de cada texto largo de la boleta (afecta cuánto
-- ocupa al imprimir).
-- ============================================================
alter table negocios add column if not exists texto_garantia_tamano int not null default 11;
alter table negocios add column if not exists texto_garantia_servicio_tamano int not null default 11;
alter table negocios add column if not exists texto_declaracion_compra_tamano int not null default 11;

-- ============================================================
-- CORRECCIÓN DE SEGURIDAD: las policies de insert en "negocios" y
-- "perfiles" no validaban lo suficiente. La de "perfiles" en
-- particular dejaba que cualquier usuario logueado se insertara un
-- perfil apuntando al negocio_id de OTRO negocio ya existente
-- (sin pasar por crear_negocio_y_perfil()), ganando acceso total a
-- los clientes, stock y órdenes de ese negocio ajeno.
--
-- El registro siempre pasó por la función crear_negocio_y_perfil()
-- (que sigue funcionando igual, porque es security definer y no
-- depende de estas policies), así que borrar estas dos policies no
-- rompe nada de la app.
-- ============================================================
drop policy if exists "crear negocio al registrarse" on negocios;
drop policy if exists "crear mi perfil al registrarse" on perfiles;

-- ============================================================
-- Suscripciones (Lemon Squeezy): cada negocio paga mensualmente
-- para poder seguir usando Qovento. Los negocios que ya existían
-- antes de esta función quedan en "active" (no se les corta el
-- acceso retroactivamente); los que se registren de acá en más
-- arrancan en "trialing" con 14 días de prueba gratis (ver
-- crear_negocio_y_perfil más abajo).
-- ============================================================
alter table negocios add column if not exists lemonsqueezy_customer_id text;
alter table negocios add column if not exists lemonsqueezy_subscription_id text;
alter table negocios add column if not exists estado_suscripcion text not null default 'active';
alter table negocios add column if not exists fecha_fin_prueba timestamptz;

alter table negocios add constraint estado_suscripcion_valido
  check (estado_suscripcion in ('trialing','active','past_due','unpaid','cancelled','expired','paused'));

-- Importante: estas columnas las actualiza ÚNICAMENTE el webhook de
-- Lemon Squeezy (con la service role key, que bypassea RLS y estos
-- grants). Si no hiciéramos este revoke, cualquier usuario logueado
-- podría, vía la API REST de Supabase, hacer
-- update negocios set estado_suscripcion = 'active' en su propia
-- fila y activarse la suscripción gratis sin pagar. Lo mismo aplica
-- a "activo": sin este revoke, un usuario podría reactivarse su
-- propia cuenta después de que el panel admin la desactivara.
revoke update (estado_suscripcion, fecha_fin_prueba, lemonsqueezy_customer_id, lemonsqueezy_subscription_id, activo)
  on negocios from authenticated;

create or replace function crear_negocio_y_perfil(nombre_negocio text)
returns uuid
language plpgsql
security definer
as $$
declare
  nuevo_negocio_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if exists (select 1 from perfiles where id = auth.uid()) then
    raise exception 'Ya tenés un negocio configurado';
  end if;

  insert into negocios (nombre, estado_suscripcion, fecha_fin_prueba)
  values (nombre_negocio, 'trialing', now() + interval '14 days')
  returning id into nuevo_negocio_id;
  insert into perfiles (id, negocio_id) values (auth.uid(), nuevo_negocio_id);

  return nuevo_negocio_id;
end;
$$;

-- Chequea si el negocio puede seguir usando el sistema según su
-- suscripción (independiente de negocio_activo(), que es el
-- interruptor manual del panel admin). "past_due" todavía deja
-- pasar: le da margen mientras Lemon Squeezy reintenta el cobro.
-- ============================================================
-- Portal de seguimiento para el cliente: cuando se carga un equipo
-- en Servicio Técnico, se puede vincular al cliente y se genera un
-- link público (con un token al azar, imposible de adivinar) para
-- que el cliente vea el estado de SU reparación, sin necesitar
-- cuenta ni ver nada más del negocio.
-- ============================================================
alter table canjes add column if not exists cliente_id uuid references clientes(id) on delete set null;
alter table canjes add column if not exists token_seguimiento uuid not null default gen_random_uuid();

create unique index if not exists canjes_token_seguimiento_idx on canjes(token_seguimiento);

-- Security definer y sin chequear auth.uid() a propósito: la llama
-- gente sin cuenta (el cliente final). Lo único que protege los datos
-- es que el token es un uuid al azar imposible de adivinar, y la
-- función solo devuelve los campos mínimos (nada de teléfono, DNI,
-- precio ni notas internas del negocio).
create or replace function seguimiento_publico(token uuid)
returns table (
  modelo text,
  capacidad_gb int,
  color text,
  estado text,
  fecha_ingreso_servicio timestamptz,
  fecha_reparado timestamptz,
  trabajos_realizados text[],
  nombre_cliente text,
  nombre_negocio text,
  logo_negocio text
)
language sql
security definer
stable
as $$
  select
    c.modelo, c.capacidad_gb, c.color, c.estado,
    c.fecha_ingreso_servicio, c.fecha_reparado, c.trabajos_realizados,
    cli.nombre,
    n.nombre, n.logo_url
  from canjes c
  join negocios n on n.id = c.negocio_id
  left join clientes cli on cli.id = c.cliente_id
  where c.token_seguimiento = token
$$;

grant execute on function seguimiento_publico(uuid) to anon, authenticated;

-- ============================================================
-- Proveedor (opcional) al cargar un dispositivo al stock, y nota
-- opcional por orden (se imprime en la boleta: detalles del equipo,
-- o cualquier comentario que el vendedor quiera dejar aclarado).
-- ============================================================
alter table dispositivos add column if not exists proveedor text;
alter table ordenes add column if not exists nota text;

create or replace function negocio_suscripcion_activa()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (
      select
        case
          when estado_suscripcion in ('active', 'past_due') then true
          when estado_suscripcion = 'trialing' then coalesce(fecha_fin_prueba, now()) > now()
          else false
        end
      from negocios where id = negocio_actual()
    ),
    true
  )
$$;

-- ============================================================
-- Garantía automática: al vender un dispositivo, si el negocio
-- configuró una cantidad de días de garantía, se calcula y guarda
-- la fecha de vencimiento en el propio dispositivo.
-- ============================================================
alter table negocios add column if not exists garantia_dias int;
alter table dispositivos add column if not exists garantia_vencimiento date;

-- ============================================================
-- Alerta de stock quieto: cuando un dispositivo lleva más de 30
-- días en stock, se le manda un mail de aviso al dueño del negocio
-- (una sola vez por período quieto, no todos los días). Un cron
-- diario en Vercel revisa esto (ver app/api/cron/stock-quieto).
--
-- en_stock_desde: se resetea a "ahora" cada vez que un dispositivo
-- vuelve a estar en stock (para no contar como "30 días quieto" un
-- equipo que en realidad recién volvió, ej. por cancelar una venta).
-- ============================================================
alter table dispositivos add column if not exists en_stock_desde timestamptz default now();
alter table dispositivos add column if not exists alerta_stock_enviada boolean not null default false;

-- ============================================================
-- Registro de auditoría: quién hizo qué, cuándo, y con qué valores.
-- "Quién" es el vendedor/técnico elegido en el selector de "con
-- quién tengo el gusto" (identificación por nombre, no un login
-- propio) — no es una cuenta con contraseña, es trazabilidad
-- operativa, no autenticación.
--
-- A propósito NO hay policy de update ni de delete: una vez
-- insertado un registro, nadie puede modificarlo ni borrarlo (ni
-- siquiera el dueño del negocio desde la app). Eso es lo que hace
-- que sirva como auditoría real.
-- ============================================================
create table if not exists auditoria (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  actor_nombre text not null,
  actor_tipo text not null,
  accion text not null,
  entidad text not null,
  entidad_id uuid,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  created_at timestamptz not null default now()
);

alter table auditoria enable row level security;

create policy "ver auditoria de mi negocio" on auditoria
  for select using (negocio_id = negocio_actual());

create policy "insertar auditoria de mi negocio" on auditoria
  for insert with check (negocio_id = negocio_actual());
