import { describe, expect, it } from 'vitest';
import {
  ALFABETO_CODIGO,
  armarMensajesPush,
  armarOrdenPublicaJson,
  esTokenExpoValido,
  estadoPublico,
  historialPublico,
  normalizarCodigo,
  presupuestoPublico,
  textoPush,
  tokensNoRegistrados,
  trabajoPublico,
  type FilaOrdenPublica,
} from './ordenPublica';

const fila = (p: Partial<FilaOrdenPublica> = {}): FilaOrdenPublica => ({
  modelo: 'iPhone 13 Pro',
  color: 'Grafito',
  estado: 'en_reparacion',
  trabajo_recomendado: 'Cambio de pantalla',
  trabajos_realizados: [],
  falla_declarada: 'Se rompió la pantalla',
  nota_cliente: 'Estamos colocando la pantalla nueva.',
  presupuesto_mano_obra: 40,
  presupuesto_repuestos: 80,
  importe_total: null,
  seguimiento_actualizado_at: '2026-11-02T16:30:00Z',
  estado_actualizado_at: '2026-11-02T16:00:00Z',
  created_at: '2026-11-02T14:10:00Z',
  ...p,
});

describe('código de seguimiento', () => {
  it('el alfabeto no tiene símbolos que se confunden (I, O, 0, 1)', () => {
    expect(ALFABETO_CODIGO).toHaveLength(32);
    expect(ALFABETO_CODIGO).not.toMatch(/[IO01]/);
  });
  it('acepta el ejemplo, minúsculas y espacios', () => {
    expect(normalizarCodigo('K7P2QX9M')).toBe('K7P2QX9M');
    expect(normalizarCodigo(' k7p2qx9m ')).toBe('K7P2QX9M');
  });
  it('rechaza largos o símbolos que no existen', () => {
    expect(normalizarCodigo('K7P2QX9')).toBeNull();
    expect(normalizarCodigo('K7P2QX9MM')).toBeNull();
    expect(normalizarCodigo('K7P2QX0M')).toBeNull();
    expect(normalizarCodigo('K7P2QXIM')).toBeNull();
    expect(normalizarCodigo('')).toBeNull();
    expect(normalizarCodigo(null)).toBeNull();
  });
});

describe('estados que ve el cliente', () => {
  it('traduce los estados internos', () => {
    expect(estadoPublico('en_reparacion')).toBe('reparando');
    expect(estadoPublico('listo_para_entregar')).toBe('listo');
    expect(estadoPublico('esperando_diagnostico')).toBe('diagnostico');
    expect(estadoPublico('esperando_aprobacion')).toBe('diagnostico');
    expect(estadoPublico('esperando_repuesto')).toBe('esperando_repuesto');
    expect(estadoPublico('entregado')).toBe('entregado');
    expect(estadoPublico('cancelado')).toBe('cancelado');
  });
  it('un estado desconocido no rompe: queda como recibido', () => {
    expect(estadoPublico('algo_nuevo')).toBe('recibido');
    expect(estadoPublico(null)).toBe('recibido');
  });
});

describe('trabajo y presupuesto', () => {
  it('prefiere lo ya realizado, después lo recomendado y al final la falla', () => {
    expect(trabajoPublico({ trabajos_realizados: ['Pantalla', 'Batería'], trabajo_recomendado: 'x', falla_declarada: 'y' })).toBe('Pantalla, Batería');
    expect(trabajoPublico({ trabajos_realizados: [], trabajo_recomendado: 'Cambio de pantalla', falla_declarada: 'y' })).toBe('Cambio de pantalla');
    expect(trabajoPublico({ trabajos_realizados: null, trabajo_recomendado: '  ', falla_declarada: 'No carga' })).toBe('No carga');
    expect(trabajoPublico({ trabajos_realizados: null, trabajo_recomendado: null, falla_declarada: null })).toBeNull();
  });
  it('presupuesto = mano de obra + repuestos, o el importe final, o nada', () => {
    expect(presupuestoPublico({ presupuesto_mano_obra: 40, presupuesto_repuestos: '80', importe_total: null })).toBe(120);
    expect(presupuestoPublico({ presupuesto_mano_obra: null, presupuesto_repuestos: 25, importe_total: null })).toBe(25);
    expect(presupuestoPublico({ presupuesto_mano_obra: null, presupuesto_repuestos: null, importe_total: 90 })).toBe(90);
    expect(presupuestoPublico({ presupuesto_mano_obra: null, presupuesto_repuestos: null, importe_total: 0 })).toBeNull();
    expect(presupuestoPublico({ presupuesto_mano_obra: null, presupuesto_repuestos: null, importe_total: null })).toBeNull();
  });
});

describe('historial', () => {
  it('va de más viejo a más nuevo y junta estados internos que para el cliente son el mismo', () => {
    const h = historialPublico([
      { estado: 'en_reparacion', created_at: '2026-11-02T16:00:00Z' },
      { estado: 'recibido', created_at: '2026-11-02T14:10:00Z' },
      { estado: 'esperando_diagnostico', created_at: '2026-11-02T14:30:00Z' },
      { estado: 'esperando_aprobacion', created_at: '2026-11-02T15:00:00Z' },
    ]);
    expect(h).toEqual([
      { estado: 'recibido', fecha: '2026-11-02T14:10:00.000Z' },
      { estado: 'diagnostico', fecha: '2026-11-02T14:30:00.000Z' },
      { estado: 'reparando', fecha: '2026-11-02T16:00:00.000Z' },
    ]);
  });
});

