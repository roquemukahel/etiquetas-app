'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { simboloMoneda } from '../../lib/monedas';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { registrarAuditoria } from '../../lib/auditoria';
import { LABEL_TIPO_CALCULO } from '../../lib/comisiones/tipos';
import type { TipoCalculo, AlcanceRegla } from '../../lib/comisiones/motor';
import { useT } from '../../lib/idioma';
import { falla } from '../../lib/escritura';
import { obtenerTodasLasFilas } from '../../lib/db';
import { obtenerCategorias, type Categoria } from '../../lib/categorias';
import { etiquetaCategoria, opcionesDeCategoria } from '../../lib/subcategorias';
import { soportaMigracion } from '../../lib/migraciones';
import { productosSinCategoria } from '../../lib/comisiones/sinCategoria';

type Regla = {
  id: string;
  tipo_calculo: TipoCalculo;
  valor: number;
  alcance: AlcanceRegla;
  tipo_item: string | null;
  producto_id: string | null;
  categoria_id?: string | null;
  marca?: string | null;
};
type Producto = { id: string; nombre: string };

const TIPO_ITEM_LABEL: Record<string, string> = {
  dispositivo: 'los dispositivos (celulares)',
  producto: 'los accesorios',
  trabajo: 'los trabajos / servicios',
};

function describirRegla(r: Regla, moneda: string, productos: Producto[], categorias: Categoria[], t: (texto: string) => string): string {
  const categoria = r.categoria_id ? etiquetaCategoria(r.categoria_id, categorias) : '';
  const donde =
    r.alcance === 'todas' ? t('todas las ventas')
    : r.alcance === 'minorista' ? t('las ventas minoristas')
    : r.alcance === 'mayorista' ? t('las ventas mayoristas')
    : r.alcance === 'contado' ? t('las ventas de contado')
    : r.alcance === 'financiado' ? t('las ventas financiadas (en cuotas)')
    : r.alcance === 'tipo_item' ? t(TIPO_ITEM_LABEL[r.tipo_item || ''] ?? 'un tipo de ítem')
    : r.alcance === 'categoria' ? `${t('la categoría')} ${categoria || t('(categoría eliminada)')}${r.marca ? ` · ${t('marca')} ${r.marca}` : ''}`
    : `${t('el producto')} ${productos.find((p) => p.id === r.producto_id)?.nombre ?? ''}`.trim();

  if (r.tipo_calculo === 'porcentaje_venta') return `${r.valor}% ${t('sobre la venta de')} ${donde}`;
  if (r.tipo_calculo === 'porcentaje_ganancia') return `${r.valor}% ${t('sobre la ganancia de')} ${donde}`;
  if (r.tipo_calculo === 'fijo_por_unidad') return `${moneda}${r.valor} ${t('por unidad')} (${donde})`;
  return `${moneda}${r.valor} ${t('por venta')} (${donde})`;
}

