'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { MONEDAS } from '../../lib/monedas';
import { PAISES } from '../../lib/paises';
import { MARCAS_DISPONIBLES, CATALOGO_MODELOS, normalizarNombreModelo } from '../../lib/catalogosMarcas';
import { registrarAuditoria } from '../../lib/auditoria';
import { useT } from '../../lib/idioma';

type Negocio = {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  eslogan: string | null;
  logo_url: string | null;
  texto_garantia: string | null;
  texto_garantia_servicio: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  mostrar_instagram: boolean;
  mostrar_facebook: boolean;
  mostrar_tiktok: boolean;
  moneda: string;
  monedas_habilitadas: string[];
  tipo_cambio: number | null;
  marcas_stock: string[];
  pais: string;
  texto_declaracion_compra: string | null;
  texto_declaracion_proveedor: string | null;
  texto_declaracion_plan_ahorro: string | null;
  texto_garantia_tamano: number;
  texto_garantia_servicio_tamano: number;
  texto_declaracion_compra_tamano: number;
  texto_declaracion_proveedor_tamano: number;
  texto_declaracion_plan_ahorro_tamano: number;
  garantia_dias: number | null;
};

const TAMANOS = [9, 10, 11, 12, 13, 14];

export default function DatosNegocio() {
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const t = useT();

  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Destildar una marca con catálogo borra sus carpetas + los equipos adentro:
  // por lo destructivo, se confirma en un cartel que muestra cuánto se va a borrar.
  const [marcaAEliminar, setMarcaAEliminar] = useState<{ id: string; nombre: string; carpetas: string[]; equipos: number } | null>(null);
  const [procesandoMarca, setProcesandoMarca] = useState(false);
  const [errorMarca, setErrorMarca] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase
        .from('perfiles')
        .select(
          'negocio_id, negocios ( id, nombre, telefono, direccion, eslogan, logo_url, texto_garantia, texto_garantia_servicio, instagram, facebook, tiktok, mostrar_instagram, mostrar_facebook, mostrar_tiktok, moneda, monedas_habilitadas, tipo_cambio, marcas_stock, pais, texto_declaracion_compra, texto_declaracion_proveedor, texto_declaracion_plan_ahorro, texto_garantia_tamano, texto_garantia_servicio_tamano, texto_declaracion_compra_tamano, texto_declaracion_proveedor_tamano, texto_declaracion_plan_ahorro_tamano, garantia_dias )'
        )
        .eq('id', user.id)
        .single();
      setNegocio((perfil as any)?.negocios ?? null);
      setLoading(false);
    })();
  }, []);

  const campo = (k: keyof Negocio, v: string) => setNegocio((prev) => (prev ? { ...prev, [k]: v } : prev));
  const campoBool = (k: keyof Negocio, v: boolean) => setNegocio((prev) => (prev ? { ...prev, [k]: v } : prev));
  const campoNum = (k: keyof Negocio, v: number) => setNegocio((prev) => (prev ? { ...prev, [k]: v } : prev));

  const toggleMoneda = (codigo: string) => {
    setNegocio((prev) => {
      if (!prev) return prev;
      const yaEsta = prev.monedas_habilitadas.includes(codigo);
      if (yaEsta) {
        if (prev.monedas_habilitadas.length <= 1) return prev; // siempre tiene que quedar al menos una
        const nuevas = prev.monedas_habilitadas.filter((m) => m !== codigo);
        return { ...prev, monedas_habilitadas: nuevas, moneda: nuevas[0] };
      }
      if (prev.monedas_habilitadas.length >= 2) return prev; // máximo 2
      return { ...prev, monedas_habilitadas: [...prev.monedas_habilitadas, codigo] };
    });
  };

  const toggleMarca = (id: string) => {
    if (!negocio) return;
    const yaElegida = negocio.marcas_stock.includes(id);
    const tieneCatalogo = !!CATALOGO_MODELOS[id];
    // Destildar una marca CON catálogo es destructivo (borra carpetas + equipos):
    // se pide confirmación en un cartel. El resto (tildar, o destildar "Otras
    // marcas" que no tiene catálogo) es un toggle simple sin borrar nada.
    if (yaElegida && tieneCatalogo) {
      pedirDesactivarMarca(id);
      return;
    }
    setNegocio((prev) =>
      prev
        ? {
            ...prev,
            marcas_stock: yaElegida ? prev.marcas_stock.filter((m) => m !== id) : [...prev.marcas_stock, id],
          }
        : prev
    );
  };

  // Junta cuánto se borraría al desactivar la marca y abre el cartel de confirmación.
  const pedirDesactivarMarca = async (id: string) => {
    const catalogo = CATALOGO_MODELOS[id] || [];
    setErrorMarca(null);
    const [{ data: mods }, { count }] = await Promise.all([
      supabase.from('modelos_stock').select('nombre').in('nombre', catalogo),
      supabase.from('dispositivos').select('id', { count: 'exact', head: true }).in('modelo', catalogo),
    ]);
    const carpetas = (mods ?? []).map((m) => m.nombre);
    const nombre = MARCAS_DISPONIBLES.find((m) => m.id === id)?.nombre ?? id;
    setMarcaAEliminar({ id, nombre, carpetas, equipos: count ?? 0 });
  };

  const confirmarDesactivarMarca = async () => {
    if (!marcaAEliminar || !negocio) return;
    const { id } = marcaAEliminar;
    const catalogo = CATALOGO_MODELOS[id] || [];
    setProcesandoMarca(true);
    setErrorMarca(null);

    // 1) Borrar los equipos de esos modelos (RLS los limita a este negocio).
    const { error: errDisp } = await supabase.from('dispositivos').delete().in('modelo', catalogo);
    if (errDisp) {
      // Puede pasar si algún equipo ya fue vendido (queda referenciado por una
      // orden). Mostramos el motivo real en vez de fallar en silencio.
      setErrorMarca(t('No se pudieron borrar los equipos:') + ' ' + errDisp.message);
      setProcesandoMarca(false);
      return;
    }
    // 2) Borrar las carpetas de esos modelos.
    const { error: errMod } = await supabase.from('modelos_stock').delete().in('nombre', catalogo);
    if (errMod) {
      setErrorMarca(t('No se pudieron borrar las carpetas:') + ' ' + errMod.message);
      setProcesandoMarca(false);
      return;
    }
    // 3) Quitar la marca del negocio (se persiste ya, sin depender de "Guardar").
    const nuevasMarcas = negocio.marcas_stock.filter((m) => m !== id);
    const { error: errNeg } = await supabase.from('negocios').update({ marcas_stock: nuevasMarcas }).eq('id', negocio.id);
    if (errNeg) {
      setErrorMarca(t('No se pudo actualizar el negocio:') + ' ' + errNeg.message);
      setProcesandoMarca(false);
      return;
    }
    setNegocio((prev) => (prev ? { ...prev, marcas_stock: nuevasMarcas } : prev));
    await registrarAuditoria(supabase, {
      accion: `eliminó la marca ${marcaAEliminar.nombre} del negocio (y sus carpetas y equipos)`,
      entidad: 'marca',
      entidadId: id,
      valorAnterior: { marca: id, nombre: marcaAEliminar.nombre, carpetas: marcaAEliminar.carpetas, equipos: marcaAEliminar.equipos },
    });
    setProcesandoMarca(false);
    setMarcaAEliminar(null);
  };

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => campo('logo_url', reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleGuardar = async () => {
    if (!negocio) return;
    setGuardando(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('negocios')
      .update({
        nombre: negocio.nombre.trim(),
        telefono: negocio.telefono?.trim() || null,
        direccion: negocio.direccion?.trim() || null,
        eslogan: negocio.eslogan?.trim() || null,
        logo_url: negocio.logo_url || null,
        texto_garantia: negocio.texto_garantia?.trim() || null,
        texto_garantia_servicio: negocio.texto_garantia_servicio?.trim() || null,
        instagram: negocio.instagram?.trim() || null,
        facebook: negocio.facebook?.trim() || null,
        tiktok: negocio.tiktok?.trim() || null,
        mostrar_instagram: negocio.mostrar_instagram,
        mostrar_facebook: negocio.mostrar_facebook,
        mostrar_tiktok: negocio.mostrar_tiktok,
        moneda: negocio.monedas_habilitadas[0] || negocio.moneda,
        monedas_habilitadas: negocio.monedas_habilitadas,
        tipo_cambio: negocio.tipo_cambio,
        marcas_stock: negocio.marcas_stock,
        pais: negocio.pais,
        texto_declaracion_compra: negocio.texto_declaracion_compra?.trim() || null,
        texto_declaracion_proveedor: negocio.texto_declaracion_proveedor?.trim() || null,
        texto_declaracion_plan_ahorro: negocio.texto_declaracion_plan_ahorro?.trim() || null,
        texto_garantia_tamano: negocio.texto_garantia_tamano,
        texto_garantia_servicio_tamano: negocio.texto_garantia_servicio_tamano,
        texto_declaracion_compra_tamano: negocio.texto_declaracion_compra_tamano,
        texto_declaracion_proveedor_tamano: negocio.texto_declaracion_proveedor_tamano,
        texto_declaracion_plan_ahorro_tamano: negocio.texto_declaracion_plan_ahorro_tamano,
        garantia_dias: negocio.garantia_dias || null,
      })
      .eq('id', negocio.id);

    if (updateError) {
      setError(t('No pudimos guardar:') + ' ' + updateError.message);
      setGuardando(false);
      return;
    }

    const { data: existentes } = await supabase.from('modelos_stock').select('nombre');
    const nombresExistentes = new Set((existentes ?? []).map((m) => normalizarNombreModelo(m.nombre)));
    const nuevasCarpetas: string[] = [];
    for (const marcaId of negocio.marcas_stock) {
      const catalogo = CATALOGO_MODELOS[marcaId];
      if (!catalogo) continue;
      for (const modelo of catalogo) {
        if (!nombresExistentes.has(normalizarNombreModelo(modelo))) {
          nombresExistentes.add(normalizarNombreModelo(modelo));
          nuevasCarpetas.push(modelo);
        }
      }
    }
    if (nuevasCarpetas.length > 0) {
      await supabase.from('modelos_stock').insert(nuevasCarpetas.map((nombre) => ({ nombre })));
    }

    router.push('/configuracion');
    router.refresh();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>
      </main>
    );
  }

  if (!negocio) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No encontramos tu negocio.')}</p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Datos del negocio')}</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Logo')}</label>
          <div className="flex items-center gap-3">
            {negocio.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={negocio.logo_url} alt={t('Logo')} className="h-14 w-14 rounded-lg object-contain bg-white dark:bg-dark-surface border border-border dark:border-dark-border" />
            )}
            <label className="text-sm text-accent dark:text-dark-accent underline cursor-pointer">
              {negocio.logo_url ? t('Cambiar logo') : t('Subir logo')}
              <input type="file" accept="image/*" className="hidden" onChange={handleLogo} />
            </label>
          </div>
        </div>

        <Campo label={t('Nombre del negocio')} valor={negocio.nombre} onChange={(v) => campo('nombre', v)} />
        <Campo
          label={t('Eslogan del negocio (opcional — aparece en la boleta, junto a tu logo)')}
          valor={negocio.eslogan ?? ''}
          onChange={(v) => campo('eslogan', v)}
        />
        <Campo label={t('Teléfono')} valor={negocio.telefono ?? ''} onChange={(v) => campo('telefono', v)} />
        <Campo label={t('Dirección')} valor={negocio.direccion ?? ''} onChange={(v) => campo('direccion', v)} />

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
            {t('Monedas con las que trabajás (elegí hasta 2)')}
          </label>
          <p className="text-xs text-muted dark:text-dark-text-secondary mb-2">
            {t('La primera es tu moneda principal: en ella se hacen todas las boletas y se calculan las Estadísticas.')}
            {negocio.monedas_habilitadas.length === 2
              ? ` ${t('Si habilitás una segunda, vas a poder mostrar también en la boleta un monto aproximado en esa moneda, solo informativo para el cliente (nunca se suma en Estadísticas).')}`
              : ` ${t('Podés habilitar una segunda moneda para mostrar un monto aproximado informativo en la boleta.')}`}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {MONEDAS.map((m) => {
              const elegida = negocio.monedas_habilitadas.includes(m.codigo);
              const deshabilitado = !elegida && negocio.monedas_habilitadas.length >= 2;
              return (
                <label
                  key={m.codigo}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${
                    elegida
                      ? 'border-accent dark:border-dark-accent bg-accent-soft dark:bg-dark-accent-soft'
                      : 'border-border dark:border-dark-border'
                  } ${deshabilitado ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={elegida}
                    disabled={deshabilitado}
                    onChange={() => toggleMoneda(m.codigo)}
                    className="h-4 w-4 accent-ink shrink-0"
                  />
                  <span>
                    {m.nombre} ({m.simbolo})
                  </span>
                </label>
              );
            })}
          </div>

          {negocio.monedas_habilitadas.length === 2 && (
            <div className="mt-2">
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
                {t('Tipo de cambio:')} 1 {negocio.monedas_habilitadas[0]} ={' '}
                <input
                  value={negocio.tipo_cambio?.toString() ?? ''}
                  onChange={(e) => campoNum('tipo_cambio', e.target.value ? Number(e.target.value) : (null as any))}
                  inputMode="numeric"
                  placeholder={t('ej. 1000')}
                  className="inline-block w-28 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1 text-sm ml-1"
                />{' '}
                {negocio.monedas_habilitadas[1]}
              </label>
              <p className="text-xs text-muted dark:text-dark-text-secondary">
                {t('Se usa para calcular el monto informativo sugerido al crear una orden (siempre editable en el momento).')}
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
            {t('País (se usa para armar bien los links de WhatsApp con el código de área correcto)')}
          </label>
          <select
            value={negocio.pais}
            onChange={(e) => campo('pais', e.target.value)}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          >
            {PAISES.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nombre} (+{p.llamada})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
            {t('Días de garantía (opcional — al vender un dispositivo se calcula solo la fecha de vencimiento)')}
          </label>
          <input
            value={negocio.garantia_dias?.toString() ?? ''}
            onChange={(e) => campoNum('garantia_dias', e.target.value ? Number(e.target.value) : (null as any))}
            inputMode="numeric"
            placeholder={t('Ej. 90')}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
            {t('Marcas que vendés (crea carpetas de Stock automáticamente)')}
          </label>
          <p className="text-xs text-muted dark:text-dark-text-secondary mb-2">
            {t('Al tildar una marca con catálogo (iPhone, Samsung, Xiaomi) y guardar, se crean solas las carpetas de Stock de cada modelo, con el nombre ya escrito bien y parejo — así no tenés que cargarlas una por una ni terminás con carpetas repetidas por una mayúscula o un espacio de más. Si')} <span className="font-medium">{t('destildás')}</span> {t('una marca, te vamos a preguntar si querés borrar sus carpetas y los equipos que tengan cargados adentro (útil si activaste una marca por error). "Otras marcas" es para cuando vendés algo que no está en las listas (por ejemplo, accesorios o consolas): esas seguís creándolas vos desde Stock')} &gt; {t('Carpetas.')}
          </p>
          <div className="flex flex-col gap-2">
            {MARCAS_DISPONIBLES.map((m) => {
              const elegida = negocio.marcas_stock.includes(m.id);
              return (
                <label
                  key={m.id}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm cursor-pointer ${
                    elegida ? 'border-accent dark:border-dark-accent bg-accent-soft dark:bg-dark-accent-soft' : 'border-border dark:border-dark-border'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={elegida}
                    onChange={() => toggleMarca(m.id)}
                    className="h-5 w-5 accent-ink shrink-0"
                  />
                  <span className="font-medium">{m.nombre}</span>
                  {!CATALOGO_MODELOS[m.id] && (
                    <span className="text-xs text-muted dark:text-dark-text-secondary ml-auto">{t('sin catálogo')}</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        <TextoConTamano
          label={t('Garantía de productos (va en la boleta de venta)')}
          valor={negocio.texto_garantia ?? ''}
          onChange={(v) => campo('texto_garantia', v)}
          tamano={negocio.texto_garantia_tamano}
          onChangeTamano={(v) => campoNum('texto_garantia_tamano', v)}
        />

        <TextoConTamano
          label={t('Garantía de servicio técnico (va en la boleta cuando incluye un arreglo)')}
          valor={negocio.texto_garantia_servicio ?? ''}
          onChange={(v) => campo('texto_garantia_servicio', v)}
          tamano={negocio.texto_garantia_servicio_tamano}
          onChangeTamano={(v) => campoNum('texto_garantia_servicio_tamano', v)}
        />

        <TextoConTamano
          label={t('Declaración de compra (va en la boleta al comprarle un dispositivo a alguien)')}
          valor={negocio.texto_declaracion_compra ?? ''}
          onChange={(v) => campo('texto_declaracion_compra', v)}
          tamano={negocio.texto_declaracion_compra_tamano}
          onChangeTamano={(v) => campoNum('texto_declaracion_compra_tamano', v)}
          placeholder={t('Declaro que el dispositivo entregado es de mi propiedad, ha sido obtenido de buena fe y que soy responsable de la información brindada.')}
        />

        <TextoConTamano
          label={t('Términos y condiciones (va en el comprobante de pago/deuda de Proveedores)')}
          valor={negocio.texto_declaracion_proveedor ?? ''}
          onChange={(v) => campo('texto_declaracion_proveedor', v)}
          tamano={negocio.texto_declaracion_proveedor_tamano}
          onChangeTamano={(v) => campoNum('texto_declaracion_proveedor_tamano', v)}
          placeholder={t('Ej. plazos de pago acordados, condiciones de la deuda, etc.')}
        />

        <TextoConTamano
          label={t('Términos y condiciones (va en el comprobante de pago de Plan de ahorro)')}
          valor={negocio.texto_declaracion_plan_ahorro ?? ''}
          onChange={(v) => campo('texto_declaracion_plan_ahorro', v)}
          tamano={negocio.texto_declaracion_plan_ahorro_tamano}
          onChangeTamano={(v) => campoNum('texto_declaracion_plan_ahorro_tamano', v)}
          placeholder={t('Ej. condiciones del plan de ahorro, plazos, qué pasa si se cancela, etc.')}
        />

        <p className="text-xs text-muted dark:text-dark-text-secondary font-medium mt-2">{t('Redes sociales (opcional)')}</p>
        <RedSocial
          label="Instagram"
          valor={negocio.instagram ?? ''}
          onChange={(v) => campo('instagram', v)}
          mostrar={negocio.mostrar_instagram}
          onToggleMostrar={(v) => campoBool('mostrar_instagram', v)}
        />
        <RedSocial
          label="Facebook"
          valor={negocio.facebook ?? ''}
          onChange={(v) => campo('facebook', v)}
          mostrar={negocio.mostrar_facebook}
          onToggleMostrar={(v) => campoBool('mostrar_facebook', v)}
        />
        <RedSocial
          label="TikTok"
          valor={negocio.tiktok ?? ''}
          onChange={(v) => campo('tiktok', v)}
          mostrar={negocio.mostrar_tiktok}
          onToggleMostrar={(v) => campoBool('mostrar_tiktok', v)}
        />
      </div>

      <button
        disabled={guardando}
        onClick={handleGuardar}
        className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
      >
        {guardando ? t('Guardando...') : t('Guardar cambios')}
      </button>

      {marcaAEliminar && (
        <div className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-6" onClick={() => !procesandoMarca && setMarcaAEliminar(null)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border p-5 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-bad">{t('Desactivar')} {marcaAEliminar.nombre}</p>
            {marcaAEliminar.carpetas.length === 0 ? (
              <p className="text-sm text-muted dark:text-dark-text-secondary">
                {t('No hay carpetas de')} {marcaAEliminar.nombre} {t('cargadas. Se va a desactivar la marca sin borrar nada.')}
              </p>
            ) : (
              <p className="text-sm text-muted dark:text-dark-text-secondary">
                {t('Al desactivar esta marca se van a')} <span className="font-medium text-ink dark:text-dark-text">{t('eliminar')} {marcaAEliminar.carpetas.length} {marcaAEliminar.carpetas.length === 1 ? t('carpeta') : t('carpetas')}</span>
                {marcaAEliminar.equipos > 0 ? (
                  <>
                    {' '}{t('y los')} <span className="font-medium text-ink dark:text-dark-text">{marcaAEliminar.equipos} {marcaAEliminar.equipos === 1 ? t('equipo') : t('equipos')}</span> {t('que tienen cargados adentro')}
                  </>
                ) : null}
                . <span className="font-medium">{t('No se puede deshacer.')}</span>
              </p>
            )}

            {errorMarca && (
              <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2 break-words">{errorMarca}</p>
            )}

            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setMarcaAEliminar(null)}
                disabled={procesandoMarca}
                className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium disabled:opacity-40"
              >
                {t('Cancelar')}
              </button>
              <button
                onClick={confirmarDesactivarMarca}
                disabled={procesandoMarca}
                className="flex-1 rounded-lg bg-bad text-white py-2 text-sm font-medium disabled:opacity-40"
              >
                {procesandoMarca ? t('Borrando...') : marcaAEliminar.carpetas.length === 0 ? t('Desactivar') : t('Sí, borrar todo')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Campo({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />
    </div>
  );
}

function TextoConTamano({
  label,
  valor,
  onChange,
  tamano,
  onChangeTamano,
  placeholder,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  tamano: number;
  onChangeTamano: (v: number) => void;
  placeholder?: string;
}) {
  const t = useT();
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-muted dark:text-dark-text-secondary">{label}</label>
        <select
          value={tamano}
          onChange={(e) => onChangeTamano(Number(e.target.value))}
          className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1 text-xs shrink-0 ml-2"
        >
          {TAMANOS.map((tam) => (
            <option key={tam} value={tam}>
              {t('Letra')} {tam}px
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        placeholder={placeholder}
        style={{ fontSize: tamano }}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3"
      />
    </div>
  );
}

function RedSocial({
  label,
  valor,
  onChange,
  mostrar,
  onToggleMostrar,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  mostrar: boolean;
  onToggleMostrar: (v: boolean) => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
        <input
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('@usuario')}
          className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
        />
      </div>
      <label className="flex flex-col items-center gap-1 pt-4">
        <input
          type="checkbox"
          checked={mostrar}
          onChange={(e) => onToggleMostrar(e.target.checked)}
          className="h-5 w-5 accent-ink"
        />
        <span className="text-[10px] text-muted dark:text-dark-text-secondary">{t('en boleta')}</span>
      </label>
    </div>
  );
}
