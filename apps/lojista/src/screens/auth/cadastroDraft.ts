/**
 * Shape do "rascunho de cadastro" do lojista — Story 0.8 (Task 2).
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
 * - `lat`/`lng`: sem geocoding real nesta story (fora de escopo do Épico 0);
 *   ficam com um valor fixo de exemplo, preenchido a partir do campo texto
 *   "Endereço" só visualmente.
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
  categoria: string | null;
  cnpj: string;
  /** Campo exclusivo do mock/UI — não corresponde a coluna confirmada em `estabelecimentos`. */
  hubPreferencialId: string | null;
  logoLocalUri: string | null;

  // Passo 2 — operacionais
  responsavel_nome: string;
  telefone: string;
  endereco: string;
  lat: number;
  lng: number;
  raio_atendimento_km: number;
  tempo_medio_entrega_min: number;

  // Passo 3 — recebimento + fachada + horários
  chave_pix: string;
  chave_pix_tipo: ChavePixTipo | null;
  foto_fachada_url: string | null;
  horarios: HorarioDraft[];
}

/** Coordenadas fixas de exemplo (Centro/SP) — ver nota sobre `lat`/`lng` acima. */
const LAT_LNG_PLACEHOLDER = { lat: -23.5505, lng: -46.6333 };

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
    categoria: null,
    cnpj: '',
    hubPreferencialId: null,
    logoLocalUri: null,

    responsavel_nome: '',
    telefone: '',
    endereco: '',
    lat: LAT_LNG_PLACEHOLDER.lat,
    lng: LAT_LNG_PLACEHOLDER.lng,
    raio_atendimento_km: 3,
    tempo_medio_entrega_min: 30,

    chave_pix: '',
    chave_pix_tipo: null,
    foto_fachada_url: null,
    horarios: createEmptyHorarios(),
  };
}

/**
 * Categorias reaproveitadas de `packages/core-data/src/mock/fixtures/estabelecimentos.ts`
 * — não inventadas por esta story (ver Dev Notes: "CHECK completo não
 * documentado — não inventar a lista completa"). Lista restrita aos valores
 * já existentes no fixture mock do Épico 0.
 */
export const CATEGORIA_OPTIONS = [
  { value: 'farmacia', label: 'Farmácia' },
  { value: 'vestuario', label: 'Vestuário' },
  { value: 'conveniencia', label: 'Conveniência' },
  { value: 'alimentacao', label: 'Alimentação' },
] as const;

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
