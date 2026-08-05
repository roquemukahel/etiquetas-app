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

-- ============================================================
-- Imagen opcional por carpeta de Stock (se usa en "Productos más
-- vendidos" del inicio).
-- ============================================================
alter table modelos_stock add column if not exists imagen_url text;

-- ============================================================
-- Boleta pública (QR): cada orden tiene un token al azar para que
-- el cliente pueda ver y guardar su comprobante desde el celular
-- escaneando el QR impreso, sin necesitar cuenta. Mismo patrón que
-- seguimiento_publico() de más arriba.
-- ============================================================
alter table ordenes add column if not exists token_boleta uuid not null default gen_random_uuid();

create unique index if not exists ordenes_token_boleta_idx on ordenes(token_boleta);

create or replace function boleta_publica(token uuid)
returns jsonb
language sql
security definer
stable
as $$
  select jsonb_build_object(
    'id', o.id,
    'created_at', o.created_at,
    'fecha_entrega', o.fecha_entrega,
    'forma_pago', o.forma_pago,
    'total', o.total,
    'anticipo', o.anticipo,
    'impuesto_porcentaje', o.impuesto_porcentaje,
    'monto_canje', o.monto_canje,
    'nota', o.nota,
    'incluir_garantia', o.incluir_garantia,
    'moneda', n.moneda,
    'negocio', jsonb_build_object(
      'nombre', n.nombre,
      'telefono', n.telefono,
      'direccion', n.direccion,
      'logo_url', n.logo_url,
      'texto_garantia', n.texto_garantia,
      'texto_garantia_tamano', n.texto_garantia_tamano,
      'texto_garantia_servicio', n.texto_garantia_servicio,
      'texto_garantia_servicio_tamano', n.texto_garantia_servicio_tamano
    ),
    'cliente_nombre', nullif(trim(concat(cli.nombre, ' ', coalesce(cli.apellido, ''))), ''),
    'canje', case when c.id is null then null else jsonb_build_object(
      'modelo', c.modelo,
      'capacidad_gb', c.capacidad_gb,
      'color', c.color,
      'imei', c.imei,
      'salud_bateria', c.salud_bateria,
      'detalles', c.detalles,
      'monto', c.monto
    ) end,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'descripcion', oi.descripcion,
        'cantidad', oi.cantidad,
        'precio_unitario', oi.precio_unitario,
        'tipo', oi.tipo,
        'garantia_vencimiento', d.garantia_vencimiento
      )), '[]'::jsonb)
      from orden_items oi
      left join dispositivos d on d.id = oi.dispositivo_id
      where oi.orden_id = o.id
    )
  )
  from ordenes o
  join negocios n on n.id = o.negocio_id
  left join clientes cli on cli.id = o.cliente_id
  left join canjes c on c.id = o.canje_id
  where o.token_boleta = token
$$;

grant execute on function boleta_publica(uuid) to anon, authenticated;

-- ============================================================
-- País del negocio: se usa para anteponer el código de llamada
-- correcto (ej. 54 para Argentina) a los números de teléfono al
-- armar links de WhatsApp, ya que la gente no suele escribir su
-- propio código de país al cargar su número.
-- ============================================================
alter table negocios add column if not exists pais text not null default 'AR';

-- ============================================================
-- Permite decidir, orden por orden, si el texto de garantía va o no
-- en la boleta (por defecto sí). Sirve para casos puntuales donde el
-- equipo se vende explícitamente sin garantía.
-- ============================================================
alter table ordenes add column if not exists incluir_garantia boolean not null default true;

-- ============================================================
-- Imagen opcional por producto/accesorio del catálogo (ej. una foto
-- de los AirPods que se venden), para mostrar en "Productos más
-- vendidos" del inicio en vez del ícono genérico.
-- ============================================================
alter table productos add column if not exists imagen_url text;

-- ============================================================
-- Imagen opcional por trabajo del catálogo de Servicio Técnico (ej.
-- una foto ilustrando "Cambio de tapa trasera"), mismo patrón que la
-- imagen de carpetas de Stock y de productos/accesorios.
-- ============================================================
alter table trabajos add column if not exists imagen_url text;

-- ============================================================
-- Servicio Técnico: proveedores de repuestos y catálogo de repuestos
-- (baterías, pantallas, módulos, etc.) con el precio que maneja cada
-- proveedor, para poder comparar y saber a quién conviene comprarle
-- cada pieza. repuestos_precios guarda un precio por combinación
-- repuesto+proveedor (unique), que se actualiza en el momento si ya
-- existía en vez de duplicarse.
-- ============================================================
create table if not exists proveedores_repuestos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  telefono text,
  created_at timestamptz default now()
);

create table if not exists repuestos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  nombre text not null,
  created_at timestamptz default now()
);

create table if not exists repuestos_precios (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  repuesto_id uuid not null references repuestos(id) on delete cascade,
  proveedor_id uuid not null references proveedores_repuestos(id) on delete cascade,
  precio numeric not null,
  actualizado_at timestamptz not null default now(),
  unique (repuesto_id, proveedor_id)
);

alter table proveedores_repuestos enable row level security;
alter table repuestos enable row level security;
alter table repuestos_precios enable row level security;

create policy "proveedores_repuestos de mi negocio" on proveedores_repuestos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create policy "repuestos de mi negocio" on repuestos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

create policy "repuestos_precios de mi negocio" on repuestos_precios
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

-- ============================================================
-- Perfil personal de vendedores y técnicos (teléfono, edad y foto),
-- para que cada uno pueda personalizar cómo aparece en la app. La
-- foto se guarda igual que el logo del negocio y las imágenes de
-- productos/trabajos: como data URL directo en la columna, sin bucket
-- de storage aparte. A propósito, esta foto NUNCA se muestra en la
-- boleta que ve el cliente (ver app/ordenes/[id]/boleta) — solo en
-- las pantallas internas de uso diario.
-- ============================================================
alter table vendedores add column if not exists telefono text;
alter table vendedores add column if not exists edad int;
alter table vendedores add column if not exists foto_url text;

alter table tecnicos add column if not exists telefono text;
alter table tecnicos add column if not exists edad int;
alter table tecnicos add column if not exists foto_url text;

