import { describe, expect, it } from 'vitest';
import { esErrorTransitorioDeAuth } from './authTransitorio';

describe('errores transitorios de autenticación', () => {
  it('una caída de red o un 5xx no es "sin sesión"', () => {
    expect(esErrorTransitorioDeAuth({ name: 'AuthRetryableFetchError', status: 0 })).toBe(true);
    expect(esErrorTransitorioDeAuth({ name: 'AuthApiError', status: 502 })).toBe(true);
    expect(esErrorTransitorioDeAuth({ name: 'AuthApiError', status: 429 })).toBe(true);
    expect(esErrorTransitorioDeAuth({ status: 0 })).toBe(true);
  });
  it('sin cookie, o con un token inválido, vencido o revocado, sí es "sin sesión"', () => {
    expect(esErrorTransitorioDeAuth({ name: 'AuthSessionMissingError', status: 400 })).toBe(false);
    expect(esErrorTransitorioDeAuth({ name: 'AuthApiError', status: 401 })).toBe(false);
    expect(esErrorTransitorioDeAuth({ name: 'AuthApiError', status: 403 })).toBe(false);
  });
  it('sin error o sin dato no se considera transitorio', () => {
    expect(esErrorTransitorioDeAuth(null)).toBe(false);
    expect(esErrorTransitorioDeAuth(undefined)).toBe(false);
    expect(esErrorTransitorioDeAuth({ name: 'Error' })).toBe(false);
  });
});
