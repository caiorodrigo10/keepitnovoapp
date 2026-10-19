import { describe, expect, it, vi } from 'vitest';

import { geocodeCep } from './geocodeCep';

/**
 * Story 5.1.1 (AC3, AC5). `fetch` é mockado via `deps.fetch` — mesmo padrão
 * de injeção de dependência de `pedidoPolling.test.ts` (`deps.setInterval`).
 * Cobre a superfície de degradação graciosa exigida pelo AC3: nunca lança.
 */
describe('geocodeCep (Story 5.1.1, AC3/AC5)', () => {
  it('retorna {lat,lng} quando o CEP é válido e a resposta tem coordenadas', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        location: { coordinates: { latitude: -23.0181, longitude: -43.4521 } },
      }),
    });

    const result = await geocodeCep('22631-000', { fetch: fetchMock as unknown as typeof fetch });

    expect(result).toEqual({ lat: -23.0181, lng: -43.4521 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://brasilapi.com.br/api/cep/v2/22631000',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('aceita coordenadas como STRING (formato real da BrasilAPI CEP v2)', async () => {
    // BrasilAPI devolve latitude/longitude como string, não número — regressão real
    // vista no demo (o parser antes exigia typeof 'number' e rejeitava tudo).
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        location: { type: 'Point', coordinates: { longitude: '-43.3017428', latitude: '-23.0146611' } },
      }),
    });

    const result = await geocodeCep('22620-171', { fetch: fetchMock as unknown as typeof fetch });

    expect(result).toEqual({ lat: -23.0146611, lng: -43.3017428 });
  });

  it('retorna null quando o CEP é válido mas a resposta não tem coordenadas', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ location: {} }),
    });

    const result = await geocodeCep('22631000', { fetch: fetchMock as unknown as typeof fetch });

    expect(result).toBeNull();
  });

  it('retorna null para CEP inválido, sem chamar fetch', async () => {
    const fetchMock = vi.fn();

    const result = await geocodeCep('123', { fetch: fetchMock as unknown as typeof fetch });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retorna null quando a resposta HTTP não é OK', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });

    const result = await geocodeCep('22631000', { fetch: fetchMock as unknown as typeof fetch });

    expect(result).toBeNull();
  });

  it('retorna null em erro de rede (fetch rejeita) — nunca lança', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(geocodeCep('22631000', { fetch: fetchMock as unknown as typeof fetch })).resolves.toBeNull();
  });

  it('retorna null quando o JSON da resposta é inválido — nunca lança', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('invalid json');
      },
    });

    await expect(geocodeCep('22631000', { fetch: fetchMock as unknown as typeof fetch })).resolves.toBeNull();
  });
});
