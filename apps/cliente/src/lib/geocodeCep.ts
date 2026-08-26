import { normalizeCep } from './cepMask';
import type { LatLng } from './distance';

/**
 * Geocoding de CEP via BrasilAPI CEP v2 — Story 5.1.1 (AC3, AC5).
 *
 * [IDS] CREATE — nenhuma chamada real a provedor de geocoding existia no
 * Cliente antes desta Story (o precedente citado nas Dev Notes,
 * `docs/PERGUNTAS_REGRAS_NEGOCIO.md`/`cnpj.ts`, é sobre validação de
 * CNPJ **sem** rede, não geocoding). Endpoint grátis, sem chave, mesmo
 * provedor (BrasilAPI) já decidido para outra validação do projeto.
 *
 * Segue o precedente de injeção de dependência de
 * `apps/cliente/src/lib/pedidoPolling.ts` (`deps` opcional com default
 * real) para ser testável sem `fetch` global no ambiente `vitest`
 * (`environment: 'node'`).
 *
 * **Degradação graciosa (AC3):** CEP inválido, resposta não-OK, timeout,
 * erro de rede ou payload sem coordenadas — tudo retorna `null`, nunca
 * lança. Quem chama decide o fallback (lista sem distância).
 */

const BRASILAPI_CEP_V2_URL = 'https://brasilapi.com.br/api/cep/v2';

/** [AUTO-DECISION] Timeout de 5s — ver Dev Notes da Story 5.1.1 ("nunca travar" tem prioridade sobre esperar a API lenta). */
const TIMEOUT_MS = 5000;

export interface GeocodeCepDeps {
  fetch?: typeof fetch;
}

interface BrasilApiCepV2Response {
  location?: {
    coordinates?: {
      latitude?: unknown;
      longitude?: unknown;
    };
  };
}

/**
 * BrasilAPI CEP v2 devolve as coordenadas como STRING
 * (`"latitude": "-22.90642"`), não número — por isso aceitamos os dois e
 * convertemos. Retorna `null` se não for um número finito.
 */
function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Geocodifica um CEP (mascarado ou só dígitos) para `{lat, lng}` via
 * BrasilAPI CEP v2. Retorna `null` (nunca lança) quando:
 * - o CEP não normaliza para 8 dígitos (não chama rede);
 * - a resposta HTTP não é OK;
 * - a requisição estoura o timeout de 5s ou falha por erro de rede;
 * - o payload não tem `location.coordinates.latitude`/`longitude`
 *   numéricos (nem todo CEP tem geolocalização conhecida na BrasilAPI).
 */
export async function geocodeCep(cepInput: string, deps: GeocodeCepDeps = {}): Promise<LatLng | null> {
  const cep = normalizeCep(cepInput);
  if (!cep) {
    return null;
  }

  const fetchImpl = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetchImpl(`${BRASILAPI_CEP_V2_URL}/${cep}`, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as BrasilApiCepV2Response;
    const latitude = toFiniteNumber(payload.location?.coordinates?.latitude);
    const longitude = toFiniteNumber(payload.location?.coordinates?.longitude);

    if (latitude === null || longitude === null) {
      return null;
    }

    return { lat: latitude, lng: longitude };
  } catch {
    // Rede indisponível, timeout (AbortError) ou JSON inválido — degradação graciosa (AC3).
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
