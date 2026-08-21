'use client';

import Link from 'next/link';
import { imagenPorNombreExacto } from '../lib/carpetas';
import { imagenColorDeModelo } from '../lib/coloresModelo';
import { ESTADOS_REPARACION, PRIORIDADES, infoEstado } from '../lib/reparaciones';
import MiniaturaDispositivo from '../MiniaturaDispositivo';
import EstadoBadge from '../EstadoBadge';
import { ICONOS } from '../Iconos';
import { Boton, BotonLink } from '../Boton';
import { useT } from '../lib/idioma';

// Ícono chico reutilizado inline en esta tarjeta (etiqueta, cliente/local,
// ubicación) — mismo patrón de EstadoBadge para reescalar los SVG de 24px.
function IconoChico({ nombre }: { nombre: string }) {
  return (
    <span aria-hidden="true" className="[&_svg]:h-3.5 [&_svg]:w-3.5 inline-flex shrink-0">
      {ICONOS[nombre]}
    </span>
  );
}

export type Tecnico = { id: string; nombre: string; foto_url: string | null };

export type Reparacion = {
  id: string;
  numero_orden: string | null;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  falla_declarada: string | null;
  diagnostico: string | null;
  ubicacion_fisica: string | null;
  tecnico_id: string | null;
  estado: string;
  prioridad: string;
  trabajos_realizados: string[] | null;
  fecha_ingreso_servicio: string;
  fecha_estimada: string | null;
  fecha_reparado: string | null;
  fecha_entrega: string | null;
  garantia_dias: number | null;
  estado_actualizado_at: string;
  cliente_id: string | null;
  token_seguimiento: string | null;
  en_poder_tecnico: boolean;
  presupuesto_mano_obra: number | null;
  presupuesto_repuestos: number | null;
  importe_total: number | null;
  orden_cobro_id: string | null;
  agregado_a_stock: boolean;
  clientes: { nombre: string; apellido: string | null; telefono: string | null } | null;
};

// Franja lateral semántica de la tarjeta: mismos hex que tailwind.config.js
// (accent/diag/warn/repar/good/muted/bad). Con inline style porque son
// colores dinámicos por estado — una clase Tailwind armada en runtime no
// sobrevive el purge de producción.
const COLOR_ACENTO: Record<string, string> = {
  accent: '#355CDE',
  diag: '#7C3AED',
  warn: '#D97706',
  repar: '#0284C7',
  good: '#16A34A',
  muted: '#475569',
  bad: '#DC2626',
};

function hace(iso: string, t: (texto: string) => string) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return t('recién');
  if (min < 60) return `${t('hace')} ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `${t('hace')} ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `${t('hace')} ${dias}d`;
}

