'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { imagenPorNombreExacto } from '../lib/carpetas';
import { imagenColorDeModelo } from '../lib/coloresModelo';
import { esDemorado, esHoy, FINALIZADOS } from '../lib/reparaciones';
import MiniaturaDispositivo from '../MiniaturaDispositivo';
import Avatar from '../Avatar';
import EstadoBadge from '../EstadoBadge';
import { ICONOS } from '../Iconos';
import TarjetaReparacion, { Reparacion, Tecnico } from './TarjetaReparacion';

// Estados donde el técnico tiene algo concreto para hacer ahora mismo (a
// diferencia de "esperando aprobación"/"esperando repuesto", que dependen
// del cliente o de compras, no de él) — de acá sale qué reparación se
// propone como "Próxima acción" y qué botón de acción rápida se le ofrece.
const ACCION_POR_ESTADO: Record<string, { label: string; siguiente: string }> = {
  recibido: { label: 'Iniciar diagnóstico', siguiente: 'esperando_diagnostico' },
  esperando_diagnostico: { label: 'Enviar presupuesto', siguiente: 'esperando_aprobacion' },
  en_reparacion: { label: 'Marcar listo para entregar', siguiente: 'listo_para_entregar' },
};

type Filtro = 'activas' | 'demoradas' | 'diagnostico' | 'aprobacion' | 'repuesto' | 'reparacion' | 'listas' | 'hoy' | null;

// Prioriza qué reparación conviene atender primero: prioridad manual, fecha
// prometida vencida o próxima a vencer, y antigüedad — mismos criterios que
// pide la sección "Mi banco" del rediseño, aplicados solo con datos reales
// (nada de mock).
function puntaje(r: Reparacion): number {
  let p = 0;
  if (r.prioridad === 'critica') p += 3000;
  else if (r.prioridad === 'urgente') p += 1500;
  if (r.fecha_estimada) {
    const vencida = new Date(r.fecha_estimada + 'T00:00:00').getTime() < Date.now();
    if (vencida) p += 1000;
    else {
      const diasHasta = (new Date(r.fecha_estimada + 'T00:00:00').getTime() - Date.now()) / 86400000;
      if (diasHasta < 2) p += 400;
    }
  }
  const diasAntiguedad = (Date.now() - new Date(r.fecha_ingreso_servicio).getTime()) / 86400000;
  p += Math.min(diasAntiguedad, 30) * 10;
  return p;
}

