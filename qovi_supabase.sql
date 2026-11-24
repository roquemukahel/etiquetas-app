-- ============================================================
-- QOVENTO — Qovi, asistente inteligente (v1, solo lectura / explicativo).
-- Migración ADITIVA e IDEMPOTENTE: se puede correr más de una vez.
--
-- Requiere que existan negocio_actual() y super_admins/es_admin() (ya están
-- en supabase/schema.sql).
-- ============================================================

-- ---------- Base de conocimiento (contenido de PLATAFORMA, no por negocio) ----------
-- Los artículos documentan procedimientos reales de Qovento (cómo vender, cómo
-- cargar un repuesto, etc.) — son iguales para todos los negocios, por eso NO
-- tienen negocio_id. Solo el superadministrador los edita (es_admin()).
create table if not exists qovi_articulos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  slug text not null unique,
  modulo text not null,                 -- ventas | stock | clientes | servicio_tecnico | plan_canje | compras | proveedores | estadisticas | comisiones | caja | configuracion | cuentas_por_cobrar | plan_ahorro | general
  contenido text not null,
  palabras_clave text[] not null default '{}',
  -- Vacío = visible para cualquier rol. Si no, alguno de: administrador | vendedor | tecnico
  roles_autorizados text[] not null default '{}',
  ruta_relacionada text,
  -- Claves controladas (ver QOVI_ACCIONES en app/lib/qovi/acciones.ts) — nunca una URL libre.
  acciones_navegacion text[] not null default '{}',
  estado text not null default 'borrador',
  version int not null default 1,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint qovi_articulos_estado_valido check (estado in ('borrador', 'publicado')),
  constraint qovi_articulos_titulo_no_vacio check (length(trim(titulo)) > 0),
  constraint qovi_articulos_contenido_no_vacio check (length(trim(contenido)) > 0)
);

-- Columna de búsqueda de texto completo (RAG liviano, sin servicios externos):
-- título con más peso que el contenido, más las palabras clave. NO se arma
-- con GENERATED ALWAYS AS: Postgres exige que esa expresión sea IMMUTABLE y
-- to_tsvector(regconfig, text) no lo es (depende de la configuración de
-- idioma), así que se mantiene con un trigger en su lugar — mismo resultado,
-- sin esa restricción.
alter table qovi_articulos add column if not exists busqueda tsvector;

create or replace function qovi_articulos_actualizar_busqueda()
returns trigger
language plpgsql
as $$
begin
  new.busqueda :=
    setweight(to_tsvector('spanish', coalesce(new.titulo, '')), 'A') ||
    setweight(to_tsvector('spanish', array_to_string(coalesce(new.palabras_clave, '{}'), ' ')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(new.contenido, '')), 'B');
  return new;
end;
$$;

drop trigger if exists trg_qovi_articulos_busqueda on qovi_articulos;
create trigger trg_qovi_articulos_busqueda
  before insert or update on qovi_articulos
  for each row execute function qovi_articulos_actualizar_busqueda();

create index if not exists idx_qovi_articulos_busqueda on qovi_articulos using gin (busqueda);
create index if not exists idx_qovi_articulos_modulo on qovi_articulos(modulo) where estado = 'publicado';

alter table qovi_articulos enable row level security;
drop policy if exists "qovi_articulos lectura" on qovi_articulos;
create policy "qovi_articulos lectura" on qovi_articulos
  for select using (estado = 'publicado' or es_admin());
drop policy if exists "qovi_articulos escritura solo admin" on qovi_articulos;
create policy "qovi_articulos escritura solo admin" on qovi_articulos
  for insert with check (es_admin());
drop policy if exists "qovi_articulos edicion solo admin" on qovi_articulos;
create policy "qovi_articulos edicion solo admin" on qovi_articulos
  for update using (es_admin()) with check (es_admin());
drop policy if exists "qovi_articulos borrado solo admin" on qovi_articulos;
create policy "qovi_articulos borrado solo admin" on qovi_articulos
  for delete using (es_admin());