describe('JSON de la orden', () => {
  it('trae exactamente los campos pedidos y ninguno de más', () => {
    const json = armarOrdenPublicaJson('K7P2QX9M', fila(), 'USD', [
      { estado: 'recibido', created_at: '2026-11-02T14:10:00Z' },
      { estado: 'en_reparacion', created_at: '2026-11-02T16:00:00Z' },
    ]);
    expect(Object.keys(json).sort()).toEqual(['actualizado', 'codigo', 'color', 'equipo', 'estado', 'historial', 'moneda', 'nota_cliente', 'presupuesto', 'trabajo']);
    expect(json).toMatchObject({
      codigo: 'K7P2QX9M',
      equipo: 'iPhone 13 Pro',
      color: 'Grafito',
      trabajo: 'Cambio de pantalla',
      estado: 'reparando',
      nota_cliente: 'Estamos colocando la pantalla nueva.',
      presupuesto: 120,
      moneda: 'USD',
      actualizado: '2026-11-02T16:30:00.000Z',
    });
    expect(json.historial).toHaveLength(2);
  });
  it('una orden vieja sin historial muestra al menos su estado de hoy', () => {
    const json = armarOrdenPublicaJson('K7P2QX9M', fila({ estado: 'listo_para_entregar' }), 'ARS', []);
    expect(json.historial).toEqual([{ estado: 'listo', fecha: '2026-11-02T16:00:00.000Z' }]);
  });
  it('si el historial quedó atrasado respecto del estado real, agrega el estado real al final', () => {
    const json = armarOrdenPublicaJson('K7P2QX9M', fila({ estado: 'entregado' }), 'ARS', [{ estado: 'recibido', created_at: '2026-11-02T14:10:00Z' }]);
    expect(json.historial.map((h) => h.estado)).toEqual(['recibido', 'entregado']);
  });
  it('sin nota ni color ni presupuesto devuelve null, no texto vacío', () => {
    const json = armarOrdenPublicaJson('K7P2QX9M', fila({ nota_cliente: '  ', color: '', presupuesto_mano_obra: null, presupuesto_repuestos: null }), 'ARS', []);
    expect(json.nota_cliente).toBeNull();
    expect(json.color).toBeNull();
    expect(json.presupuesto).toBeNull();
  });
});

describe('avisos push', () => {
  const negocio = { nombre: 'iPetraStore', direccion: 'La Rioja 121' };
  it('valida el token de Expo', () => {
    expect(esTokenExpoValido('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    expect(esTokenExpoValido('ExpoPushToken[abc-DEF_123]')).toBe(true);
    expect(esTokenExpoValido('ExponentPushToken[]')).toBe(false);
    expect(esTokenExpoValido('cualquier cosa')).toBe(false);
    expect(esTokenExpoValido("ExponentPushToken[a'b]")).toBe(false);
    expect(esTokenExpoValido(123)).toBe(false);
    expect(esTokenExpoValido(undefined)).toBe(false);
  });
  it('los textos son los pedidos', () => {
    expect(textoPush('listo', 'iPhone 13 Pro', negocio)).toEqual({
      title: '¡Tu equipo está listo! 🎉',
      body: 'Tu iPhone 13 Pro ya está listo para retirar en iPetraStore, La Rioja 121.',
    });
    expect(textoPush('reparando', 'iPhone 13 Pro', negocio)).toEqual({ title: 'Estamos reparando tu iPhone 13 Pro', body: 'Te avisamos apenas esté listo.' });
    expect(textoPush('esperando_repuesto', 'iPhone 13 Pro', negocio)).toEqual({
      title: 'Esperando repuesto',
      body: 'Estamos esperando el repuesto para tu iPhone 13 Pro.',
    });
    expect(textoPush('entregado', 'iPhone 13 Pro', negocio)).toEqual({ title: '¡Gracias por elegir iPetraStore!', body: 'Cualquier cosa, escribinos.' });
  });
  it('sin dirección cargada no inventa una', () => {
    expect(textoPush('listo', 'iPhone 13', { nombre: 'iPetraStore', direccion: null })?.body).toBe('Tu iPhone 13 ya está listo para retirar en iPetraStore.');
  });
  it('recibido, diagnóstico y cancelado no avisan', () => {
    for (const e of ['recibido', 'diagnostico', 'cancelado'] as const) expect(textoPush(e, 'x', negocio)).toBeNull();
  });
  it('arma un mensaje por token con el código y el estado en data', () => {
    const msgs = armarMensajesPush(['ExponentPushToken[a]', 'ExponentPushToken[b]'], 'K7P2QX9M', 'listo', { title: 'T', body: 'B' });
    expect(msgs).toEqual([
      { to: 'ExponentPushToken[a]', sound: 'default', title: 'T', body: 'B', data: { codigo: 'K7P2QX9M', estado: 'listo' } },
      { to: 'ExponentPushToken[b]', sound: 'default', title: 'T', body: 'B', data: { codigo: 'K7P2QX9M', estado: 'listo' } },
    ]);
  });
  it('detecta los tokens que Expo dice que ya no existen', () => {
    const tokens = ['ExponentPushToken[a]', 'ExponentPushToken[b]', 'ExponentPushToken[c]'];
    const respuesta = {
      data: [
        { status: 'ok', id: '1' },
        { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } },
        { status: 'error', message: 'y', details: { error: 'MessageRateExceeded' } },
      ],
    };
    expect(tokensNoRegistrados(tokens, respuesta)).toEqual(['ExponentPushToken[b]']);
    expect(tokensNoRegistrados(tokens, null)).toEqual([]);
    expect(tokensNoRegistrados(tokens, { errors: [] })).toEqual([]);
  });
});
