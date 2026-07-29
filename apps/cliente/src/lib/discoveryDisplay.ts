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

/** Placeholder visual (AC1) — não existe tabela de rating no schema. */
export function getRatingPlaceholder(estabelecimentoId: string): number {
  return RATING_POR_ESTABELECIMENTO[estabelecimentoId] ?? RATING_FALLBACK;
}

/**
 * [AUTO-DECISION] "Favoritos" da Home (Task 1) → não existe port de
 * favoritos no Épico 0 (Dev Notes da Story 0.5 já antecipa isso e autoriza
 * usar "um subconjunto de `store.port` marcado como favorito na fixture").
 * Fixado como a loja com maior detalhe no protótipo ("Farmácia Vida", único
 * estabelecimento com catálogo/pedido detalhados no protótipo) — não
 * persistido, não editável nesta story (favoritar de verdade é fora de
 * escopo do Épico 0).
 */
const FAVORITOS_IDS = new Set(['estab-farmacia-vida']);

export function isFavorito(estabelecimentoId: string): boolean {
  return FAVORITOS_IDS.has(estabelecimentoId);
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