-- ---------- Configuración por negocio (abstracción simple, no un sistema de planes) ----------
-- OJO: `habilitado` arranca en FALSE a propósito. El pedido explícito fue
-- probar Qovi en una "sección experimental" antes de liberarlo a todos los
-- negocios — por eso, apenas corrida esta migración, Qovi queda invisible
-- en absolutamente todos los negocios hasta que el superadministrador lo
-- habilite puntualmente para probarlo (ver /admin/qovi), negocio por
-- negocio. Recién cuando se decida liberarlo para todos, se cambia este
-- default a true (o se habilita fila por fila, según se prefiera).
create table if not exists qovi_configuracion (
  negocio_id uuid primary key references negocios(id) on delete cascade default negocio_actual(),
  habilitado boolean not null default false,
  limite_diario int,                    -- null = usa el default global (QOVI_DAILY_TENANT_LIMIT)
  actualizado_en timestamptz not null default now()
);
alter table qovi_configuracion enable row level security;
drop policy if exists "qovi_configuracion de mi negocio" on qovi_configuracion;
create policy "qovi_configuracion de mi negocio" on qovi_configuracion
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

-- ---------- Conversaciones y mensajes ----------
create table if not exists qovi_conversaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  usuario_id uuid not null default auth.uid(),
  actor_nombre text,
  actor_tipo text,
  modulo_inicial text,
  creado_en timestamptz not null default now()
);
create index if not exists idx_qovi_conversaciones_negocio on qovi_conversaciones(negocio_id, creado_en desc);
alter table qovi_conversaciones enable row level security;
drop policy if exists "qovi_conversaciones de mi negocio" on qovi_conversaciones;
create policy "qovi_conversaciones de mi negocio" on qovi_conversaciones
  for all using (negocio_id = negocio_actual()) with check (negocio_id = negocio_actual());

create table if not exists qovi_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references qovi_conversaciones(id) on delete cascade,
  rol text not null,                    -- user | assistant
  contenido text not null,
  fuentes jsonb not null default '[]',
  acciones jsonb not null default '[]',
  sugerencias jsonb not null default '[]',
  confianza text,                       -- alta | media | baja
  escalar boolean not null default false,
  valoracion text,                      -- util | no_util | null
  creado_en timestamptz not null default now(),
  constraint qovi_mensajes_rol_valido check (rol in ('user', 'assistant')),
  constraint qovi_mensajes_valoracion_valida check (valoracion is null or valoracion in ('util', 'no_util'))
);
create index if not exists idx_qovi_mensajes_conversacion on qovi_mensajes(conversacion_id, creado_en);
alter table qovi_mensajes enable row level security;
drop policy if exists "qovi_mensajes de mi negocio" on qovi_mensajes;
create policy "qovi_mensajes de mi negocio" on qovi_mensajes
  for all using (
    exists (select 1 from qovi_conversaciones c where c.id = conversacion_id and c.negocio_id = negocio_actual())
  ) with check (
    exists (select 1 from qovi_conversaciones c where c.id = conversacion_id and c.negocio_id = negocio_actual())
  );

-- ---------- Uso y costos ----------
create table if not exists qovi_uso (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade default negocio_actual(),
  usuario_id uuid default auth.uid(),
  modulo_actual text,
  modelo text,
  tokens_entrada int not null default 0,
  tokens_salida int not null default 0,
  tokens_cache int not null default 0,
  costo_estimado numeric not null default 0,
  duracion_ms int,
  estado text not null,                 -- ok | error | rate_limited | sin_info | deshabilitado
  creado_en timestamptz not null default now(),
  constraint qovi_uso_estado_valido check (estado in ('ok', 'error', 'rate_limited', 'sin_info', 'deshabilitado'))
);
create index if not exists idx_qovi_uso_negocio on qovi_uso(negocio_id, creado_en desc);
alter table qovi_uso enable row level security;
drop policy if exists "qovi_uso de mi negocio" on qovi_uso;
create policy "qovi_uso de mi negocio" on qovi_uso
  for select using (negocio_id = negocio_actual());