-- ============================================================
-- Cantidad disponible por accesorio/producto (a diferencia de los
-- celulares, que se cuentan uno por uno en "dispositivos", los
-- accesorios se manejan como un número de unidades disponibles).
-- ============================================================
alter table productos add column if not exists cantidad int not null default 0;

-- ============================================================
-- Eslogan propio del negocio (distinto del de Qovento), para mostrar
-- en la boleta junto a su logo y nombre. Antes la boleta mostraba por
-- error el eslogan de Qovento ahí — se corrige junto con este campo.
-- ============================================================
alter table negocios add column if not exists eslogan text;

create or replace function boleta_publica(token uuid)
returns jsonb
language sql
security definer
stable
as $$
  select jsonb_build_object(
    'id', o.id,
    'created_at', o.created_at,
    'fecha_entrega', o.fecha_entrega,
    'forma_pago', o.forma_pago,
    'total', o.total,
    'anticipo', o.anticipo,
    'impuesto_porcentaje', o.impuesto_porcentaje,
    'monto_canje', o.monto_canje,
    'nota', o.nota,
    'incluir_garantia', o.incluir_garantia,
    'moneda', n.moneda,
    'negocio', jsonb_build_object(
      'nombre', n.nombre,
      'telefono', n.telefono,
      'direccion', n.direccion,
      'logo_url', n.logo_url,
      'eslogan', n.eslogan,
      'texto_garantia', n.texto_garantia,
      'texto_garantia_tamano', n.texto_garantia_tamano,
      'texto_garantia_servicio', n.texto_garantia_servicio,
      'texto_garantia_servicio_tamano', n.texto_garantia_servicio_tamano
    ),
    'cliente_nombre', nullif(trim(concat(cli.nombre, ' ', coalesce(cli.apellido, ''))), ''),
    'canje', case when c.id is null then null else jsonb_build_object(
      'modelo', c.modelo,
      'capacidad_gb', c.capacidad_gb,
      'color', c.color,
      'imei', c.imei,
      'salud_bateria', c.salud_bateria,
      'detalles', c.detalles,
      'monto', c.monto
    ) end,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'descripcion', oi.descripcion,
        'cantidad', oi.cantidad,
        'precio_unitario', oi.precio_unitario,
        'tipo', oi.tipo,
        'garantia_vencimiento', d.garantia_vencimiento
      )), '[]'::jsonb)
      from orden_items oi
      left join dispositivos d on d.id = oi.dispositivo_id
      where oi.orden_id = o.id
    )
  )
  from ordenes o
  join negocios n on n.id = o.negocio_id
  left join clientes cli on cli.id = o.cliente_id
  left join canjes c on c.id = o.canje_id
  where o.token_boleta = token
$$;

-- ============================================================
-- Antes, "Agregar al Stock" (desde Plan Canje o desde Servicio Técnico
-- > Reparados) borraba la fila de canjes por completo. Eso hacía que
-- el trabajo desapareciera sin dejar rastro: se perdía del historial
-- de "Técnicos" y del ranking de técnicos en Estadísticas (que
-- dependen de que la fila siga existiendo con estado='reparado'), y en
-- Plan Canje no quedaba ningún registro de que ese canje existió.
--
-- agregado_a_stock reemplaza ese delete por un update: la fila queda,
-- pero se saca de las listas activas (Derivados/Reparados en Servicio
-- Técnico, En canje en Plan Canje) sin tocar su estado, así que el
-- historial y las estadísticas por técnico siguen viéndolo. Plan Canje
-- usa esta misma columna para armar una pestaña "Historial".
--
-- oculto_en_canje es distinto: permite "eliminar" desde la vista de
-- Plan Canje > Derivados a Servicio Técnico sin borrar el canje real
-- (que sigue existiendo y siendo editable desde Servicio Técnico) —
-- las consultas de Servicio Técnico no miran esta columna.
-- ============================================================
alter table canjes add column if not exists agregado_a_stock boolean not null default false;
alter table canjes add column if not exists oculto_en_canje boolean not null default false;

-- ============================================================
-- Plan Canje ahora admite más de un dispositivo entregado por
-- orden (canjes.orden_id ya lo permitía, se usaba 1 a 1 nomás).
-- boleta_publica pasa de devolver "canje" (un objeto) a "canjes"
-- (un array), sumando todos los canjes con estado 'en_canje'
-- vinculados a esa orden. Se excluyen a propósito los canjes con
-- estado 'servicio_tecnico'/'reparado' que comparten orden_id
-- (derivados directo desde una orden a Servicio Técnico).
-- ============================================================
create or replace function boleta_publica(token uuid)
returns jsonb
language sql
security definer
stable
as $$
  select jsonb_build_object(
    'id', o.id,
    'created_at', o.created_at,
    'fecha_entrega', o.fecha_entrega,
    'forma_pago', o.forma_pago,
    'total', o.total,
    'anticipo', o.anticipo,
    'impuesto_porcentaje', o.impuesto_porcentaje,
    'monto_canje', o.monto_canje,
    'nota', o.nota,
    'incluir_garantia', o.incluir_garantia,
    'moneda', n.moneda,
    'negocio', jsonb_build_object(
      'nombre', n.nombre,
      'telefono', n.telefono,
      'direccion', n.direccion,
      'logo_url', n.logo_url,
      'eslogan', n.eslogan,
      'texto_garantia', n.texto_garantia,
      'texto_garantia_tamano', n.texto_garantia_tamano,
      'texto_garantia_servicio', n.texto_garantia_servicio,
      'texto_garantia_servicio_tamano', n.texto_garantia_servicio_tamano
    ),
    'cliente_nombre', nullif(trim(concat(cli.nombre, ' ', coalesce(cli.apellido, ''))), ''),
    'canjes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'modelo', c.modelo,
        'capacidad_gb', c.capacidad_gb,
        'color', c.color,
        'imei', c.imei,
        'salud_bateria', c.salud_bateria,
        'detalles', c.detalles,
        'monto', c.monto
      ) order by c.created_at), '[]'::jsonb)
      from canjes c
      where c.orden_id = o.id and c.estado = 'en_canje'
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'descripcion', oi.descripcion,
        'cantidad', oi.cantidad,
        'precio_unitario', oi.precio_unitario,
        'tipo', oi.tipo,
        'garantia_vencimiento', d.garantia_vencimiento
      )), '[]'::jsonb)
      from orden_items oi
      left join dispositivos d on d.id = oi.dispositivo_id
      where oi.orden_id = o.id
    )
  )
  from ordenes o
  join negocios n on n.id = o.negocio_id
  left join clientes cli on cli.id = o.cliente_id
  where o.token_boleta = token
