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
  puedeGestionarFinanciacion: boolean;
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

  // Una cuenta con acceso alto (administrador o acceso completo) sin PIN es
  // el agujero de seguridad más grande: desde "Cambiar" cualquiera se puede
  // elegir como ella y quedar con todos los permisos. Por eso el aviso de
  // "ponele un PIN" tiene que verse SIEMPRE que no haya PIN, no solo en las
  // cuentas limitadas (antes solo aparecía ahí), y más fuerte en las de
  // acceso alto.
  const accesoAlto = valor.esAdministrador || valor.accesoCompleto;

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
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={valor.puedeGestionarFinanciacion}
                  onChange={(e) => set('puedeGestionarFinanciacion', e.target.checked)}
                  className="h-4 w-4 accent-ink"
                />
                <span className="text-sm">Puede crear financiaciones en cuotas y registrar sus pagos</span>
              </label>
            </div>
          )}
        </div>
      )}

      {!tienePin && (
        <p className={`text-[11px] mt-1 ${accesoAlto ? 'text-bad font-medium' : 'text-warn'}`}>
          {accesoAlto ? (
            <>
              ⚠️ Esta cuenta no tiene PIN. Como tiene acceso alto, cualquiera puede elegirse como esta persona
              desde "Cambiar" (arriba a la derecha) y quedar con todos los permisos. Ponele un PIN de 4 a 6 dígitos
              para que nadie se pueda hacer pasar por ella.
            </>
          ) : (
            <>
              Sin un PIN cargado, cualquiera puede elegirse como esta persona sin escribir nada — para que el
              límite tenga efecto, cargale también un PIN.
            </>
          )}
        </p>
      )}
    </div>
  );
}