-- El insert lo hace el servidor (ruta /api/qovi/chat) con la sesión del usuario — mismo criterio que el resto de las tablas.
drop policy if exists "qovi_uso insertar de mi negocio" on qovi_uso;
create policy "qovi_uso insertar de mi negocio" on qovi_uso
  for insert with check (negocio_id = negocio_actual());

-- RPC de métricas agregadas para el panel de superadmin (/admin/qovi):
-- bypassa RLS a propósito (security definer) porque necesita sumar TODOS los
-- negocios — mismo patrón que admin_listar_negocios() en supabase/schema.sql.
-- Qualified explícitamente (qovi_uso.negocio_id, no negocio_id) porque sin
-- RLS activo acá adentro un nombre de columna ambiguo podría confundirse.
create or replace function qovi_admin_metricas(p_desde date default (current_date - interval '30 days')::date)
returns table (
  consultas_totales bigint,
  negocios_activos bigint,
  costo_total numeric,
  tokens_entrada_total bigint,
  tokens_salida_total bigint,
  valoraciones_utiles bigint,
  valoraciones_no_utiles bigint,
  consultas_sin_info bigint,
  errores bigint
)
language sql
security definer
stable
as $$
  select
    count(u.id),
    count(distinct u.negocio_id),
    coalesce(sum(u.costo_estimado), 0),
    coalesce(sum(u.tokens_entrada), 0),
    coalesce(sum(u.tokens_salida), 0),
    (select count(*) from qovi_mensajes m where m.valoracion = 'util' and m.creado_en >= p_desde),
    (select count(*) from qovi_mensajes m where m.valoracion = 'no_util' and m.creado_en >= p_desde),
    (select count(*) from qovi_uso u2 where u2.estado = 'sin_info' and u2.creado_en >= p_desde),
    (select count(*) from qovi_uso u2 where u2.estado = 'error' and u2.creado_en >= p_desde)
  from qovi_uso u
  where u.creado_en >= p_desde
    and es_admin();
$$;

-- Negocios con más consultas, para "comercios con mayor consumo".
create or replace function qovi_admin_ranking_negocios(p_desde date default (current_date - interval '30 days')::date, p_limite int default 10)
returns table (negocio_id uuid, nombre_negocio text, consultas bigint, costo numeric)
language sql
security definer
stable
as $$
  select u.negocio_id, n.nombre, count(*), coalesce(sum(u.costo_estimado), 0)
  from qovi_uso u
  join negocios n on n.id = u.negocio_id
  where u.creado_en >= p_desde and es_admin()
  group by u.negocio_id, n.nombre
  order by count(*) desc
  limit p_limite;
$$;