export default function MiBanco({
  tecnicoId,
  nombreTecnico,
  fotoTecnico,
  reparaciones,
  tecnicos,
  guardando,
  menuAbierto,
  setMenuAbierto,
  onAsignarTecnico,
  onCambiarEstado,
  onWhatsApp,
  onArchivar,
  onEliminar,
  onAgregarAlStock,
  onEntregadoCliente,
  imagenesCarpetas,
  puedeAgregarStock,
  esPropio,
}: {
  tecnicoId: string;
  nombreTecnico: (id: string | null) => string | undefined;
  fotoTecnico: (id: string | null) => string | null;
  reparaciones: Reparacion[];
  tecnicos: Tecnico[];
  guardando: string | null;
  menuAbierto: string | null;
  setMenuAbierto: (id: string | null) => void;
  onAsignarTecnico: (id: string, tecnicoId: string) => void;
  onCambiarEstado: (r: Reparacion, estado: string) => void;
  onWhatsApp: (r: Reparacion) => void;
  onArchivar: (r: Reparacion) => void;
  onEliminar: (r: Reparacion) => void;
  onAgregarAlStock: (r: Reparacion) => void;
  onEntregadoCliente: (r: Reparacion) => void;
  imagenesCarpetas: Map<string, string>;
  puedeAgregarStock: boolean;
  esPropio: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>('activas');

  const propias = useMemo(() => reparaciones.filter((r) => r.tecnico_id === tecnicoId), [reparaciones, tecnicoId]);

  const indicadores = useMemo(() => {
    const activas = propias.filter((r) => !FINALIZADOS.includes(r.estado));
    return {
      activas: activas.length,
      demoradas: activas.filter(esDemorado).length,
      diagnostico: activas.filter((r) => r.estado === 'recibido' || r.estado === 'esperando_diagnostico').length,
      aprobacion: activas.filter((r) => r.estado === 'esperando_aprobacion').length,
      repuesto: activas.filter((r) => r.estado === 'esperando_repuesto').length,
      reparacion: activas.filter((r) => r.estado === 'en_reparacion').length,
      listas: activas.filter((r) => r.estado === 'listo_para_entregar').length,
      hoy: propias.filter((r) => esHoy(r.fecha_reparado)).length,
    };
  }, [propias]);

  const ordenadasPorPrioridad = useMemo(() => [...propias].sort((a, b) => puntaje(b) - puntaje(a)), [propias]);

  const filtradas = useMemo(() => {
    return ordenadasPorPrioridad.filter((r) => {
      switch (filtro) {
        case 'activas':
          return !FINALIZADOS.includes(r.estado);
        case 'demoradas':
          return esDemorado(r);
        case 'diagnostico':
          return r.estado === 'recibido' || r.estado === 'esperando_diagnostico';
        case 'aprobacion':
          return r.estado === 'esperando_aprobacion';
        case 'repuesto':
          return r.estado === 'esperando_repuesto';
        case 'reparacion':
          return r.estado === 'en_reparacion';
        case 'listas':
          return r.estado === 'listo_para_entregar';
        case 'hoy':
          return esHoy(r.fecha_reparado);
        default:
          return true;
      }
    });
  }, [ordenadasPorPrioridad, filtro]);

  // Próxima acción: la reparación mejor puntuada entre las que el técnico
  // puede realmente avanzar ahora (no las que esperan al cliente o a un
  // repuesto — esas se ven abajo en la lista, pero no se proponen como "lo
  // siguiente" porque no dependen de él).
  const proximaAccion = ordenadasPorPrioridad.find((r) => ACCION_POR_ESTADO[r.estado]);
  const bloqueadas = propias.filter((r) => !FINALIZADOS.includes(r.estado) && (r.estado === 'esperando_aprobacion' || r.estado === 'esperando_repuesto'));

  const INDICADORES: { id: Exclude<Filtro, null>; icono: string; label: string; valor: number; acento: string }[] = [
    { id: 'activas', icono: 'tablero', label: 'Activas', valor: indicadores.activas, acento: 'accent' },
    { id: 'demoradas', icono: 'reloj', label: 'Demoradas', valor: indicadores.demoradas, acento: 'bad' },
    { id: 'diagnostico', icono: 'lupa', label: 'En diagnóstico', valor: indicadores.diagnostico, acento: 'diag' },
    { id: 'aprobacion', icono: 'documento', label: 'Esp. aprobación', valor: indicadores.aprobacion, acento: 'warn' },
    { id: 'repuesto', icono: 'stock', label: 'Esp. repuesto', valor: indicadores.repuesto, acento: 'warn' },
    { id: 'reparacion', icono: 'herramienta', label: 'En reparación', valor: indicadores.reparacion, acento: 'repar' },
    { id: 'listas', icono: 'chequeado', label: 'Listas', valor: indicadores.listas, acento: 'good' },
    { id: 'hoy', icono: 'entregado', label: 'Hoy completó', valor: indicadores.hoy, acento: 'good' },
  ];
  const colorTexto: Record<string, string> = {
    accent: 'text-accent dark:text-dark-accent',
    bad: 'text-bad',
    warn: 'text-warn',
    good: 'text-good',
    diag: 'text-diag',
    repar: 'text-repar',
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <Avatar src={fotoTecnico(tecnicoId)} nombre={nombreTecnico(tecnicoId) ?? '?'} size={44} />
        <div>
          <p className="text-sm font-semibold">{esPropio ? 'Mi banco' : `Banco de ${nombreTecnico(tecnicoId) ?? 'técnico'}`}</p>
          <p className="text-xs text-muted dark:text-dark-text-secondary">
            {esPropio ? 'Tu día de trabajo, ordenado por prioridad' : 'Vista personalizada de este técnico'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
        {INDICADORES.map((ind) => {
          const activo = filtro === ind.id;
          return (
            <button
              key={ind.id}
              onClick={() => setFiltro(activo ? null : ind.id)}
              aria-pressed={activo}
              className={`rounded-xl border px-2 py-2 flex flex-col items-start gap-0.5 text-left transition-colors ${
                activo
                  ? 'border-accent dark:border-dark-accent bg-accent-soft dark:bg-dark-accent-soft'
                  : 'border-border dark:border-dark-border bg-white dark:bg-dark-surface hover:border-accent/40 dark:hover:border-dark-accent/40'
              }`}
            >
              <span className={`flex items-center gap-1 text-base font-semibold ${colorTexto[ind.acento]}`}>
                <span aria-hidden="true" className="[&_svg]:h-4 [&_svg]:w-4">
                  {ICONOS[ind.icono]}
                </span>
                {ind.valor}
              </span>
              <span className="text-muted dark:text-dark-text-secondary leading-tight">{ind.label}</span>
            </button>
          );
        })}
      </div>

      {/* Próxima acción: una sola tarjeta destacada con lo más urgente que el
          técnico puede resolver ahora mismo, para que no tenga que escanear
          toda la lista para saber por dónde arrancar. */}
      <div className="rounded-xl border border-accent/30 dark:border-dark-accent/30 bg-accent-soft/40 dark:bg-dark-accent-soft/40 p-3 flex flex-col gap-2">
        <p className="text-xs font-semibold text-accent dark:text-dark-accent">Próxima acción</p>
        {proximaAccion ? (
          <div className="flex items-center gap-3">
            <MiniaturaDispositivo
              src={imagenColorDeModelo(proximaAccion.modelo, proximaAccion.color) ?? imagenPorNombreExacto(proximaAccion.modelo, imagenesCarpetas)}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {proximaAccion.numero_orden} · {proximaAccion.modelo}
                {proximaAccion.capacidad_gb ? ` · ${proximaAccion.capacidad_gb}GB` : ''}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <EstadoBadge estado={proximaAccion.estado} />
                {proximaAccion.prioridad !== 'normal' && (
                  <span className="text-xs font-medium text-bad">{proximaAccion.prioridad === 'critica' ? 'Crítica' : 'Urgente'}</span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                disabled={guardando === proximaAccion.id}
                onClick={() => onCambiarEstado(proximaAccion, ACCION_POR_ESTADO[proximaAccion.estado].siguiente)}
                className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors px-3 py-2 text-xs font-medium text-white disabled:opacity-40 whitespace-nowrap"
              >
                {ACCION_POR_ESTADO[proximaAccion.estado].label}
              </button>
              <Link
                href={`/servicio-tecnico/${proximaAccion.id}`}
                className="text-center text-xs text-accent dark:text-dark-accent underline"
              >
                Abrir ficha
              </Link>
            </div>
          </div>
        ) : bloqueadas.length > 0 ? (
          <p className="text-sm text-muted dark:text-dark-text-secondary">
            No tenés nada pendiente de tu parte ahora mismo. Hay {bloqueadas.length} reparación
            {bloqueadas.length === 1 ? '' : 'es'} esperando al cliente o a un repuesto — no depende de vos por el momento.
          </p>
        ) : (
          <p className="text-sm text-muted dark:text-dark-text-secondary">¡Estás al día! No tenés próximas acciones pendientes.</p>
        )}
      </div>

      {filtradas.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-2">No hay reparaciones en este filtro.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtradas.map((r) => (
            <TarjetaReparacion
              key={r.id}
              r={r}
              nombreTecnico={nombreTecnico}
              guardando={guardando}
              menuAbierto={menuAbierto}
              setMenuAbierto={setMenuAbierto}
              tecnicos={tecnicos}
              onAsignarTecnico={onAsignarTecnico}
              onCambiarEstado={onCambiarEstado}
              onWhatsApp={onWhatsApp}
              onArchivar={onArchivar}
              onEliminar={onEliminar}
              onAgregarAlStock={onAgregarAlStock}
              onEntregadoCliente={onEntregadoCliente}
              imagenesCarpetas={imagenesCarpetas}
              puedeAgregarStock={puedeAgregarStock}
            />
          ))}
        </div>
      )}
    </div>
  );
}
