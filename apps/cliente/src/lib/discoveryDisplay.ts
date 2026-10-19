import { businessConfig } from '@keepit/config';
import type { Estabelecimento } from '@keepit/core-data';

/**
 * Dados de exibição usados pelas telas de Descoberta & Busca (Story 0.5) que
 * NÃO existem em `packages/core-data` e que esta story não pode inventar como
 * regra de negócio nem calcular localmente (proibido: Haversine).
 *
 * [AUTO-DECISION] Distância e rating não têm campo na port/fixture de
 * `Estabelecimento` (`docs/architecture/03-data-models.md` não lista
 * `rating`; distância real é geo/backend futuro) → mapear aqui, por
 * `estabelecimento.id`, os MESMOS valores estáticos já exibidos no protótipo
 * (`keepit-app/index.html`: "Farmácia Vida · 0,8 km · ★ 4.8",
 * "Loja Bem Vestir · 1,2 km · ★ 4.6"), em vez de calcular ou inventar
 * números novos. Reason: cumpre o AC1 ("distância pronta da fixture") e o
 * placeholder de rating (AC1) sem tocar `packages/core-data` (fora do escopo
 * desta story) nem violar Article IV (No Invention) — os valores usados são
 * os mesmos já congelados no protótipo, não inventados agora. Lojas sem
 * entrada aqui (fixtures futuras) caem no fallback.
 */
const DISTANCIA_KM_POR_ESTABELECIMENTO: Record<string, number> = {
  'estab-farmacia-vida': 0.8,
  'estab-bem-vestir': 1.2,
  'estab-conveniencia-24h': 0.5,
};

const RATING_POR_ESTABELECIMENTO: Record<string, number> = {
  'estab-farmacia-vida': 4.8,
  'estab-bem-vestir': 4.6,
  'estab-conveniencia-24h': 4.5,
};

/** Fallback para lojas fora do mapa acima (novas fixtures, testes). */
const DISTANCIA_KM_FALLBACK = 1.5;
const RATING_FALLBACK = 4.5;

/**
 * [AUTO-DECISION] Distância dos hubs (Story 0.6, `EscolhaRetirada`) — mesmo
 * princípio da distância de loja acima (Story 0.5): sem Haversine, sem
 * inventar número novo. Valores = os mesmos exibidos em
 * `cliente-05-escolha-ponto-retirada.png` ("Hub Centro · 0,8 km", "Hub
 * Jardins · 2,1 km", "Hub Vila Nova · 3,4 km"), mapeados pelo `id` real da
 * fixture (`packages/core-data/src/mock/fixtures/hubs.ts`).
 */
const DISTANCIA_KM_POR_HUB: Record<string, number> = {
  'hub-centro': 0.8,
  'hub-jardins': 2.1,
  'hub-vila-nova': 3.4,
};

/**
 * @deprecated Story 5.1.1 — substituída por distância REAL calculada via
 * Haversine (`apps/cliente/src/lib/distance.ts#formatDistanceKm`) a partir
 * de GPS/CEP em `EscolhaRetirada.tsx`. Mantida (não removida) porque
 * remover seria uma limpeza fora do escopo da Story 5.1.1 (evitar diff não
 * relacionado ao pedido do PO) — sem outros consumidores hoje.
 */