$$;

-- ============================================================
-- Multi-moneda: cada negocio puede habilitar hasta 2 monedas de
-- trabajo (de la lista larga de app/lib/monedas.ts), y cada orden
-- guarda con cuál de esas monedas se hizo esa venta puntual (en vez
-- de depender siempre de la moneda única del negocio). Pensado para
-- el caso de un local que vende en pesos argentinos y en dólares
-- según el cliente, sin tener que ir a Configuración a cambiarla
-- cada vez.
--
-- negocios.moneda se mantiene como la "moneda principal" (la que
-- siguen usando estadísticas, dashboard y compras, que no eligen
-- moneda por operación) y pasa a ser siempre monedas_habilitadas[1].
-- Se backfillea monedas_habilitadas con la moneda actual de cada
-- negocio para no romper nada existente.
-- ============================================================
alter table negocios add column if not exists monedas_habilitadas text[];
update negocios set monedas_habilitadas = array[moneda] where monedas_habilitadas is null;
alter table negocios alter column monedas_habilitadas set not null;
alter table negocios alter column monedas_habilitadas set default array['ARS'];

alter table ordenes add column if not exists moneda text;

create or replace function boleta_publica(token uuid)
returns jsonb
language sql
security definer
stable
as $$
  select jsonb_build_object(
    'id', o.id,
    'created_at', o.created_at,
    'fecha_entrega', o.fecha_entrega,
    'forma_pago', o.forma_pago,
    'total', o.total,
    'anticipo', o.anticipo,
    'impuesto_porcentaje', o.impuesto_porcentaje,
    'monto_canje', o.monto_canje,
    'nota', o.nota,
    'incluir_garantia', o.incluir_garantia,
    'moneda', coalesce(o.moneda, n.moneda),
    'negocio', jsonb_build_object(
      'nombre', n.nombre,
      'telefono', n.telefono,
      'direccion', n.direccion,
      'logo_url', n.logo_url,
      'eslogan', n.eslogan,
      'texto_garantia', n.texto_garantia,
      'texto_garantia_tamano', n.texto_garantia_tamano,
      'texto_garantia_servicio', n.texto_garantia_servicio,
      'texto_garantia_servicio_tamano', n.texto_garantia_servicio_tamano
    ),
    'cliente_nombre', nullif(trim(concat(cli.nombre, ' ', coalesce(cli.apellido, ''))), ''),
    'canjes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'modelo', c.modelo,
        'capacidad_gb', c.capacidad_gb,
        'color', c.color,
        'imei', c.imei,
        'salud_bateria', c.salud_bateria,
        'detalles', c.detalles,
        'monto', c.monto
      ) order by c.created_at), '[]'::jsonb)
      from canjes c
      where c.orden_id = o.id and c.estado = 'en_canje'
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'descripcion', oi.descripcion,
        'cantidad', oi.cantidad,
        'precio_unitario', oi.precio_unitario,
        'tipo', oi.tipo,
        'garantia_vencimiento', d.garantia_vencimiento
      )), '[]'::jsonb)
      from orden_items oi
      left join dispositivos d on d.id = oi.dispositivo_id
      where oi.orden_id = o.id
    )
  )
  from ordenes o
  join negocios n on n.id = o.negocio_id
  left join clientes cli on cli.id = o.cliente_id
  where o.token_boleta = token
$$;

-- ============================================================
-- Marcas a vender: el negocio elige qué marcas comercializa
-- (iPhone, Samsung, Otras) en Configuración, y eso precarga las
-- carpetas de Stock con nombres canónicos consistentes (ver
-- app/lib/catalogosMarcas.ts), para evitar carpetas duplicadas por
-- typos de mayúsculas/espacios al escribir el modelo a mano.
-- ============================================================
alter table negocios add column if not exists marcas_stock text[] not null default '{}';

-- ============================================================
-- Servicio Técnico: posesión física del equipo por parte del técnico
-- asignado, y distinción entre equipos propios del local (que al
-- repararse pasan a Stock) y equipos de clientes (que al repararse se
-- entregan de vuelta al cliente, nunca a Stock).
--
-- en_poder_tecnico: true mientras el técnico asignado tiene el equipo
-- físicamente con él; se pone en true automáticamente al asignarle un
-- técnico, y el propio técnico (o quien corresponda) lo destilda cuando
-- ya no lo tiene más (lo entregó). Cada cambio queda en auditoría.
--
-- entregado_a_cliente: análogo a agregado_a_stock pero para equipos de
-- clientes (cliente_id no nulo): en vez de pasar a Stock, se marcan
-- como entregados y dejan de aparecer en las vistas activas, sin perder
-- el historial del técnico ni el ranking de Estadísticas.
-- ============================================================
alter table canjes add column if not exists en_poder_tecnico boolean not null default true;
alter table canjes add column if not exists entregado_a_cliente boolean not null default false;