// Tarjeta de reparación reutilizada en la lista principal de Reparaciones,
// en "Técnicos → en su poder" y en Mi banco — mismo diseño y mismas
// acciones en los tres lugares para que cambiar de técnico o de estado se
// comporte siempre igual.
export default function TarjetaReparacion({
  r,
  nombreTecnico,
  guardando,
  menuAbierto,
  setMenuAbierto,
  tecnicos,
  onAsignarTecnico,
  onCambiarEstado,
  onWhatsApp,
  onArchivar,
  onEliminar,
  onAgregarAlStock,
  onEntregadoCliente,
  imagenesCarpetas,
  puedeAgregarStock,
  extra,
}: {
  r: Reparacion;
  nombreTecnico: (id: string | null) => string | undefined;
  guardando: string | null;
  menuAbierto: string | null;
  setMenuAbierto: (id: string | null) => void;
  tecnicos: Tecnico[];
  onAsignarTecnico: (id: string, tecnicoId: string) => void;
  onCambiarEstado: (r: Reparacion, estado: string) => void;
  onWhatsApp: (r: Reparacion) => void;
  onArchivar: (r: Reparacion) => void;
  onEliminar: (r: Reparacion) => void;
  onAgregarAlStock: (r: Reparacion) => void;
  onEntregadoCliente: (r: Reparacion) => void;
  imagenesCarpetas: Map<string, string>;
  puedeAgregarStock: boolean;
  extra?: React.ReactNode;
}) {
  const t = useT();
  const est = infoEstado(r.estado);
  const presupuesto =
    r.presupuesto_mano_obra != null || r.presupuesto_repuestos != null
      ? `$${((r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0)).toLocaleString('es-AR')}`
      : t('pendiente');
  const nombreCliente = r.clientes ? `${r.clientes.nombre} ${r.clientes.apellido || ''}`.trim() : null;

  return (
    <div
      style={{ borderLeftColor: COLOR_ACENTO[est.acento] || COLOR_ACENTO.muted, borderLeftWidth: 3 }}
      className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2"
    >
      <div className="flex items-start gap-3">
        <MiniaturaDispositivo src={imagenColorDeModelo(r.modelo, r.color) ?? imagenPorNombreExacto(r.modelo, imagenesCarpetas)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">
            {r.numero_orden} · {r.modelo}
            {r.capacidad_gb ? ` · ${r.capacidad_gb}GB` : ''}
            {r.color ? ` · ${r.color}` : ''}
          </p>
          <p className="text-xs text-muted dark:text-dark-text-secondary truncate">
            {nombreTecnico(r.tecnico_id) || t('Sin técnico')}
            {nombreCliente ? ` · ${nombreCliente}` : ''}
          </p>
          {r.imei && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              IMEI: <span className="font-bold font-mono text-ink dark:text-dark-text">{r.imei}</span>
            </p>
          )}
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuAbierto(menuAbierto === r.id ? null : r.id)}
            aria-label={t('Más acciones')}
            aria-haspopup="true"
            aria-expanded={menuAbierto === r.id}
            className="text-lg leading-none px-1 text-muted dark:text-dark-text-secondary"
          >
            ⋯
          </button>
          {menuAbierto === r.id && (
            <div className="absolute right-0 top-6 z-10 w-44 rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-elevated flex flex-col overflow-hidden">
              <Link
                href={`/servicio-tecnico/etiqueta/${r.id}`}
                className="flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-canvas dark:hover:bg-dark-bg"
              >
                <IconoChico nombre="etiqueta" /> {t('Imprimir etiqueta')}
              </Link>
              <button
                onClick={() => onArchivar(r)}
                className="px-3 py-2 text-xs text-left hover:bg-canvas dark:hover:bg-dark-bg"
              >
                {t('Cancelar / archivar')}
              </button>
              <button
                onClick={() => onEliminar(r)}
                className="flex items-center gap-2 px-3 py-2 text-xs text-left text-bad hover:bg-bad/10"
              >
                <IconoChico nombre="papelera" /> {t('Eliminar definitivamente')}
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="flex items-center gap-1 text-xs">
        {r.cliente_id ? (
          <span className="flex items-center gap-1 text-accent dark:text-dark-accent">
            <IconoChico nombre="clientes" /> {t('Cliente')}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-muted dark:text-dark-text-secondary">
            <IconoChico nombre="local" /> {t('Propio del local')}
          </span>
        )}
      </p>

      {r.falla_declarada && <p className="text-xs text-muted dark:text-dark-text-secondary">{r.falla_declarada}</p>}

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <EstadoBadge estado={r.estado} />
        {r.prioridad !== 'normal' && (
          <span className={`font-medium ${PRIORIDADES.find((p) => p.id === r.prioridad)?.color}`}>
            {t(PRIORIDADES.find((p) => p.id === r.prioridad)?.label ?? '')}
          </span>
        )}
        {r.ubicacion_fisica && (
          <span className="flex items-center gap-1 text-muted dark:text-dark-text-secondary">
            <IconoChico nombre="ubicacion" /> {r.ubicacion_fisica}
          </span>
        )}
        <span className="text-muted dark:text-dark-text-secondary">{t('Ingresó')} {hace(r.fecha_ingreso_servicio, t)}</span>
      </div>

      <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Presupuesto:')} {presupuesto}</p>

      {extra}

      {/* Footer compacto: una sola acción de estado (cuando corresponde) +
          navegación/WhatsApp en una fila, en vez de barras apiladas de
          colores saturados. Misma lógica y mismos handlers que antes. */}
      {r.cliente_id ? (
        (r.estado === 'listo_para_entregar' || r.estado === 'cancelado') && (
          <Boton
            variante="exito"
            tamano="sm"
            anchoCompleto
            disabled={guardando === r.id}
            cargando={guardando === r.id}
            onClick={() => onEntregadoCliente(r)}
            iconoIzq={<IconoChico nombre="check" />}
          >
            {t('Marcar entregado al cliente')}
          </Boton>
        )
      ) : (
        // Equipo propio: "Agregar al Stock" sigue disponible tanto en "Listo
        // para entregar" como en "Entregado"/"Cancelado" mientras no se haya
        // agregado todavía — antes desaparecía al marcar entregado aunque
        // nunca se hubiera agregado. Gateado al permiso de Stock, no al de
        // gestionar servicio técnico.
        (r.estado === 'listo_para_entregar' || r.estado === 'entregado' || r.estado === 'cancelado') &&
        !r.agregado_a_stock &&
        (puedeAgregarStock ? (
          <Boton
            variante="exito"
            tamano="sm"
            anchoCompleto
            disabled={guardando === r.id}
            cargando={guardando === r.id}
            onClick={() => onAgregarAlStock(r)}
            iconoIzq={<IconoChico nombre="check" />}
          >
            {t('Agregar al Stock')}
          </Boton>
        ) : (
          r.estado === 'entregado' && (
            <span className="inline-flex items-center justify-center rounded-lg bg-muted/10 h-9 text-xs font-medium text-muted dark:text-dark-text-secondary">
              {t('Entregado')}
            </span>
          )
        ))
      )}

      {r.estado === 'entregado' && (r.cliente_id || r.agregado_a_stock) && (
        <span className="inline-flex items-center justify-center gap-1 rounded-lg bg-muted/10 h-9 text-xs font-medium text-muted dark:text-dark-text-secondary">
          <IconoChico nombre="check" />
          {r.cliente_id ? t('Entregado al cliente') : t('Ya está en Stock')}
        </span>
      )}

      <div className="flex gap-2">
        <BotonLink href={`/servicio-tecnico/${r.id}`} variante="secundario" tamano="sm" className="flex-1">
          {t('Abrir ficha')}
        </BotonLink>
        {r.cliente_id && (
          <Boton
            variante="secundario"
            tamano="sm"
            disabled={guardando === r.id}
            cargando={guardando === r.id}
            onClick={() => onWhatsApp(r)}
            iconoIzq={<IconoChico nombre="enviar" />}
            className="text-good border-good/30"
          >
            WhatsApp
          </Boton>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={r.tecnico_id ?? ''}
          disabled={guardando === r.id}
          onChange={(ev) => onAsignarTecnico(r.id, ev.target.value)}
          className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-2 text-xs disabled:opacity-40"
        >
          <option value="">{t('Sin asignar')}</option>
          {tecnicos.map((tec) => (
            <option key={tec.id} value={tec.id}>
              {tec.nombre}
            </option>
          ))}
        </select>
        <select
          value={r.estado}
          disabled={guardando === r.id}
          onChange={(ev) => onCambiarEstado(r, ev.target.value)}
          className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-2 text-xs disabled:opacity-40"
        >
          {ESTADOS_REPARACION.map((e) => (
            <option key={e.id} value={e.id}>
              {t(e.label)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
