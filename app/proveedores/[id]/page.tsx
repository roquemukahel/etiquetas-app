'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { sanitizarDecimal, formatearMonto } from '../../lib/numeros';
import { normalizarNombreModelo } from '../../lib/modelos';
import { medioLabel } from '../../lib/cuentaCorriente';
import SelectorColorAuto from '../../SelectorColorAuto';
import { hexColorDe } from '../../lib/coloresIphone';
import { useT } from '../../lib/idioma';

const STORAGE_OPTIONS = [64, 128, 256, 512];

type Proveedor = { id: string; nombre: string; telefono: string | null; detalles: string | null };
type CompraManual = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  cantidad: number;
  precio_unitario: number | null;
  detalles: string | null;
  created_at: string;
};
type DispositivoComprado = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  costo: number | null;
  created_at: string;
};
// Cuenta corriente con el proveedor: lo que el negocio le debe. cargo =
// aumenta la deuda; abono = le pagaste. El saldo se calcula, no se guarda.
type Movimiento = {
  id: string;
  tipo: string;
  concepto: string;
  monto: number;
  medio: string | null;
  observacion: string | null;
  fecha: string;
};

// Una sola lista para mostrar, mezclando las dos fuentes: lo cargado a
// mano acá (compras_proveedor) y lo que ya quedó vinculado solo al
// agregar un dispositivo al stock con este proveedor (dispositivos.costo).
type FilaCompra = {
  key: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  cantidad: number;
  precioUnitario: number | null;
  fecha: string;
  origen: 'manual' | 'stock';
  detalles: string | null;
  idManual: string | null;
};