-- ============================================================
-- Muestra el estado de la orden (pendiente/pagado/entregado) también
-- en la boleta pública por QR, no solo en la interna.
-- ============================================================
create or replace function boleta_publica(token uuid)
returns jsonb
language sql
security definer
stable
as $$
  select jsonb_build_object(
    'id', o.id,
    'created_at', o.created_at,
    'fecha_entrega', o.fecha_entrega,
    'estado', o.estado,
    'forma_pago', o.forma_pago,
    'total', o.total,
    'anticipo', o.anticipo,
    'impuesto_porcentaje', o.impuesto_porcentaje,
    'monto_canje', o.monto_canje,
    'nota', o.nota,
    'incluir_garantia', o.incluir_garantia,
    'moneda', coalesce(o.moneda, n.moneda),
    'negocio', jsonb_build_object(
      'nombre', n.nombre,
      'telefono', n.telefono,
      'direccion', n.direccion,
      'logo_url', n.logo_url,
      'eslogan', n.eslogan,
      'texto_garantia', n.texto_garantia,
      'texto_garantia_tamano', n.texto_garantia_tamano,
      'texto_garantia_servicio', n.texto_garantia_servicio,
      'texto_garantia_servicio_tamano', n.texto_garantia_servicio_tamano
    ),
    'cliente_nombre', nullif(trim(concat(cli.nombre, ' ', coalesce(cli.apellido, ''))), ''),
    'canjes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'modelo', c.modelo,
        'capacidad_gb', c.capacidad_gb,
        'color', c.color,
        'imei', c.imei,
        'salud_bateria', c.salud_bateria,
        'detalles', c.detalles,
        'monto', c.monto
      ) order by c.created_at), '[]'::jsonb)
      from canjes c
      where c.orden_id = o.id and c.estado = 'en_canje'
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'descripcion', oi.descripcion,
        'cantidad', oi.cantidad,
        'precio_unitario', oi.precio_unitario,
        'tipo', oi.tipo,
        'garantia_vencimiento', d.garantia_vencimiento
      )), '[]'::jsonb)
      from orden_items oi
      left join dispositivos d on d.id = oi.dispositivo_id
      where oi.orden_id = o.id
    )
  )
  from ordenes o
  join negocios n on n.id = o.negocio_id
  left join clientes cli on cli.id = o.cliente_id
  where o.token_boleta = token
$$;

-- ============================================================
-- Precio "informativo" en la segunda moneda: la orden sigue teniendo
-- un único total real (en la moneda principal del negocio, la primera
-- de monedas_habilitadas), que es el que cuenta para Estadísticas.
-- Opcionalmente se puede mostrar además, en la boleta, un monto
-- aproximado en la segunda moneda (calculado con el tipo de cambio
-- configurado, editable por orden) — puramente informativo para el
-- cliente, nunca se suma en ningún reporte.
-- ============================================================
alter table negocios add column if not exists tipo_cambio numeric;
alter table ordenes add column if not exists monto_secundario numeric;
alter table ordenes add column if not exists moneda_secundaria text;

-- ============================================================
-- Suma el monto informativo en segunda moneda a la boleta pública.
-- Puramente para mostrar (nunca se usa en estadísticas).
-- ============================================================
create or replace function boleta_publica(token uuid)
returns jsonb
language sql
security definer
stable
as $$
  select jsonb_build_object(
    'id', o.id,
    'created_at', o.created_at,
    'fecha_entrega', o.fecha_entrega,
    'estado', o.estado,
    'forma_pago', o.forma_pago,
    'total', o.total,
    'anticipo', o.anticipo,
    'impuesto_porcentaje', o.impuesto_porcentaje,
    'monto_canje', o.monto_canje,
    'nota', o.nota,
    'incluir_garantia', o.incluir_garantia,
    'moneda', coalesce(o.moneda, n.moneda),
    'monto_secundario', o.monto_secundario,
    'moneda_secundaria', o.moneda_secundaria,
    'negocio', jsonb_build_object(
      'nombre', n.nombre,
      'telefono', n.telefono,
      'direccion', n.direccion,
      'logo_url', n.logo_url,
      'eslogan', n.eslogan,
      'texto_garantia', n.texto_garantia,
      'texto_garantia_tamano', n.texto_garantia_tamano,
      'texto_garantia_servicio', n.texto_garantia_servicio,
      'texto_garantia_servicio_tamano', n.texto_garantia_servicio_tamano
    ),
    'cliente_nombre', nullif(trim(concat(cli.nombre, ' ', coalesce(cli.apellido, ''))), ''),
    'canjes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'modelo', c.modelo,
        'capacidad_gb', c.capacidad_gb,
        'color', c.color,
        'imei', c.imei,
        'salud_bateria', c.salud_bateria,
        'detalles', c.detalles,
        'monto', c.monto
      ) order by c.created_at), '[]'::jsonb)
      from canjes c
      where c.orden_id = o.id and c.estado = 'en_canje'
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'descripcion', oi.descripcion,
        'cantidad', oi.cantidad,
        'precio_unitario', oi.precio_unitario,
        'tipo', oi.tipo,
        'garantia_vencimiento', d.garantia_vencimiento
      )), '[]'::jsonb)
      from orden_items oi
      left join dispositivos d on d.id = oi.dispositivo_id
      where oi.orden_id = o.id
    )
  )
  from ordenes o
  join negocios n on n.id = o.negocio_id
  left join clientes cli on cli.id = o.cliente_id
  where o.token_boleta = token
$$;

-- ============================================================
-- REDISEÑO DE SERVICIO TÉCNICO (Prioridad 1 de un plan más grande)
--
-- Hasta acá, Servicio Técnico vivía mezclado dentro de "canjes" (una
-- tabla que ya cumplía 3 roles: canje/trade-in, derivado a servicio
-- técnico, reparado). Para poder tener ficha completa por reparación
-- (checklist de recepción, diagnóstico, presupuesto, ubicación física,
-- historial detallado, conversión a orden de cobro) se crea una tabla
-- dedicada `reparaciones`, con numeración de orden propia (ST-000001,
-- ST-000002, ...).
--
-- Los canjes existentes con estado 'servicio_tecnico' o 'reparado' se
-- migran automáticamente a `reparaciones` más abajo. Las filas
-- originales en `canjes` NO se borran ni se tocan (quedan como
-- historial inerte); de acá en adelante, Servicio Técnico deja de
-- leer o escribir en `canjes` para estos casos — Plan Canje sigue
-- usando `canjes` normalmente para sus dispositivos "en_canje".
-- ============================================================

alter table negocios add column if not exists contador_reparaciones int not null default 0;

