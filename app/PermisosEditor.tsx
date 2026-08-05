'use client';

// Mismo bloque de permisos para vendedores y técnicos (comparten las
// mismas columnas — ver app/lib/actor.ts) para no duplicar este
// formulario en las dos pantallas de Configuración.
export type PermisosForm = {
  esAdministrador: boolean;
  accesoCompleto: boolean;
  puedeVender: boolean;
  puedeEliminar: boolean;
  puedeAgregarStock: boolean;
  puedeVerEstadisticas: boolean;
  puedeRecibirServicioTecnico: boolean;
  puedeGestionarServicioTecnico: boolean;
};

export default function PermisosEditor({
  valor,
  onChange,
  tienePin,
}: {
  valor: PermisosForm;
  onChange: (v: PermisosForm) => void;
  tienePin: boolean;
}) {
  const set = (k: keyof PermisosForm, v: boolean) => onChange({ ...valor, [k]: v });

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">Permisos</p>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={valor.esAdministrador}
          onChange={(e) => set('esAdministrador', e.target.checked)}
          className="h-4 w-4 accent-ink"
        />
        <span className="text-sm">Administrador (acceso total: Estadísticas, Proveedores, Auditoría y gestión de otros usuarios)</span>
      </label>

      {!valor.esAdministrador && (
        <div className="flex flex-col gap-1.5 pl-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={valor.accesoCompleto}
              onChange={(e) => set('accesoCompleto', e.target.checked)}
              className="h-4 w-4 accent-ink"
            />
            <span className="text-sm">Acceso completo (todas las tareas del día a día, pero no Auditoría ni gestión de usuarios)</span>
          </label>
          {!valor.accesoCompleto && (
            <div className="flex flex-col gap-1.5 pl-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={valor.puedeVender}
                  onChange={(e) => set('puedeVender', e.target.checked)}
                  className="h-4 w-4 accent-ink"
                />
                <span className="text-sm">Puede vender (crear órdenes)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={valor.puedeEliminar}
                  onChange={(e) => set('puedeEliminar', e.target.checked)}
                  className="h-4 w-4 accent-ink"
                />
                <span className="text-sm">Puede eliminar (órdenes, clientes, stock, canjes, compras)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={valor.puedeAgregarStock}
                  onChange={(e) => set('puedeAgregarStock', e.target.checked)}
                  className="h-4 w-4 accent-ink"
                />
                <span className="text-sm">Puede agregar dispositivos al stock</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={valor.puedeVerEstadisticas}
                  onChange={(e) => set('puedeVerEstadisticas', e.target.checked)}
                  className="h-4 w-4 accent-ink"
                />
                <span className="text-sm">Puede ver Estadísticas</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={valor.puedeRecibirServicioTecnico}
                  onChange={(e) => set('puedeRecibirServicioTecnico', e.target.checked)}
                  className="h-4 w-4 accent-ink"
                />
                <span className="text-sm">Puede recibir equipos de Servicio Técnico</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={valor.puedeGestionarServicioTecnico}
                  onChange={(e) => set('puedeGestionarServicioTecnico', e.target.checked)}
                  className="h-4 w-4 accent-ink"
                />
                <span className="text-sm">Puede gestionar Servicio Técnico (cambiar estado, cobrar, entregar)</span>
              </label>
            </div>
          )}
          {!tienePin && (
            <p className="text-[10px] text-warn mt-0.5">
              Sin un PIN cargado, cualquiera puede elegirse como esta persona sin escribir nada — para que el
              límite tenga efecto, cargale también un PIN.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