export function formatHubDistanciaKm(hubId: string): string {
  const km = DISTANCIA_KM_POR_HUB[hubId] ?? DISTANCIA_KM_FALLBACK;
  return `${km.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export function getDistanciaKm(estabelecimentoId: string): number {
  return DISTANCIA_KM_POR_ESTABELECIMENTO[estabelecimentoId] ?? DISTANCIA_KM_FALLBACK;
}

export function formatDistanciaKm(estabelecimentoId: string): string {
  return `${getDistanciaKm(estabelecimentoId).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/**
 * Placeholder visual (AC1) — não existe tabela de rating no schema.
 * MVP-mock — implementar sistema de avaliação na v2 (Story 5.8, AC2:
 * comentário alinhado ao texto literal do épico; nenhuma mudança de
 * comportamento ou de valores — ver Story 0.5 para a decisão original dos
 * valores por loja, preservada).
 */
export function getRatingPlaceholder(estabelecimentoId: string): number {
  return RATING_POR_ESTABELECIMENTO[estabelecimentoId] ?? RATING_FALLBACK;
}

export function selectFavoriteEntities<T extends { id: string }>(
  entities: readonly T[],
  favoriteIds: ReadonlySet<string>,
): T[] {
  return entities.filter((entity) => favoriteIds.has(entity.id));
}

/**
 * Resolve a lista persistida sem fabricar placeholders. Uma leitura ausente
 * é omitida somente quando o lote inteiro resolve; se qualquer leitura falha,
 * a Promise rejeita para a superfície manter seu último snapshot íntegro.
 */
export async function resolveFavoriteEntities<T>(
  favoriteIds: ReadonlySet<string>,
  getById: (id: string) => Promise<T | null>,
  include: (entity: T) => boolean = () => true,
): Promise<T[]> {
  const reads: Promise<T | null>[] = [...favoriteIds].map((id) => getById(id));
  const entities: (T | null)[] = await Promise.all(reads);
  return entities.filter((entity): entity is T => entity !== null && include(entity));
}

export function shouldResolveFavoriteSnapshot(
  loading: boolean,
  hasError: boolean,
  favoriteCollectionsChanged: boolean,
): boolean {
  return !loading && (!hasError || favoriteCollectionsChanged);
}

/**
 * Categorias exibidas na Home (Task 1) — valores alinhados a
 * `estabelecimentos.categoria` (schema real: 'farmacia', 'alimentacao',
 * 'vestuario', ...), rótulos fiéis ao protótipo (`Farmácia`, `Roupas`,
 * `Conveniência`).
 */
export interface CategoriaDiscovery {
  id: string;
  label: string;
}

export const CATEGORIAS_HOME: CategoriaDiscovery[] = [
  { id: 'farmacia', label: 'Farmácia' },
  { id: 'vestuario', label: 'Roupas' },
  { id: 'conveniencia', label: 'Conveniência' },
];

/** Tabs de filtro da Busca (Tasks 5/6) — "Tudo" + as mesmas categorias, rótulo curto fiel ao protótipo. */
export const CATEGORIAS_BUSCA: CategoriaDiscovery[] = [
  { id: 'todos', label: 'Tudo' },
  { id: 'farmacia', label: 'Farmácia' },
  { id: 'vestuario', label: 'Roupas' },
  { id: 'conveniencia', label: 'Conv.' },
];

/**
 * [AUTO-DECISION] Hub "atual" da Home → não existe estado global de hub
 * selecionado no Épico 0 (seleção real de hub é Story 0.6,
 * "Escolha o ponto de retirada"). Home usa o primeiro hub retornado por
 * `hub.port.listNearby()` como default local (útil apenas para popular
 * "Retirar em {hub}" e filtrar "lojas perto do hub" nesta story) — não
 * persistido entre sessões.
 */
export const DEFAULT_HUB_ID = 'hub-centro';

/**
 * Story 5.4 (AC4) — "Pedido mínimo: R$ X" em `Loja.tsx`. `Estabelecimento.
 * ticket_minimo_reais` já é `number | null` no domínio real (`store.port.ts`
 * — `null` = "usa o global `businessConfig.ticketMinimoReais`", COALESCE já
 * documentado no tipo, não um valor novo inventado por esta função). [IDS]
 * REUSE de `businessConfig` (mesma constante já usada por `Checkout.tsx`,
 * `cancelamentoPolicy.ts`), nunca um fallback hard-coded local.
 */
export function resolveTicketMinimoReais(estabelecimento: Pick<Estabelecimento, 'ticket_minimo_reais'>): number {
  return estabelecimento.ticket_minimo_reais ?? businessConfig.ticketMinimoReais;
}