create table if not exists reparaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  numero_orden text,

  -- Identificación
  cliente_id uuid references clientes(id) on delete set null,
  modelo text,
  capacidad_gb int,
  color text,
  imei text,
  codigo_desbloqueo text, -- se muestra oculto por defecto en la UI; no es cifrado, solo se tapa visualmente
  accesorios text[] not null default '{}',
  ubicacion_fisica text,

  -- Recepción / checklist
  falla_declarada text,
  estado_estetico text,
  enciende boolean,
  pantalla_estado text, -- 'ok' | 'rota' | 'marcada'
  camaras_ok boolean,
  botones_ok boolean,
  biometria_ok boolean, -- Face ID / Touch ID
  altavoces_ok boolean,
  conectores_ok boolean,
  humedad boolean,
  fotos_ingreso text[] not null default '{}',
  garantia_condiciones_aceptadas boolean not null default false,

  -- Diagnóstico
  diagnostico text,
  tecnico_id uuid references tecnicos(id) on delete set null,
  prioridad text not null default 'normal', -- 'normal' | 'urgente' | 'critica'
  trabajo_recomendado text,
  presupuesto_mano_obra numeric,
  presupuesto_repuestos numeric,
  fecha_estimada date,
  observaciones_internas text,

  -- Estado operativo
  estado text not null default 'recibido',
  -- 'recibido' | 'esperando_diagnostico' | 'esperando_aprobacion' |
  -- 'esperando_repuesto' | 'en_reparacion' | 'listo_para_entregar' |
  -- 'entregado' | 'cancelado'
  en_poder_tecnico boolean not null default true,

  -- Reparación y entrega
  trabajos_realizados text[] not null default '{}',
  repuestos_utilizados text,
  resultado_final text,
  importe_total numeric,
  forma_pago text,
  garantia_dias int,
  fecha_entrega timestamptz,

  -- Trazabilidad de origen y de salida
  canje_origen_id uuid references canjes(id) on delete set null, -- si vino de Plan Canje
  orden_origen_id uuid references ordenes(id) on delete set null, -- si vino de una Orden ya creada
  orden_cobro_id uuid references ordenes(id) on delete set null, -- orden de venta generada al cobrar la reparación
  reparacion_original_id uuid references reparaciones(id) on delete set null, -- si es un reingreso por garantía

  -- Seguimiento público (mismo mecanismo que ya existía en canjes)
  token_seguimiento uuid not null default gen_random_uuid(),

  fecha_ingreso_servicio timestamptz not null default now(),
  fecha_reparado timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists reparaciones_token_seguimiento_idx on reparaciones(token_seguimiento);
create unique index if not exists reparaciones_numero_orden_idx on reparaciones(negocio_id, numero_orden);

alter table reparaciones enable row level security;

create policy "reparaciones de mi negocio" on reparaciones
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

-- Timeline por reparación: notas internas (solo personal) y mensajes
-- al cliente (registro de lo que se le mandó). Los cambios de estado,
-- asignaciones e importes quedan en la auditoría general (entidad
-- 'reparacion'), y la ficha combina ambas fuentes para mostrar un
-- historial único.
create table if not exists reparaciones_eventos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  reparacion_id uuid not null references reparaciones(id) on delete cascade,
  tipo text not null, -- 'nota_interna' | 'mensaje_cliente'
  texto text not null,
  actor_nombre text,
  actor_tipo text,
  created_at timestamptz not null default now()
);

alter table reparaciones_eventos enable row level security;

create policy "eventos de reparaciones de mi negocio" on reparaciones_eventos
  for all using (negocio_id = negocio_actual())
  with check (negocio_id = negocio_actual());

-- Genera el próximo número de orden para un negocio, de forma atómica
-- (bloquea la fila de negocios durante el incremento para que dos
-- altas simultáneas nunca reciban el mismo número).
create or replace function siguiente_numero_reparacion(neg_id uuid)
returns text
language plpgsql
as $$
declare
  nuevo_numero int;
begin
  update negocios
  set contador_reparaciones = contador_reparaciones + 1
  where id = neg_id
  returning contador_reparaciones into nuevo_numero;

  return 'ST-' || lpad(nuevo_numero::text, 6, '0');
end;
$$;