-- ---------- Artículos iniciales (verificados contra el código real) ----------
-- No se pisan si ya existen (por si el superadmin los edita desde el panel
-- y se vuelve a correr esta migración en otro negocio/entorno).
insert into qovi_articulos (titulo, slug, modulo, contenido, palabras_clave, roles_autorizados, ruta_relacionada, acciones_navegacion, estado)
values
(
  'Cómo hacer una venta',
  'como-hacer-una-venta',
  'ventas',
  'Para cargar una venta vas a Órdenes y tocás "+ Nueva orden".
1. Elegí el cliente: buscalo si ya existe, cargalo nuevo en el momento, o tocá "Consumidor final" si no vas a guardar sus datos.
2. Agregá al carrito lo que vende: un dispositivo del Stock, uno nuevo a mano, un producto del catálogo, un trabajo de Servicio Técnico, o un equipo que el cliente entrega como parte de pago (Plan Canje).
3. Elegí la forma de pago (efectivo, transferencia, débito, crédito, cuenta corriente o un plan en cuotas) y confirmá con el botón "Confirmar orden".
La orden se guarda y desde ahí podés abrir su boleta para imprimir o mandar por WhatsApp.',
  array['venta','vender','nueva orden','orden','carrito','consumidor final'],
  '{}',
  '/ordenes/nueva',
  array['ir_ordenes_nueva'],
  'publicado'
),
(
  'Cómo generar una orden de reparación',
  'como-generar-orden-reparacion',
  'servicio_tecnico',
  'Para recibir un equipo a reparar entrá a Servicio Técnico y tocá "+ Recibir equipo".
1. Cargá el modelo, capacidad, color e IMEI si lo tiene.
2. Completá la falla que declara el cliente y, si corresponde, el checklist de ingreso (pantalla, batería, botones, etc.).
3. Guardá — el sistema genera un número de orden y el equipo queda "en reparación".
Desde la ficha de esa reparación después podés anotar el diagnóstico, cargar el repuesto usado, cambiar el estado (en diagnóstico, presupuestado, en reparación, listo, entregado) y, al cobrar, se genera la boleta o la orden de cobro.',
  array['servicio tecnico','reparacion','recibir equipo','diagnostico','falla'],
  '{}',
  '/servicio-tecnico',
  array['ir_servicio_tecnico'],
  'publicado'
),
(
  'Cómo ingresar un dispositivo al Stock',
  'como-ingresar-dispositivo-stock',
  'stock',
  'En Stock tocás "+ Agregar" y elegís una de estas dos formas:
1. "Cargar a mano": completás modelo, capacidad, color, IMEI, estado y precio vos mismo.
2. "Cargar con foto": sacás una foto a la pantalla de "Información" del equipo, a una etiqueta pegada, o a la caja (si está sellado), y el sistema completa los datos automáticamente para que los revises antes de guardar.
También podés recibir un equipo como parte de pago en una venta (Plan Canje) o como entrega de una Compra — en ambos casos, desde esa pantalla hay un botón para mandarlo directo al Stock.',
  array['stock','cargar dispositivo','agregar stock','imei','cargar con foto'],
  '{}',
  '/stock',
  array['ir_stock'],
  'publicado'
),
(
  'Cómo registrar un cliente',
  'como-registrar-cliente',
  'clientes',
  'Andá a Clientes y tocá "+ Cargar cliente".
1. Completá nombre y, si los tenés, apellido, teléfono, DNI, domicilio y email.
2. Guardá — el cliente queda disponible para elegirlo en cualquier venta futura.
También podés cargar un cliente nuevo en el momento de hacer una venta, sin salir de Nueva Orden: ahí mismo hay una opción "Cargar nuevo" cuando vas a elegir el cliente.',
  array['cliente','registrar cliente','nuevo cliente','cargar cliente'],
  '{}',
  '/clientes',
  array['ir_clientes'],
  'publicado'
),
(
  'Cómo agregar un repuesto utilizado en una reparación',
  'como-agregar-repuesto-utilizado',
  'servicio_tecnico',
  'Cuando marcás una reparación como "Listo para entregar", el sistema te pregunta obligatoriamente si se usó un repuesto — no se puede saltear este paso.
1. "Sí, del stock": elegís el repuesto de la lista y se descuenta automáticamente del stock de repuestos, con su costo.
2. "Sí, pendiente de cargar": marca la reparación con "Costo pendiente" para que la cargues más tarde (por ejemplo, un repuesto que todavía no compraste).
3. "No usó repuesto": si fue solo mano de obra, sin repuesto.
Esto existe para que la ganancia real del taller en Estadísticas sea correcta — una reparación sin esta respuesta no cuenta bien su costo.',
  array['repuesto','costo pendiente','servicio tecnico','listo para entregar','se usó repuesto'],
  '{}',
  '/servicio-tecnico',
  array['ir_servicio_tecnico'],
  'publicado'
),
(
  'Dónde ver las estadísticas del negocio',
  'donde-ver-estadisticas',
  'estadisticas',
  'Las estadísticas están en la sección Estadísticas ("Analítica del negocio"), con pestañas por tema (Resumen y otras según lo que tenga activado tu negocio).
Ahí ves ventas netas, ganancia bruta, dinero ingresado, saldo por cobrar, rankings de vendedores/técnicos/productos y más, con filtros de período y comparación contra el período anterior.
Si no ves los números de costo/ganancia, puede ser que tu usuario no tenga el permiso "Ver costos" habilitado — eso lo configura quien administra el negocio en Configuración.',
  array['estadisticas','analitica','ganancia','ventas netas','reportes'],
  '{}',
  '/estadisticas',
  array['ir_estadisticas'],
  'publicado'
),
(
  'Cómo configurar las comisiones',
  'como-configurar-comisiones',
  'comisiones',
  'Primero activá las comisiones en Configuración → Comisiones y poné los porcentajes básicos (por ejemplo, un % distinto para venta minorista y mayorista).
Si necesitás un porcentaje distinto para algo puntual (una categoría, un producto o una marca), entrá a "Reglas de comisión" (se accede desde Configuración → Comisiones) y tocá "Agregar regla". Cuando una venta encaja en varias reglas, se aplica siempre la más específica: un producto puntual gana sobre una categoría, y una categoría gana sobre la regla general.
Las comisiones generadas se ven y se liquidan desde la sección Comisiones.',
  array['comisiones','porcentaje comision','reglas de comision','vendedor comision'],
  array['administrador'],
  '/configuracion/comisiones',
  array['ir_configuracion_comisiones'],
  'publicado'
),
(
  'Cómo imprimir o descargar una boleta',
  'como-imprimir-boleta',
  'ventas',
  'Entrá a la orden (desde Órdenes, tocando la venta que buscás) y abrí su boleta.
Ahí tenés el botón "Imprimir" para imprimirla o guardarla como PDF desde el diálogo de impresión del navegador.
Si tu negocio tiene habilitado el envío, también podés mandarla por WhatsApp directamente desde la misma pantalla, con el link público de la boleta incluido para que el cliente la vea y la guarde desde su celular.',
  array['boleta','imprimir boleta','descargar boleta','comprobante','whatsapp boleta'],
  '{}',
  '/ordenes',
  array['ir_ordenes'],
  'publicado'
),
(
  'Cómo modificar los datos de mi negocio',
  'como-modificar-datos-negocio',
  'configuracion',
  'Andá a Configuración → "Datos del negocio".
Ahí podés editar nombre, logo, moneda principal (y una segunda moneda si querés mostrar precios en ambas), datos de contacto y otros textos que aparecen en tus boletas (por ejemplo, la declaración/garantía impresa).
Guardá los cambios con el botón "Guardar cambios" al final de la pantalla. Solo quien administra el negocio puede editar esta sección.',
  array['configuracion','datos del negocio','moneda','logo','nombre del negocio'],
  array['administrador'],
  '/configuracion/negocio',
  array['ir_configuracion_negocio'],
  'publicado'
)
on conflict (slug) do nothing;