export default function PlanesComisiones() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puede = tienePermiso(actor, 'gestionar_comisiones');

  const [planId, setPlanId] = useState<string | null>(null);
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [marcas, setMarcas] = useState<string[]>([]);
  // Si el negocio corrió comisiones_categoria_supabase.sql: sin eso no se ofrece "Una categoría".
  const [conCategorias, setConCategorias] = useState(false);
  const [sinCategoria, setSinCategoria] = useState(0);
  const [moneda, setMoneda] = useState('$');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Form nueva regla
  const [alcance, setAlcance] = useState<AlcanceRegla>('categoria');
  const [tipoItem, setTipoItem] = useState('dispositivo');
  const [productoId, setProductoId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [marca, setMarca] = useState('');
  const [tipoCalculo, setTipoCalculo] = useState<TipoCalculo>('porcentaje_venta');
  const [valor, setValor] = useState('');

  const cargar = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setLoading(false);
    const soportado = await soportaMigracion(supabase, 'comisionesCategoria');
    setConCategorias(soportado);
    if (!soportado) setAlcance((a) => (a === 'categoria' ? 'tipo_item' : a));
    const { data: perfil } = await supabase.from('perfiles').select('negocios ( moneda, comision_plan_default_id )').eq('id', user.id).single();
    const neg = (perfil as any)?.negocios;
    if (neg?.moneda) setMoneda(simboloMoneda(neg.moneda));
    const pid = neg?.comision_plan_default_id ?? null;
    setPlanId(pid);
    if (pid) {
      const { data: rg } = await supabase
        .from('comision_reglas')
        .select('id, tipo_calculo, valor, alcance, tipo_item, producto_id' + (soportado ? ', categoria_id, marca' : ''))
        .eq('plan_id', pid)
        .eq('activo', true)
        .order('created_at');
      setReglas((rg as any) ?? []);
    }
    const prod = await obtenerTodasLasFilas<any>(supabase, 'productos', 'id, nombre, marca', [{ columna: 'nombre' }]);
    setProductos(prod.map((p: any) => ({ id: p.id, nombre: p.nombre })));
    setMarcas(Array.from(new Set(prod.map((p: any) => (p.marca ?? '').trim()).filter(Boolean))).sort((a: any, b: any) => a.localeCompare(b, 'es')) as string[]);
    setCategorias(await obtenerCategorias(supabase, true));
    setSinCategoria((await productosSinCategoria(supabase)).total);
    setLoading(false);
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  const opcionesCategoria = useMemo(() => opcionesDeCategoria(categorias.filter((c) => !c.archivada)), [categorias]);

  const subirVersion = async (pid: string) => {
    const { data: pl } = await supabase.from('comision_planes').select('version').eq('id', pid).single();
    await supabase.from('comision_planes').update({ version: ((pl?.version as number) || 1) + 1 }).eq('id', pid);
  };

  const agregar = async () => {
    if (!planId || !puede) return;
    const v = Number(valor.replace(',', '.'));
    if (!v || v <= 0) return setError(t('Ingresá un valor válido.'));
    if (alcance === 'producto' && !productoId) return setError(t('Elegí un producto.'));
    if (alcance === 'categoria' && !categoriaId) return setError(t('Elegí una categoría.'));
    if (alcance === 'categoria' && reglas.some((r) => r.alcance === 'categoria' && r.categoria_id === categoriaId && (r.marca ?? '') === marca)) {
      return setError(t('Ya hay una regla para esa categoría. Eliminala primero si querés cambiarla.'));
    }
    setGuardando(true);
    setError(null);
    const { error: e } = await supabase.from('comision_reglas').insert({
      plan_id: planId,
      tipo_calculo: tipoCalculo,
      valor: v,
      alcance,
      tipo_item: alcance === 'tipo_item' ? tipoItem : null,
      producto_id: alcance === 'producto' ? productoId : null,
      ...(alcance === 'categoria' ? { categoria_id: categoriaId, marca: marca || null } : {}),
    });
    if (e) { setError(e.message); setGuardando(false); return; }
    await subirVersion(planId);
    const detalle = alcance === 'categoria' ? `${alcance} "${etiquetaCategoria(categoriaId, categorias)}"${marca ? ` marca ${marca}` : ''}` : alcance;
    await registrarAuditoria(supabase, { accion: `agregó una regla de comisión (${tipoCalculo} ${v} · ${detalle})`, entidad: 'comision_regla' });
    setValor('');
    setGuardando(false);
    cargar();
  };

  const eliminar = async (id: string) => {
    if (!planId || !puede) return;
    if (!confirm(t('¿Eliminar esta regla? Las comisiones ya generadas no cambian.'))) return;
    if (await falla(supabase.from('comision_reglas').update({ activo: false }).eq('id', id), t, 'eliminar regla de comisión')) return;
    await subirVersion(planId);
    await registrarAuditoria(supabase, { accion: 'eliminó una regla de comisión', entidad: 'comision_regla', entidadId: id });
    cargar();
  };

  if (!loading && !puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para configurar reglas.')}</p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">{t('Volver')}</Link>
      </main>
    );
  }

  const hayReglasPorCategoria = reglas.some((r) => r.alcance === 'categoria');

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-2xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/configuracion/comisiones" className="text-2xl leading-none">&larr;</Link>
        <span className="text-lg font-medium">{t('Reglas de comisión')}</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>
      ) : !planId ? (
        <div className="rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 text-center flex flex-col items-center gap-2">
          <p className="text-sm">{t('Primero activá las comisiones y poné los porcentajes básicos.')}</p>
          <Link href="/configuracion/comisiones" className="rounded-xl bg-accent dark:bg-dark-accent text-white px-4 py-2 text-xs font-medium">{t('Ir a configuración')}</Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted dark:text-dark-text-secondary">
            {t('Podés tener una comisión distinta según lo que se venda. Cuando una venta encaja en varias reglas, se aplica la')}{' '}
            <strong>{t('más específica')}</strong>: {t('un producto puntual gana sobre una categoría, una categoría gana sobre un tipo de ítem, y un tipo de ítem gana sobre la regla general de minorista/mayorista.')}
          </p>
          {conCategorias && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              {t('Entre categorías: una subcategoría gana sobre su categoría, y una regla con marca gana sobre la misma categoría sin marca.')}
            </p>
          )}

          {conCategorias && hayReglasPorCategoria && sinCategoria > 0 && (
            <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm flex flex-col gap-1">
              <p>
                ⚠️ {sinCategoria} {sinCategoria === 1 ? t('producto no tiene categoría') : t('productos no tienen categoría')} {t('y no entran en las reglas por categoría (se les aplica la del tipo de ítem o la general).')}
              </p>
              <Link href="/productos?sinCategoria=1" className="text-accent dark:text-dark-accent underline text-xs">
                {t('Verlos y asignarles una categoría')} →
              </Link>
            </div>
          )}

          {/* Reglas actuales */}
          <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card divide-y divide-border dark:divide-dark-border">
            {reglas.length === 0 ? (
              <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-6">{t('Sin reglas todavía.')}</p>
            ) : (
              reglas.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <p className="text-sm flex-1">{describirRegla(r, moneda, productos, categorias, t)}</p>
                  <button onClick={() => eliminar(r.id)} className="text-xs text-bad hover:underline shrink-0">{t('Eliminar')}</button>
                </div>
              ))
            )}
          </div>

          {/* Nueva regla */}
          <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-4 flex flex-col gap-3">
            <p className="text-sm font-semibold">{t('Agregar una regla')}</p>

            <label className="text-xs text-muted dark:text-dark-text-secondary">{t('Se aplica a')}</label>
            <select value={alcance} onChange={(e) => setAlcance(e.target.value as AlcanceRegla)} className="bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm">
              <option value="producto">{t('Un producto puntual del catálogo')}</option>
              {conCategorias && <option value="categoria">{t('Una categoría (o subcategoría) de productos')}</option>}
              <option value="tipo_item">{t('Un tipo de ítem (dispositivos / accesorios / trabajos)')}</option>
              <option value="minorista">{t('Todas las ventas minoristas')}</option>
              <option value="mayorista">{t('Todas las ventas mayoristas')}</option>
              <option value="contado">{t('Todas las ventas de contado')}</option>
              <option value="financiado">{t('Todas las ventas financiadas (en cuotas)')}</option>
              <option value="todas">{t('Todas las ventas')}</option>
            </select>

            {alcance === 'tipo_item' && (
              <select value={tipoItem} onChange={(e) => setTipoItem(e.target.value)} className="bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm">
                <option value="dispositivo">{t('Dispositivos (celulares)')}</option>
                <option value="producto">{t('Accesorios')}</option>
                <option value="trabajo">{t('Trabajos / servicios')}</option>
              </select>
            )}
            {alcance === 'producto' && (
              <select value={productoId} onChange={(e) => setProductoId(e.target.value)} className="bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm">
                <option value="">{t('Elegí un producto…')}</option>
                {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            )}
            {alcance === 'categoria' && (
              <>
                <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm">
                  <option value="">{t('Elegí una categoría…')}</option>
                  {opcionesCategoria.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
                </select>
                {marcas.length > 0 && (
                  <select value={marca} onChange={(e) => setMarca(e.target.value)} className="bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm">
                    <option value="">{t('Todas las marcas')}</option>
                    {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
                <p className="text-[11px] text-muted dark:text-dark-text-secondary">
                  {t('Una regla de una categoría alcanza también a sus subcategorías. La marca es opcional y se toma de los productos del catálogo.')}
                </p>
              </>
            )}

            <label className="text-xs text-muted dark:text-dark-text-secondary">{t('Cómo se calcula')}</label>
            <select value={tipoCalculo} onChange={(e) => setTipoCalculo(e.target.value as TipoCalculo)} className="bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm">
              {(Object.keys(LABEL_TIPO_CALCULO) as TipoCalculo[]).map((tc) => (
                <option key={tc} value={tc}>{t(LABEL_TIPO_CALCULO[tc])}</option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <input value={valor} onChange={(e) => setValor(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder={tipoCalculo.startsWith('porcentaje') ? t('Porcentaje') : t('Monto')} className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm" />
              <span className="text-sm text-muted dark:text-dark-text-secondary">{tipoCalculo.startsWith('porcentaje') ? '%' : moneda}</span>
            </div>

            <button disabled={guardando} onClick={agregar} className="rounded-xl bg-accent dark:bg-dark-accent text-white py-2.5 text-sm font-medium disabled:opacity-40">
              {guardando ? t('Guardando...') : t('Agregar regla')}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