create or replace function asignar_numero_reparacion()
returns trigger
language plpgsql
as $$
begin
  if new.numero_orden is null then
    new.numero_orden := siguiente_numero_reparacion(new.negocio_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_numero_reparacion on reparaciones;
create trigger trigger_numero_reparacion
  before insert on reparaciones
  for each row
  execute function asignar_numero_reparacion();

-- ============================================================
-- Migración automática: copia los canjes existentes con estado
-- 'servicio_tecnico' o 'reparado' a la tabla nueva, en orden
-- cronológico (para que la numeración ST-000001... respete el orden
-- real de ingreso). No se borra nada de `canjes`.
-- ============================================================
insert into reparaciones (
  negocio_id, cliente_id, modelo, capacidad_gb, color, imei,
  diagnostico, tecnico_id, estado, en_poder_tecnico,
  trabajos_realizados, canje_origen_id, token_seguimiento,
  fecha_ingreso_servicio, fecha_reparado, created_at
)
select
  c.negocio_id, c.cliente_id, c.modelo, c.capacidad_gb, c.color, c.imei,
  c.detalles, c.tecnico_id,
  case
    when c.estado = 'reparado' and (c.agregado_a_stock or c.entregado_a_cliente) then 'entregado'
    when c.estado = 'reparado' then 'listo_para_entregar'
    when c.estado = 'servicio_tecnico' and c.tecnico_id is not null then 'en_reparacion'
    else 'recibido'
  end,
  coalesce(c.en_poder_tecnico, true),
  coalesce(c.trabajos_realizados, '{}'),
  c.id,
  c.token_seguimiento,
  coalesce(c.fecha_ingreso_servicio, c.created_at),
  c.fecha_reparado,
  c.created_at
from canjes c
where c.estado in ('servicio_tecnico', 'reparado')
order by coalesce(c.fecha_ingreso_servicio, c.created_at) asc;

-- ============================================================
-- El seguimiento público ahora lee de `reparaciones` en vez de
-- `canjes` (los links/QR ya impresos siguen funcionando: el token se
-- copió tal cual en la migración de arriba).
--
-- Postgres no permite cambiar la forma de las columnas de salida de
-- una función con "create or replace" (hay que borrarla primero).
-- ============================================================
drop function if exists seguimiento_publico(uuid);

create or replace function seguimiento_publico(token uuid)
returns table (
  numero_orden text,
  modelo text,
  capacidad_gb int,
  color text,
  estado text,
  fecha_ingreso_servicio timestamptz,
  fecha_estimada date,
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
    r.numero_orden, r.modelo, r.capacidad_gb, r.color, r.estado,
    r.fecha_ingreso_servicio, r.fecha_estimada, r.fecha_reparado, r.trabajos_realizados,
    cli.nombre,
    n.nombre, n.logo_url
  from reparaciones r
  join negocios n on n.id = r.negocio_id
  left join clientes cli on cli.id = r.cliente_id
  where r.token_seguimiento = token
$$;

-- ============================================================
-- Alertas inteligentes: para saber "hace cuánto está en este estado"
-- (presupuesto sin responder hace 48hs, esperando repuesto hace
-- mucho, listo sin retirar hace 7 días, etc.) hace falta guardar
-- cuándo cambió de estado por última vez, no solo cuándo ingresó.
-- ============================================================
alter table reparaciones add column if not exists estado_actualizado_at timestamptz not null default now();

-- ============================================================
-- Quién cargó cada dispositivo al stock (para mostrar su foto en
-- "Actividad reciente", igual que ya se hace con vendedor en ventas y
-- técnico en reparaciones). Es una foto/nombre "congelados" al
-- momento de cargarlo, no una referencia en vivo a vendedores/
-- técnicos — porque quien lo carga puede ser cualquiera de los dos.
-- ============================================================
alter table dispositivos add column if not exists agregado_por_nombre text;
alter table dispositivos add column if not exists agregado_por_foto_url text;

-- ============================================================
-- Pago manual (ej. USDT/Binance) como alternativa a Lemon Squeezy,
-- mientras la verificación de identidad sigue en trámite y para
-- evitar la comisión del intermediario. El negocio sube un
-- comprobante desde Configuración > Suscripción; el super-admin lo
-- revisa a mano en /admin y aprueba (asignando días de acceso y
-- plan) o rechaza. También se agrega una función para que el admin
-- pueda editar la suscripción de cualquier negocio a mano, sin
-- necesidad de un comprobante (cortesías, pruebas extendidas, etc).
--
-- IMPORTANTE: para el vencimiento del acceso otorgado a mano se usa
-- una columna nueva (`acceso_manual_hasta`), NO `fecha_fin_prueba`.
-- El webhook de Lemon Squeezy nunca borra `fecha_fin_prueba` al pasar
-- de "trialing" a "active" (se queda con la fecha del trial original,
-- que ya pasó) — si negocio_suscripcion_activa() reusara esa columna
-- para todos los "active", cortaría el acceso a cualquier cliente que
-- ya haya pagado con Lemon Squeezy. `acceso_manual_hasta` arranca en
-- null para todo el mundo (sin vencimiento) y solo se completa cuando
-- el admin aprueba un pago manual o carga un vencimiento a mano.
-- ============================================================
alter table negocios add column if not exists plan text;
alter table negocios add column if not exists acceso_manual_hasta timestamptz;

-- "plan" y "acceso_manual_hasta" también los toca únicamente el
-- admin/webhook, nunca el propio negocio (mismo motivo que
-- estado_suscripcion/fecha_fin_prueba/activo).
revoke update (estado_suscripcion, fecha_fin_prueba, lemonsqueezy_customer_id, lemonsqueezy_subscription_id, activo, plan, acceso_manual_hasta)
  on negocios from authenticated;

create table if not exists comprobantes_pago (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  monto numeric not null,
  moneda text not null default 'USDT',
  comprobante_imagen text,
  referencia text,
  estado text not null default 'pendiente', -- 'pendiente' | 'aprobado' | 'rechazado'
  nota_admin text,
  created_at timestamptz not null default now(),
  revisado_at timestamptz,
  revisado_por text
);

alter table comprobantes_pago enable row level security;

create policy "negocio ve sus propios comprobantes" on comprobantes_pago
  for select using (negocio_id = negocio_actual());

create policy "negocio crea su propio comprobante" on comprobantes_pago
  for insert with check (negocio_id = negocio_actual());

-- Nadie (ni siquiera el propio negocio) puede update/delete vía API
-- normal: la aprobación/rechazo la hace únicamente el admin, a través
-- de las funciones security definer de abajo.

drop function if exists admin_listar_negocios();

create or replace function admin_listar_negocios()
returns table (
  id uuid,
  nombre text,
  activo boolean,
  creado timestamptz,
  cantidad_usuarios bigint,
  cantidad_dispositivos bigint,
  cantidad_ordenes bigint,
  ultima_actividad timestamptz,
  estado_suscripcion text,
  fecha_fin_prueba timestamptz,
  plan text,
  acceso_manual_hasta timestamptz
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
      ),
      n.estado_suscripcion,
      n.fecha_fin_prueba,
      n.plan,
      n.acceso_manual_hasta
    from negocios n
    order by n.created_at desc;
end;
$$;

create or replace function admin_listar_comprobantes_pendientes()
returns table (
  id uuid,
  negocio_id uuid,
  nombre_negocio text,
  monto numeric,
  moneda text,
  comprobante_imagen text,
  referencia text,
  created_at timestamptz
)
language plpgsql
security definer
as $$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  return query
    select c.id, c.negocio_id, n.nombre, c.monto, c.moneda, c.comprobante_imagen, c.referencia, c.created_at
    from comprobantes_pago c
    join negocios n on n.id = c.negocio_id
    where c.estado = 'pendiente'
    order by c.created_at asc;
end;
$$;

create or replace function admin_aprobar_pago(comprobante_id uuid, dias int, nuevo_plan text)
returns void
language plpgsql
security definer
as $$
declare
  neg_id uuid;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  select negocio_id into neg_id from comprobantes_pago where id = comprobante_id;
  if neg_id is null then
    raise exception 'Comprobante no encontrado';
  end if;

  update comprobantes_pago
    set estado = 'aprobado', revisado_at = now(), revisado_por = auth.uid()::text
    where id = comprobante_id;

  -- Se extiende desde el mayor entre "ahora" y el vencimiento que ya
  -- tenía, no siempre desde "ahora": si por error se aprueba un segundo
  -- comprobante (o uno mensual encima de un plan anual todavía vigente),
  -- esto suma los días nuevos en vez de acortar el acceso pago que el
  -- negocio ya tenía.
  update negocios
    set estado_suscripcion = 'active',
        acceso_manual_hasta = greatest(coalesce(acceso_manual_hasta, now()), now()) + (dias || ' days')::interval,
        plan = nuevo_plan
    where id = neg_id;
end;
$$;

create or replace function admin_rechazar_pago(comprobante_id uuid, motivo text)
returns void
language plpgsql
security definer
as $$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  update comprobantes_pago
    set estado = 'rechazado', nota_admin = motivo, revisado_at = now(), revisado_por = auth.uid()::text
    where id = comprobante_id;
end;
$$;

-- Edición manual de la suscripción de cualquier negocio, sin
-- necesidad de un comprobante (cortesías, pruebas extendidas, ajustes
-- puntuales). Todos los parámetros salvo neg_id son opcionales: solo
-- se actualiza lo que se pasa.
create or replace function admin_actualizar_suscripcion(
  neg_id uuid,
  nuevo_estado text default null,
  dias_desde_hoy int default null,
  nuevo_plan text default null,
  quitar_vencimiento boolean default false
)
returns void
language plpgsql
security definer
as $$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  update negocios set
    estado_suscripcion = coalesce(nuevo_estado, estado_suscripcion),
    acceso_manual_hasta = case
      when quitar_vencimiento then null
      when dias_desde_hoy is not null then now() + (dias_desde_hoy || ' days')::interval
      else acceso_manual_hasta
    end,
    plan = coalesce(nuevo_plan, plan)
  where id = neg_id;
end;
$$;

-- negocio_suscripcion_activa ahora respeta acceso_manual_hasta como
-- vencimiento del acceso otorgado a mano (pago manual aprobado o
-- ajuste directo del admin), para 'active'/'past_due'. No toca
-- fecha_fin_prueba (esa sigue significando únicamente "fin del
-- trial"), así que las cuentas de Lemon Squeezy no se ven afectadas:
-- acceso_manual_hasta arranca en null para todo el mundo (sin
-- vencimiento) y solo se completa cuando el admin otorga acceso manual
-- con un plazo — a partir de ahí vence solo, sin depender de que
-- alguien lo desactive a mano.
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
          when estado_suscripcion in ('active', 'past_due') then (acceso_manual_hasta is null or acceso_manual_hasta > now())
          when estado_suscripcion = 'trialing' then coalesce(fecha_fin_prueba, now()) > now()
          else false
        end
      from negocios where id = negocio_actual()
    ),
    true
  )
$$;

-- ============================================================
-- Panel admin: mostrar el mail de cada usuario junto con el negocio
-- (antes había que expandir cada negocio y esperar otra consulta
-- aparte) y permitir borrar definitivamente cuentas de prueba —
-- tanto un usuario suelto como un negocio entero con todos sus datos
-- y usuarios. Todo lo demás en la app usa "activo = false" para
-- bloquear el acceso sin borrar nada; esto es aparte, para cuando
-- realmente hay que eliminar información que no debería existir
-- (cuentas de prueba, principalmente).
-- ============================================================

drop function if exists admin_listar_negocios();

create or replace function admin_listar_negocios()
returns table (
  id uuid,
  nombre text,
  activo boolean,
  creado timestamptz,
  cantidad_usuarios bigint,
  cantidad_dispositivos bigint,
  cantidad_ordenes bigint,
  ultima_actividad timestamptz,
  estado_suscripcion text,
  fecha_fin_prueba timestamptz,
  plan text,
  acceso_manual_hasta timestamptz,
  usuarios jsonb
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
      ),
      n.estado_suscripcion,
      n.fecha_fin_prueba,
      n.plan,
      n.acceso_manual_hasta,
      coalesce(
        (
          select jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'creado', p.created_at) order by p.created_at)
          from perfiles p
          join auth.users u on u.id = p.id
          where p.negocio_id = n.id
        ),
        '[]'::jsonb
      )
    from negocios n
    order by n.created_at desc;