-- El superadmin habilita/deshabilita Qovi por negocio (rollout controlado,
-- "sección experimental" primero) y opcionalmente le pone un límite diario
-- propio. Security definer porque el superadmin no es parte de ese negocio
-- (negocio_actual() de ÉL no matchea el negocio que está configurando), así
-- que la política normal de qovi_configuracion no le alcanzaría para esto.
create or replace function admin_qovi_configurar(p_negocio_id uuid, p_habilitado boolean, p_limite_diario int default null)
returns qovi_configuracion
language plpgsql
security definer
as $$
declare
  v_fila qovi_configuracion;
begin
  if not es_admin() then
    raise exception 'No autorizado';
  end if;
  insert into qovi_configuracion (negocio_id, habilitado, limite_diario, actualizado_en)
  values (p_negocio_id, p_habilitado, p_limite_diario, now())
  on conflict (negocio_id) do update
    set habilitado = excluded.habilitado,
        limite_diario = excluded.limite_diario,
        actualizado_en = now()
  returning * into v_fila;
  return v_fila;
end;
$$;

-- Lista para el panel de superadmin: qué negocios ya tienen fila de
-- configuración (y si están habilitados) — los que no aparecen acá todavía
-- no se tocaron, cuentan como deshabilitados por default.
create or replace function admin_qovi_listar_configuraciones()
returns table (negocio_id uuid, habilitado boolean, limite_diario int)
language sql
security definer
stable
as $$
  select negocio_id, habilitado, limite_diario from qovi_configuracion where es_admin();
$$;