export default function DetalleProveedor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puedeVer = tienePermiso(actor, 'ver_proveedores');
  const puedeEliminar = tienePermiso(actor, 'eliminar');

  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [compras, setCompras] = useState<CompraManual[]>([]);
  const [dispositivos, setDispositivos] = useState<DispositivoComprado[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cuenta corriente con el proveedor (lo que le debés)
  const [accionCta, setAccionCta] = useState<null | 'deuda' | 'pago'>(null);
  const [montoCta, setMontoCta] = useState('');
  const [medioCta, setMedioCta] = useState('efectivo');
  const [obsCta, setObsCta] = useState('');
  const [guardandoCta, setGuardandoCta] = useState(false);

  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [nombreEdit, setNombreEdit] = useState('');
  const [telefonoEdit, setTelefonoEdit] = useState('');
  const [detallesEdit, setDetallesEdit] = useState('');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  const [agregandoCompra, setAgregandoCompra] = useState(false);
  // Si es null, el formulario está en modo "cargar nueva"; si tiene un id,
  // está editando esa compra cargada a mano.
  const [compraEditandoId, setCompraEditandoId] = useState<string | null>(null);
  const [modelo, setModelo] = useState('');
  const [capacidad, setCapacidad] = useState<number | null>(null);
  const [color, setColor] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [precioUnitario, setPrecioUnitario] = useState('');
  const [detallesCompra, setDetallesCompra] = useState('');
  const [guardandoCompra, setGuardandoCompra] = useState(false);

  const cargar = async () => {
    const [{ data: prov }, { data: comprasData }, { data: dispData }, { data: movData, error: movError }] = await Promise.all([
      supabase.from('proveedores').select('id, nombre, telefono, detalles').eq('id', id).maybeSingle(),
      supabase
        .from('compras_proveedor')
        .select('id, modelo, capacidad_gb, color, cantidad, precio_unitario, detalles, created_at')
        .eq('proveedor_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('dispositivos')
        .select('id, modelo, capacidad_gb, color, costo, created_at')
        .eq('proveedor_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('proveedor_movimientos')
        .select('id, tipo, concepto, monto, medio, observacion, fecha')
        .eq('proveedor_id', id)
        .eq('anulado', false)
        .order('fecha', { ascending: false }),
    ]);
    setProveedor((prov as Proveedor) ?? null);
    setCompras((comprasData as CompraManual[]) ?? []);
    setDispositivos((dispData as DispositivoComprado[]) ?? []);
    // Si esta consulta falla, NO hay que mostrar el saldo como si fuera $0
    // real (podría en realidad tener una deuda) — mismo criterio que la
    // cuenta corriente de clientes.
    if (movError) {
      setError(t('No pudimos cargar los movimientos — el saldo de abajo puede no ser real. Recargá la página.'));
      setMovimientos([]);
    } else {
      setMovimientos((movData as Movimiento[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!puedeVer) {
      setLoading(false);
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, puedeVer]);

  const filas: FilaCompra[] = useMemo(() => {
    const deManual: FilaCompra[] = compras.map((c) => ({
      key: `m-${c.id}`,
      modelo: c.modelo,
      capacidad_gb: c.capacidad_gb,
      color: c.color,
      cantidad: c.cantidad,
      precioUnitario: c.precio_unitario,
      fecha: c.created_at,
      origen: 'manual',
      detalles: c.detalles,
      idManual: c.id,
    }));
    const deStock: FilaCompra[] = dispositivos.map((d) => ({
      key: `s-${d.id}`,
      modelo: d.modelo,
      capacidad_gb: d.capacidad_gb,
      color: d.color,
      cantidad: 1,
      precioUnitario: d.costo,
      fecha: d.created_at,
      origen: 'stock',
      detalles: null,
      idManual: null,
    }));
    return [...deManual, ...deStock].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [compras, dispositivos]);

  const totalGastado = filas.reduce((acc, f) => acc + (f.precioUnitario || 0) * f.cantidad, 0);
  const totalUnidades = filas.reduce((acc, f) => acc + f.cantidad, 0);

  // Saldo = Σ(deudas) − Σ(pagos). Positivo = le debés; negativo = saldo a favor.
  const saldo = useMemo(
    () => movimientos.reduce((acc, m) => acc + (m.tipo === 'cargo' ? m.monto : -m.monto), 0),
    [movimientos]
  );

  const registrarCta = async () => {
    if (!proveedor) return;
    const monto = Number(montoCta);
    if (!monto || monto <= 0) {
      setError(t('Poné un monto válido'));
      return;
    }
    setGuardandoCta(true);
    setError(null);
    const esPago = accionCta === 'pago';
    const { data: nuevoMov, error: dbError } = await supabase
      .from('proveedor_movimientos')
      .insert({
        proveedor_id: proveedor.id,
        tipo: esPago ? 'abono' : 'cargo',
        concepto: esPago ? 'pago' : 'deuda',
        monto,
        medio: esPago ? medioCta : null,
        observacion: obsCta.trim() || null,
        registrado_por_nombre: actor?.nombre ?? null,
        registrado_por_foto_url: actor?.fotoUrl ?? null,
      })
      .select('id')
      .single();
    if (dbError) {
      setError(t('No pudimos guardar el movimiento:') + ' ' + dbError.message);
      setGuardandoCta(false);
      return;
    }
    setGuardandoCta(false);
    setAccionCta(null);
    setMontoCta('');
    setObsCta('');
    setMedioCta('efectivo');
    // Se abre directo el comprobante para imprimirlo o mandarlo — es lo que
    // pidió el usuario: un comprobante del pago/deuda recién generado.
    if (nuevoMov?.id) {
      router.push(`/proveedores/${proveedor.id}/comprobante/${nuevoMov.id}`);
      return;
    }
    cargar();
  };

  const anularMovimiento = async (movId: string) => {
    if (!confirm(t('¿Anular este movimiento? Deja de contar para el saldo.'))) return;
    await supabase.from('proveedor_movimientos').update({ anulado: true }).eq('id', movId);
    cargar();
  };

  const abrirEdicionPerfil = () => {
    if (!proveedor) return;
    setNombreEdit(proveedor.nombre);
    setTelefonoEdit(proveedor.telefono ?? '');
    setDetallesEdit(proveedor.detalles ?? '');
    setEditandoPerfil(true);
  };

  const guardarPerfil = async () => {
    if (!proveedor || !nombreEdit.trim()) {
      setError(t('El nombre no puede quedar vacío'));
      return;
    }
    setGuardandoPerfil(true);
    await supabase
      .from('proveedores')
      .update({ nombre: nombreEdit.trim(), telefono: telefonoEdit.trim() || null, detalles: detallesEdit.trim() || null })
      .eq('id', proveedor.id);
    setGuardandoPerfil(false);
    setEditandoPerfil(false);
    cargar();
  };

  const eliminarProveedor = async () => {
    if (!proveedor || !puedeEliminar) return;
    if (
      !confirm(
        `${t('¿Eliminar a')} "${proveedor.nombre}"? ${t('Las compras que le cargaste acá también se borran. Los dispositivos ya agregados al stock con él no se borran, solo quedan sin proveedor asignado.')}`
      )
    )
      return;
    await supabase.from('proveedores').delete().eq('id', proveedor.id);
    await registrarAuditoria(supabase, {
      accion: `eliminó un proveedor (${proveedor.nombre})`,
      entidad: 'proveedor',
      entidadId: proveedor.id,
      valorAnterior: { nombre: proveedor.nombre, telefono: proveedor.telefono },
    });
    router.push('/proveedores');
  };

  const limpiarFormCompra = () => {
    setModelo('');
    setCapacidad(null);
    setColor('');
    setCantidad('1');
    setPrecioUnitario('');
    setDetallesCompra('');
  };

  const abrirNuevaCompra = () => {
    limpiarFormCompra();
    setCompraEditandoId(null);
    setAgregandoCompra(true);
    setError(null);
  };

  const abrirEdicionCompra = (c: CompraManual) => {
    setModelo(c.modelo ?? '');
    setCapacidad(c.capacidad_gb);
    setColor(c.color ?? '');
    setCantidad(String(c.cantidad ?? 1));
    setPrecioUnitario(c.precio_unitario != null ? String(c.precio_unitario) : '');
    setDetallesCompra(c.detalles ?? '');
    setCompraEditandoId(c.id);
    setAgregandoCompra(true);
    setError(null);
  };

  const cerrarFormCompra = () => {
    setAgregandoCompra(false);
    setCompraEditandoId(null);
    limpiarFormCompra();
  };

  const guardarCompra = async () => {
    if (!proveedor || !modelo.trim()) return;
    setGuardandoCompra(true);
    setError(null);
    const datos = {
      modelo: normalizarNombreModelo(modelo.trim()),
      capacidad_gb: capacidad,
      color: color.trim() || null,
      cantidad: Math.max(1, Number(cantidad) || 1),
      precio_unitario: precioUnitario ? Number(precioUnitario) : null,
      detalles: detallesCompra.trim() || null,
    };
    const { error: dbError } = compraEditandoId
      ? await supabase.from('compras_proveedor').update(datos).eq('id', compraEditandoId)
      : await supabase.from('compras_proveedor').insert({ proveedor_id: proveedor.id, ...datos });
    if (dbError) {
      setError(t('No pudimos guardar la compra:') + ' ' + dbError.message);
      setGuardandoCompra(false);
      return;
    }
    setGuardandoCompra(false);
    cerrarFormCompra();
    cargar();
  };

  const eliminarCompra = async (compraId: string) => {
    if (!puedeEliminar) return;
    if (!confirm(t('¿Eliminar esta compra?'))) return;
    const compra = compras.find((c) => c.id === compraId);
    await supabase.from('compras_proveedor').delete().eq('id', compraId);
    await registrarAuditoria(supabase, {
      accion: `eliminó una compra a proveedor${compra?.modelo ? ` (${compra.modelo})` : ''}`,
      entidad: 'compra_proveedor',
      entidadId: compraId,
      valorAnterior: compra ? { modelo: compra.modelo, precio_unitario: compra.precio_unitario, cantidad: compra.cantidad } : null,
    });
    cargar();
  };

  if (!puedeVer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para ver Proveedores.')}</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver al inicio')}
        </Link>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>
      </main>
    );
  }

  if (!proveedor) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No encontramos ese proveedor.')}</p>
        <Link href="/proveedores" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver a Proveedores')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/proveedores" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium mr-auto">{proveedor.nombre}</span>
        <button onClick={() => (editandoPerfil ? setEditandoPerfil(false) : abrirEdicionPerfil())} className="text-xs text-accent dark:text-dark-accent underline">
          {editandoPerfil ? t('Cerrar') : t('Editar')}
        </button>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {editandoPerfil ? (
        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
          <input
            value={nombreEdit}
            onChange={(e) => setNombreEdit(e.target.value)}
            placeholder={t('Nombre')}
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={telefonoEdit}
            onChange={(e) => setTelefonoEdit(e.target.value)}
            placeholder={t('Teléfono')}
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            value={detallesEdit}
            onChange={(e) => setDetallesEdit(e.target.value)}
            placeholder={t('Detalles (opcional)')}
            rows={2}
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <button
            disabled={guardandoPerfil}
            onClick={guardarPerfil}
            className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {t('Guardar')}
          </button>
          {puedeEliminar && (
            <button onClick={eliminarProveedor} className="rounded-lg border border-bad/30 py-2 text-sm font-medium text-bad">
              {t('Eliminar proveedor')}
            </button>
          )}
        </div>
      ) : (
        proveedor.telefono || proveedor.detalles ? (
          <div className="rounded-xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border px-4 py-3 text-sm flex flex-col gap-1">
            {proveedor.telefono && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">{t('Teléfono:')}</span> {proveedor.telefono}
              </p>
            )}
            {proveedor.detalles && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">{t('Detalles:')}</span> {proveedor.detalles}
              </p>
            )}
          </div>
        ) : null
      )}

      <div className="rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4 flex flex-col gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted dark:text-dark-text-secondary">{t('Le debés a este proveedor')}</p>
          <p className={`text-2xl font-display font-semibold ${saldo > 0 ? 'text-bad' : saldo < 0 ? 'text-good' : ''}`}>
            ${formatearMonto(Math.abs(saldo))}
          </p>
          {saldo < 0 && <p className="text-[11px] text-good">{t('Tenés saldo a favor con él')}</p>}
          {saldo === 0 && <p className="text-[11px] text-muted dark:text-dark-text-secondary">{t('Estás al día')}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setAccionCta(accionCta === 'deuda' ? null : 'deuda');
              setMontoCta('');
              setObsCta('');
              setError(null);
            }}
            className="flex-1 rounded-xl border border-border dark:border-dark-border py-2 text-sm font-medium"
          >
            + {t('Registrar deuda')}
          </button>
          <button
            onClick={() => {
              setAccionCta(accionCta === 'pago' ? null : 'pago');
              setMontoCta('');
              setObsCta('');
              setError(null);
            }}
            className="flex-1 rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white"
          >
            {t('Registrar pago')}
          </button>
        </div>
        {accionCta && (
          <div className="flex flex-col gap-2 border-t border-border dark:border-dark-border pt-3">
            <input
              value={montoCta}
              onChange={(e) => setMontoCta(sanitizarDecimal(e.target.value))}
              inputMode="decimal"
              autoFocus
              placeholder={accionCta === 'pago' ? t('Monto que le pagás') : t('Monto que le quedás debiendo')}
              className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            {accionCta === 'pago' && (
              <select
                value={medioCta}
                onChange={(e) => setMedioCta(e.target.value)}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="efectivo">{t('Efectivo')}</option>
                <option value="transferencia">{t('Transferencia')}</option>
                <option value="débito">{t('Débito')}</option>
                <option value="crédito">{t('Crédito')}</option>
                <option value="usdt">USDT</option>
                <option value="cheque">{t('Cheque')}</option>
              </select>
            )}
            <input
              value={obsCta}
              onChange={(e) => setObsCta(e.target.value)}
              placeholder={t('Observación (opcional)')}
              className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button onClick={() => setAccionCta(null)} className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium">
                {t('Cancelar')}
              </button>
              <button
                disabled={guardandoCta}
                onClick={registrarCta}
                className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {guardandoCta ? t('Guardando...') : t('Guardar')}
              </button>
            </div>
          </div>
        )}
        {movimientos.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-border dark:border-dark-border pt-3">
            <p className="text-[11px] uppercase tracking-wide text-muted dark:text-dark-text-secondary">{t('Movimientos')}</p>
            {movimientos.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">
                    {m.concepto === 'pago' ? t('Pago') : m.concepto === 'deuda' ? t('Deuda') : t('Ajuste')}
                    {m.medio ? ` · ${medioLabel(m.medio, t)}` : ''}
                    {m.observacion ? ` · ${m.observacion}` : ''}
                  </p>
                  <p className="text-[11px] text-muted dark:text-dark-text-secondary">{new Date(m.fecha).toLocaleDateString('es-AR')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className={`text-sm font-medium ${m.tipo === 'cargo' ? 'text-bad' : 'text-good'}`}>
                    {m.tipo === 'cargo' ? '+' : '−'}${formatearMonto(m.monto)}
                  </p>
                  <Link href={`/proveedores/${id}/comprobante/${m.id}`} className="text-[11px] text-accent dark:text-dark-accent underline">
                    {t('Comprobante')}
                  </Link>
                  <button onClick={() => anularMovimiento(m.id)} className="text-[11px] text-bad underline">
                    {t('Anular')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-3.5 flex flex-col gap-0.5">
          <p className="text-xl font-display font-semibold leading-none">${formatearMonto(totalGastado)}</p>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary leading-tight mt-1">{t('Total comprado')}</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-3.5 flex flex-col gap-0.5">
          <p className="text-xl font-display font-semibold leading-none">{totalUnidades}</p>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary leading-tight mt-1">{t('Unidades compradas')}</p>
        </div>
      </div>

      {agregandoCompra ? (
        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
          <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">
            {compraEditandoId ? t('Editar compra') : t('Cargar compra')}
          </p>
          <input
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            placeholder={t('Modelo (ej. iPhone 12)')}
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            {STORAGE_OPTIONS.map((gb) => (
              <button
                key={gb}
                onClick={() => setCapacidad(capacidad === gb ? null : gb)}
                className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                  capacidad === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                {gb}GB
              </button>
            ))}
          </div>
          <SelectorColorAuto label={t('Color')} modelo={modelo} value={color} onChange={setColor} />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Cantidad')}</label>
              <input
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                inputMode="numeric"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Precio unitario')}</label>
              <input
                value={precioUnitario}
                onChange={(e) => setPrecioUnitario(sanitizarDecimal(e.target.value))}
                inputMode="decimal"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <textarea
            value={detallesCompra}
            onChange={(e) => setDetallesCompra(e.target.value)}
            placeholder={t('Detalles (opcional)')}
            rows={2}
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={cerrarFormCompra}
              className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium"
            >
              {t('Cancelar')}
            </button>
            <button
              disabled={!modelo.trim() || guardandoCompra}
              onClick={guardarCompra}
              className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {guardandoCompra ? t('Guardando...') : t('Guardar')}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={abrirNuevaCompra}
          className="w-full rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
        >
          + {t('Cargar compra')}
        </button>
      )}

      <div className="flex flex-col gap-2">
        {filas.length === 0 && (
          <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-2">{t('Todavía no hay compras registradas.')}</p>
        )}
        {filas.map((f) => (
          <div
            key={f.key}
            className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate flex items-center gap-1.5">
                {f.color && hexColorDe(f.color) && (
                  <span
                    className="h-3 w-3 rounded-full border border-border dark:border-dark-border shrink-0"
                    style={{ backgroundColor: hexColorDe(f.color)! }}
                    title={f.color}
                  />
                )}
                <span className="truncate">
                  {f.modelo || t('Sin modelo')}
                  {f.capacidad_gb ? ` · ${f.capacidad_gb}GB` : ''}
                  {f.color ? ` · ${f.color}` : ''}
                  {f.cantidad > 1 ? ` · x${f.cantidad}` : ''}
                </span>
              </p>
              <p className="text-xs text-muted dark:text-dark-text-secondary">
                {new Date(f.fecha).toLocaleDateString('es-AR')} ·{' '}
                {f.origen === 'stock' ? t('cargado al Stock') : t('compra cargada a mano')}
              </p>
              {f.detalles && <p className="text-xs text-muted dark:text-dark-text-secondary">{f.detalles}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {f.precioUnitario != null && (
                <p className="text-sm font-medium">${formatearMonto(f.precioUnitario * f.cantidad)}</p>
              )}
              {f.origen === 'manual' && f.idManual && (
                <button
                  onClick={() => {
                    const compra = compras.find((c) => c.id === f.idManual);
                    if (compra) abrirEdicionCompra(compra);
                  }}
                  className="text-xs text-accent dark:text-dark-accent underline"
                >
                  {t('Editar')}
                </button>
              )}
              {f.origen === 'manual' && f.idManual && puedeEliminar && (
                <button onClick={() => eliminarCompra(f.idManual!)} className="text-xs text-bad underline">
                  {t('Eliminar')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
