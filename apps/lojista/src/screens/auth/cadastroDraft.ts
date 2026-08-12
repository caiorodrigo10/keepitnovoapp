/**
 * Shape do "rascunho de cadastro" do lojista — Story 0.8 (Task 2), atualizado
 * pela Story 3.4 (Passo 2 — dados operacionais).
 *
 * RECORTE PROVISÓRIO: `packages/core-data` (Story 0.2) já existe, mas o seu
 * `AuthPort`/`StorePort` não cobrem criação de estabelecimento (só leitura —
 * `AuthPort` é do domínio Cliente; `StorePort` não tem `create`). Criar uma
 * port real de "cadastro de lojista" está fora do escopo desta story (seria
 * antecipar decisão de arquitetura de uma story futura de auth do lojista).
 * Por isso este arquivo define SOMENTE o estado local do formulário
 * multi-step (Context em memória, perdido ao desmontar `AuthStack`) — não é
 * uma port, não persiste, não é consumido fora de `apps/lojista`.
 *
 * Nomes de campo espelham 1:1 as colunas de `estabelecimentos` (e
 * `estabelecimentos_horarios`) documentadas em
 * `docs/architecture/03-data-models.md#1.4`/`#1.5`, EXCETO:
 * - `hubPreferencialId`: campo exclusivo do mock/UI (ver Dev Notes da story,
 *   "Conflito schema vs. protótipo") — `estabelecimentos` não tem `hub_id`.
 * - `lat`/`lng`: **`number | null`** (Story 3.4 — "Geo adiado",
 *   `docs/architecture/03-data-models.md#1.4`) — input manual opcional do
 *   lojista, sem geocoding/mapa. `null` é o estado honesto de "não
 *   informado"; a Story 0.8 usava um placeholder fixo de coordenadas
 *   (Centro/SP) que era dado fabricado — removido por esta Story.
 */

export type ChavePixTipo = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

export interface HorarioDraft {
  dia_semana: number;
  aberto: boolean;
  hora_abre: string;
  hora_fecha: string;
}

export interface CadastroDraft {
  // Passo 1 — dados básicos
  nome_fantasia: string;
  cnpj: string;
  /** Campo exclusivo do mock/UI — não corresponde a coluna confirmada em `estabelecimentos`. */
  hubPreferencialId: string | null;
  logoLocalUri: string | null;
  /**
   * Coletados de verdade no Passo 1 desde a Story 3.2 (conta real do
   * lojista). Continuam no shape porque `CadastroDraftContext` é a fonte
   * única desses campos para o resto do wizard — a Story 3.4 só removeu a
   * REEXIBIÇÃO duplicada desses dois campos no Passo 2 (AC5), não os campos
   * do shape.
   */
  responsavel_nome: string;
  telefone: string;

  // Passo 2 — operacionais (Story 3.4, AC1) — `categoria` mudou de "Passo 1"
  // para cá nesta Story (gap conhecido herdado da Story 3.2, ver Dependencies).
  categoria: string | null;
  endereco: string;
  /** `null` = não informado pelo lojista (geo adiado — ver Dev Notes acima). */
  lat: number | null;
  /** `null` = não informado pelo lojista (geo adiado — ver Dev Notes acima). */
  lng: number | null;
  raio_atendimento_km: number;
  tempo_medio_entrega_min: number;
  taxa_deslocamento_reais: number;
  /** `null` = em branco, usa o global (`businessConfig.ticketMinimoReais`). */
  ticket_minimo_reais: number | null;

  // Passo 3 — recebimento + fachada + horários
  chave_pix: string;
  chave_pix_tipo: ChavePixTipo | null;
  foto_fachada_url: string | null;
  horarios: HorarioDraft[];
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;

export function diaSemanaLabel(dia: number): string {
  return DIAS_SEMANA[dia] ?? `Dia ${dia}`;
}

export function createEmptyHorarios(): HorarioDraft[] {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    aberto: dia_semana !== 0,
    hora_abre: '09:00',
    hora_fecha: '18:00',
  }));
}

export function createEmptyCadastroDraft(): CadastroDraft {
  return {
    nome_fantasia: '',
    cnpj: '',
    hubPreferencialId: null,
    logoLocalUri: null,

    responsavel_nome: '',
    telefone: '',

    categoria: null,
    endereco: '',
    lat: null,
    lng: null,
    raio_atendimento_km: 3,
    tempo_medio_entrega_min: 30,
    taxa_deslocamento_reais: 0,
    ticket_minimo_reais: null,

    chave_pix: '',
    chave_pix_tipo: null,
    foto_fachada_url: null,
    horarios: createEmptyHorarios(),
  };
}

/**
 * Re-exportada de `@keepit/config` (Story 3.4, AC1 — "dropdown com lista
 * aberta gerenciada em `packages/config/business-rules.ts`") para não
 * quebrar consumidores existentes fora do escopo desta Story
 * (`apps/lojista/src/screens/perfil/PerfilPublico.tsx`, Story 0.8) que já
 * importavam `CATEGORIA_OPTIONS` daqui. A definição canônica passou a viver
 * em `packages/config/src/business-rules.ts` — ver JSDoc lá para a
 * proveniência dos valores.
 */
export { CATEGORIA_OPTIONS } from '@keepit/config';

/**
 * Hubs de exemplo — campo exclusivo do mock/UI (ver `hubPreferencialId`).
 * IDs/nomes espelham `packages/core-data/src/mock/fixtures/hubs.ts`
 * (`hub-centro`, `hub-jardins`, `hub-vila-nova`) para reconciliação futura,
 * mas NÃO são lidos via `HubPort`/`useHubs()`: `apps/lojista/package.json`
 * ainda não declara `@keepit/core-data` como dependência (não instalada em
 * `node_modules` neste ambiente — não é permitido rodar `pnpm install` nesta
 * story) — reforça a decisão de recorte local da Task 2.
 */
export const HUB_OPTIONS = [
  { value: 'hub-centro', label: 'Hub Centro' },
  { value: 'hub-jardins', label: 'Hub Jardins' },
  { value: 'hub-vila-nova', label: 'Hub Vila Nova' },
] as const;

export const CHAVE_PIX_TIPO_OPTIONS: { value: ChavePixTipo; label: string }[] = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'aleatoria', label: 'Aleatória' },
];
