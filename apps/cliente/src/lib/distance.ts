/**
 * Haversine — Story 5.1.1 (AC2, AC5).
 *
 * [IDS] CREATE — nenhuma lib de cálculo de distância geográfica existia em
 * `apps/cliente` (a distância exibida até aqui era estática, ver
 * `discoveryDisplay.ts#formatHubDistanciaKm`, agora `@deprecated`). Função
 * PURA (sem I/O, sem `Platform`, sem `fetch`) — mesmo padrão de módulo
 * testável de `apps/cliente/src/lib/` (ex.: `cpf.ts`, `telefoneMask.ts`).
 *
 * O cálculo aqui é client-side, só para o demo/mock (ver Dev Notes da Story
 * 5.1.1, seção "Produção futura" — em produção migra para Edge Function,
 * FR59).
 */

const RAIO_TERRA_KM = 6371;

export interface LatLng {
  lat: number;
  lng: number;
}

function toRadians(graus: number): number {
  return (graus * Math.PI) / 180;
}

/**
 * Distância em linha reta (km) entre dois pontos geográficos, fórmula de
 * Haversine padrão (raio da Terra ~6371 km). Retorna `0` para o mesmo ponto.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return RAIO_TERRA_KM * c;
}

/**
 * Formata km no padrão pt-BR "X,X km" — mesmo número de casas decimais já
 * usado em `discoveryDisplay.ts` (1 casa, vírgula decimal).
 */
export function formatDistanceKm(km: number): string {
  return `${km.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}
