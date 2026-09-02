'use client';

// Muestra el bloqueo guardado de una reparación, tapado por defecto (mismo
// criterio de privacidad que ya tenía codigo_desbloqueo en la ficha: cualquiera
// que pase por el mostrador no debería leerlo de arriba, hay que tocar
// "mostrar" a propósito). Para PIN/contraseña tapa el texto; para patrón tapa
// directamente el dibujo (mostrar la grilla ya revela por dónde no pasa el
// dedo, así que no alcanza con difuminar el texto).
import { useT } from './lib/idioma';
import { TIPOS_BLOQUEO, type TipoBloqueo } from './lib/reparaciones';
import PatronDesbloqueo from './PatronDesbloqueo';

export default function MostrarBloqueo({
  tipoBloqueo,
  codigo,
  patron,
  visible,
  onToggleVisible,
}: {
  tipoBloqueo: TipoBloqueo | null;
  codigo: string | null;
  patron: string | null;
  visible: boolean;
  onToggleVisible: () => void;
}) {
  const t = useT();
  // Dato cargado antes de que existiera tipo_bloqueo: un código sin tipo
  // sigue siendo un bloqueo real, se muestra igual con una etiqueta genérica
  // en vez de desaparecer silenciosamente.
  if (!tipoBloqueo && !codigo) return null;
  const esPatron = tipoBloqueo === 'patron';
  const label = tipoBloqueo ? TIPOS_BLOQUEO.find((o) => o.id === tipoBloqueo)?.label ?? tipoBloqueo : 'Código de desbloqueo';

  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-2">
        <span className="text-muted dark:text-dark-text-secondary">
          {tipoBloqueo ? `${t('Bloqueo:')} ${t(label)}` : t(label)}
        </span>
        <button onClick={onToggleVisible} className="text-xs text-accent dark:text-dark-accent underline">
          {visible ? t('ocultar') : t('mostrar')}
        </button>
      </p>
      {visible && esPatron && patron && <PatronDesbloqueo value={patron} size={120} />}
      {visible && !esPatron && codigo && <p className="font-mono text-sm">{codigo}</p>}
      {!visible && <p className="font-mono text-sm">{esPatron ? '⋯' : '••••••'}</p>}
    </div>
  );
}