end;
$$;

-- Borra una cuenta de usuario para siempre (no solo del negocio: la
-- cuenta de login deja de existir). Si era el único usuario del
-- negocio, el negocio queda sin nadie adentro pero sigue existiendo
-- con sus datos — usar admin_eliminar_negocio para borrar todo junto.
create or replace function admin_eliminar_usuario(usuario_id_param uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  delete from auth.users where id = usuario_id_param;
end;
$$;

-- Borra un negocio para siempre: todos sus datos (dispositivos,
-- órdenes, etc. — se van solos por "on delete cascade") y también
-- las cuentas de login de sus usuarios (si no se borraran acá,
-- quedarían cuentas activas sin ningún negocio detrás).
create or replace function admin_eliminar_negocio(negocio_id_param uuid)
returns void
language plpgsql
security definer
as $$
declare
  usuario_ids uuid[];
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;

  select array_agg(id) into usuario_ids from perfiles where negocio_id = negocio_id_param;

  delete from negocios where id = negocio_id_param;

  if usuario_ids is not null then
    delete from auth.users where id = any(usuario_ids);
  end if;
end;
$$;

-- ============================================================
-- PIN de 4 dígitos opcional por vendedor/técnico. No reemplaza ningún
-- login: el selector de "¿con quién tengo el gusto?" (SelectorDeActor)
-- sigue siendo de un solo toque para el mostrador compartido, pero si
-- una persona cargó un PIN, hay que tipearlo para elegirla — evita
-- que cualquiera se atribuya (o le atribuya a otro) una venta o
-- reparación que no hizo. Se guarda en texto plano a propósito: es un
-- control liviano de atribución dentro del propio local, no una
-- credencial real — no protege plata ni datos, así que no amerita el
-- costo de hashearlo.
alter table vendedores add column if not exists pin text;
alter table tecnicos add column if not exists pin text;

-- ============================================================
-- Quién cargó cada cliente (igual que ya existe para dispositivos en
-- agregado_por_nombre/agregado_por_foto_url): en "Actividad reciente"
-- un cliente nuevo no mostraba ni foto ni nombre de quién lo cargó,
-- a diferencia de una venta o una reparación terminada.
-- ============================================================
alter table clientes add column if not exists agregado_por_nombre text;
alter table clientes add column if not exists agregado_por_foto_url text;

-- ============================================================
-- El selector de "¿con quién tengo el gusto?" (SelectorDeActor)
-- traía la lista de vendedores/técnicos con un simple select('*'),
-- que incluye la columna "pin" — es decir, el PIN de TODOS quedaba
-- viajando en la respuesta de red apenas se abría el cartel, visible
-- para cualquiera que mirara las herramientas de desarrollador del
-- navegador, sin necesidad de adivinarlo. Estas funciones evitan que
-- el valor real del PIN salga nunca del servidor: una devuelve solo
-- los ids que TIENEN un PIN cargado (para mostrar el candadito 🔒 sin
-- revelar cuál es), y la otra confirma un PIN sin exponerlo.
create or replace function ids_vendedores_con_pin()
returns table (id uuid)
language sql
security definer
stable
as $$
  select id from vendedores where negocio_id = negocio_actual() and pin is not null
$$;

create or replace function ids_tecnicos_con_pin()
returns table (id uuid)
language sql
security definer
stable
as $$
  select id from tecnicos where negocio_id = negocio_actual() and pin is not null
$$;

create or replace function verificar_pin_vendedor(vendedor_id uuid, pin_ingresado text)
returns boolean
language sql
security definer
stable
as $$
  select exists(
    select 1 from vendedores
    where id = vendedor_id and negocio_id = negocio_actual() and pin is not null and pin = pin_ingresado
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
    where id = tecnico_id and negocio_id = negocio_actual() and pin is not null and pin = pin_ingresado
  )
$$;

-- ============================================================
-- "iPhone" siempre con esa capitalización exacta (i minúscula, P
-- mayúscula, resto minúscula) en cualquier campo de modelo, sin
-- importar cómo lo haya tipeado cada persona. Esto pasaba: alguien
-- cargaba "iphone 13" a mano (todo minúscula) y el sistema lo
-- entendía como una carpeta nueva, distinta de "iPhone 13" — quedaban
-- dos carpetas idénticas y había que fusionarlas a mano. La app ya
-- normaliza esto al crear la carpeta (ver asegurarModelo en
-- app/lib/modelos.ts), pero este trigger lo hace también acá, a
-- nivel de base de datos, para que quede corregido pase lo que pase
-- por cualquier camino (incluida la importación por CSV, que no pasa
-- por esa función).
create or replace function normalizar_modelo_iphone()
returns trigger
language plpgsql
as $$
begin
  if new.modelo is not null then
    new.modelo := regexp_replace(new.modelo, '\yiphone\y', 'iPhone', 'gi');
  end if;
  return new;
end;
$$;

drop trigger if exists normalizar_modelo_iphone_dispositivos on dispositivos;
create trigger normalizar_modelo_iphone_dispositivos
  before insert or update of modelo on dispositivos
  for each row execute function normalizar_modelo_iphone();

drop trigger if exists normalizar_modelo_iphone_canjes on canjes;
create trigger normalizar_modelo_iphone_canjes
  before insert or update of modelo on canjes
  for each row execute function normalizar_modelo_iphone();

drop trigger if exists normalizar_modelo_iphone_compras on compras;
create trigger normalizar_modelo_iphone_compras
  before insert or update of modelo on compras
  for each row execute function normalizar_modelo_iphone();

drop trigger if exists normalizar_modelo_iphone_reparaciones on reparaciones;
create trigger normalizar_modelo_iphone_reparaciones
  before insert or update of modelo on reparaciones
  for each row execute function normalizar_modelo_iphone();

create or replace function normalizar_nombre_carpeta_iphone()
returns trigger
language plpgsql
as $$
begin
  if new.nombre is not null then
    new.nombre := regexp_replace(new.nombre, '\yiphone\y', 'iPhone', 'gi');
  end if;
  return new;
end;
$$;

drop trigger if exists normalizar_nombre_carpeta_iphone on modelos_stock;
create trigger normalizar_nombre_carpeta_iphone
  before insert or update of nombre on modelos_stock
  for each row execute function normalizar_nombre_carpeta_iphone();

-- ============================================================
-- Checklist de recepción más detallado en Servicio Técnico (pedido
-- por un técnico externo, vía el usuario): además de lo que ya había
-- (cámaras/botones/altavoces agrupados), ahora se puede marcar por
-- separado módulo/señal, flash, cámara frontal/trasera, botón power/
-- volumen y micrófono superior/inferior. Las columnas viejas
-- (camaras_ok, botones_ok) NO se borran ni se tocan — quedan como
-- historial de reparaciones cargadas antes de este cambio; el
-- formulario nuevo ya no las usa, usa estas de acá.
--
-- garantia_excepcion_manual es para que el técnico anote a mano una
-- exclusión de garantía que no se deduce automáticamente de la
-- checklist (ej.: "por golpe fuerte en el chasis, no garantizamos
-- Face ID aunque hoy funcione" — el módulo puede estar bien pero el
-- golpe generar dudas sobre otro componente sensible).
alter table reparaciones add column if not exists modulo_ok boolean;
alter table reparaciones add column if not exists flash_ok boolean;
alter table reparaciones add column if not exists camara_frontal_ok boolean;
alter table reparaciones add column if not exists camara_trasera_ok boolean;
alter table reparaciones add column if not exists microfono_superior_ok boolean;
alter table reparaciones add column if not exists microfono_inferior_ok boolean;
alter table reparaciones add column if not exists boton_power_ok boolean;
alter table reparaciones add column if not exists boton_volumen_ok boolean;
alter table reparaciones add column if not exists garantia_excepcion_manual text;

-- ============================================================
-- Permisos por vendedor (pedido por el dueño para limitar qué puede
-- hacer cada uno). Es un límite a nivel de la app, apoyado en el PIN
-- que ya elige cada vendedor en el selector de "Cambiar" — NO es un
-- login real con su propio usuario/contraseña ni una restricción a
-- nivel de base de datos (cualquiera con acceso al negocio en Supabase
-- sigue viendo todo). Por eso, para que un permiso restringido tenga
-- sentido, ese vendedor necesita tener un PIN cargado — si no, cualquiera
-- puede simplemente elegirse a sí mismo como otro vendedor sin PIN.
--
-- Default true en las cuatro columnas: un vendedor recién cargado (o
-- ya existente antes de este cambio) sigue teniendo acceso completo
-- hasta que el dueño decida restringirlo a mano.
alter table vendedores add column if not exists acceso_completo boolean not null default true;
alter table vendedores add column if not exists puede_vender boolean not null default true;
alter table vendedores add column if not exists puede_eliminar boolean not null default true;
alter table vendedores add column if not exists puede_agregar_stock boolean not null default true;
