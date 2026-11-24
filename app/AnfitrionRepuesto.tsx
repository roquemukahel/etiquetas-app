'use client';

import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { useT } from './lib/idioma';
import { crearClienteNavegador } from './lib/supabase/client';
import { registrarAnfitrionRepuesto, type PedidoRepuesto } from './lib/preguntaRepuesto';
import { registrarDecisionRepuesto, alCambiarRepuestos, type DecisionRepuesto } from './lib/costoRepuesto';
import { consumirRepuesto } from './lib/repuestos';
import { repuestosDisponibles } from './lib/repuestosBusqueda';
import { obtenerTodasLasFilas } from './lib/db';
import { getActor } from './lib/actor';
import { sanitizarDecimal } from './lib/numeros';

type RepuestoOpcion = { id: string; nombre: string; cantidad_stock: number; sucursal_id: string | null; calidad: string | null };

// Cartel obligatorio "¿Se usó repuesto?" al pasar una reparación a Listo para entregar. Vive en el AppShell y lo abre cambiarEstadoReparacion
// (por la lista de Servicio Técnico, Mi banco o la ficha). No hay "saltear": o se contesta una de las tres opciones, o se cancela el cambio.
export default function AnfitrionRepuesto() {
  const t = useT();
  const [pedido, setPedido] = useState<PedidoRepuesto | null>(null);
  const pedidoRef = useRef<PedidoRepuesto | null>(null);
  const [modo, setModo] = useState<'elegir' | 'stock'>('elegir');
  const [repuestos, setRepuestos] = useState<RepuestoOpcion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState<RepuestoOpcion | null>(null);
  const [cantidad, setCantidad] = useState('1');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return registrarAnfitrionRepuesto((nuevo) => {
      // Si ya había un cartel abierto, ese cambio de estado se cancela (la persona está trabajando sobre otra reparación).
      pedidoRef.current?.resolver('cancelada');
      pedidoRef.current = nuevo;
      setModo('elegir');
      setBusqueda('');
      setElegido(null);
      setCantidad('1');
      setError(null);
      setPedido(nuevo);
    });
  }, []);

  const terminar = (respuesta: 'respondida' | 'cancelada') => {
    const actual = pedidoRef.current;
    pedidoRef.current = null;
    setPedido(null);
    actual?.resolver(respuesta);
  };

  const abrirStock = async () => {
    setModo('stock');
    if (repuestos.length > 0) return;
    setCargando(true);
    try {
      const data = await obtenerTodasLasFilas<RepuestoOpcion>(crearClienteNavegador(), 'repuestos', 'id, nombre, cantidad_stock, sucursal_id, calidad', [{ columna: 'nombre' }]);
      setRepuestos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('No pudimos cargar los repuestos.'));
    }
    setCargando(false);
  };

  const responder = async (decision: DecisionRepuesto) => {
    if (!pedido) return;
    setGuardando(true);
    setError(null);
    const mensaje = await registrarDecisionRepuesto(crearClienteNavegador(), pedido.reparacion, decision, getActor()?.nombre ?? null);
    setGuardando(false);
    if (mensaje) {
      setError(`${t('No pudimos guardar la respuesta:')} ${mensaje}`);
      return;
    }
    terminar('respondida');
  };

  const usarDelStock = async () => {
    if (!pedido || !elegido) {
      setError(t('Elegí un repuesto.'));
      return;
    }
    const cant = Number(cantidad) || 0;
    if (cant <= 0) {
      setError(t('La cantidad tiene que ser mayor a 0.'));
      return;
    }
    setGuardando(true);
    setError(null);
    const supabase = crearClienteNavegador();
    const resultado = await consumirRepuesto(supabase, {
      repuestoId: elegido.id,
      nombre: elegido.nombre,
      reparacionId: pedido.reparacion.id,
      numeroOrden: pedido.reparacion.numero_orden,
      cantidad: cant,
      actorNombre: getActor()?.nombre ?? null,
      confirmarNegativo: (stock) => confirm(`${t('Solo quedan')} ${stock} ${t('de')} "${elegido.nombre}" ${t('en stock. ¿Usar')} ${cant} ${t('igual? El stock va a quedar en negativo.')}`),
    });
    if (!resultado.ok) {
      setGuardando(false);
      if (resultado.error) setError(`${t('No pudimos guardar el repuesto:')} ${resultado.error}`);
      return;
    }
    const mensaje = await alCambiarRepuestos(supabase, pedido.reparacion.id);
    setGuardando(false);
    if (mensaje) {
      setError(`${t('El repuesto se usó, pero no pudimos actualizar el costo:')} ${mensaje}`);
      return;
    }
    terminar('respondida');
  };

  if (!pedido) return null;
  const disponibles = repuestosDisponibles(repuestos, busqueda, pedido.reparacion.sucursal_id);
  const equipo = `${pedido.reparacion.numero_orden || ''} ${pedido.reparacion.modelo || ''}`.trim();

  return (
    <Modal titulo={t('¿Se usó repuesto en esta reparación?')} onClose={() => terminar('cancelada')} maxWidth="max-w-md">
      {equipo && <p className="text-xs text-muted dark:text-dark-text-secondary -mt-1">{equipo}</p>}
      <p className="text-sm text-muted dark:text-dark-text-secondary">
        {t('Hace falta responder para marcarla como lista. Así el costo y la ganancia del taller quedan bien calculados.')}
      </p>
      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {modo === 'elegir' ? (
        <div className="flex flex-col gap-2">
          <button onClick={abrirStock} disabled={guardando} className="rounded-xl border border-border dark:border-dark-border px-4 py-3 text-left text-sm font-medium hover:border-accent disabled:opacity-50">
            {t('Sí, del stock')}
            <span className="block text-[11px] font-normal text-muted dark:text-dark-text-secondary">{t('Elegís el repuesto y se descuenta del stock con su costo.')}</span>
          </button>
          <button onClick={() => responder('pendiente')} disabled={guardando} className="rounded-xl border border-border dark:border-dark-border px-4 py-3 text-left text-sm font-medium hover:border-accent disabled:opacity-50">
            {t('Sí, pendiente de cargar')}
            <span className="block text-[11px] font-normal text-muted dark:text-dark-text-secondary">
              {t('Queda marcada como "Costo pendiente": no cuenta como ganancia hasta que cargues el repuesto.')}
            </span>
          </button>
          <button onClick={() => responder('sin_repuesto')} disabled={guardando} className="rounded-xl border border-border dark:border-dark-border px-4 py-3 text-left text-sm font-medium hover:border-accent disabled:opacity-50">
            {t('No usó repuesto')}
            <span className="block text-[11px] font-normal text-muted dark:text-dark-text-secondary">{t('Es solo mano de obra: se cuenta entera como ganancia.')}</span>
          </button>
          <button onClick={() => terminar('cancelada')} disabled={guardando} className="text-xs text-muted dark:text-dark-text-secondary underline self-center mt-1">
            {t('Cancelar (no cambiar el estado)')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setElegido(null);
            }}
            placeholder={t('Buscar repuesto...')}
            autoFocus
            className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
            {cargando && <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>}
            {!cargando && disponibles.length === 0 && <p className="text-xs text-muted dark:text-dark-text-secondary">{t('No hay repuestos con stock que coincidan.')}</p>}
            {disponibles.slice(0, 50).map((rp) => (
              <button
                key={rp.id}
                onClick={() => setElegido(rp)}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${elegido?.id === rp.id ? 'border-accent bg-accent-soft dark:bg-dark-accent-soft' : 'border-border dark:border-dark-border'}`}
              >
                {rp.nombre}
                {rp.calidad ? ` · ${rp.calidad}` : ''}
                <span className="block text-[11px] text-muted dark:text-dark-text-secondary">
                  {t('Stock')}: {rp.cantidad_stock}
                </span>
              </button>
            ))}
          </div>
          {elegido && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted dark:text-dark-text-secondary">{t('Cantidad')}</span>
              <input
                value={cantidad}
                onChange={(e) => setCantidad(sanitizarDecimal(e.target.value))}
                inputMode="decimal"
                className="w-20 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-1.5 text-sm"
              />
            </label>
          )}
          <div className="flex gap-2 mt-1">
            <button onClick={() => setModo('elegir')} disabled={guardando} className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-sm font-medium">
              {t('Volver')}
            </button>
            <button
              onClick={usarDelStock}
              disabled={guardando || !elegido}
              className="flex-1 rounded-xl bg-accent dark:bg-dark-accent text-white py-2.5 text-sm font-medium disabled:opacity-40"
            >
              {guardando ? t('Guardando…') : t('Usar este repuesto')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
