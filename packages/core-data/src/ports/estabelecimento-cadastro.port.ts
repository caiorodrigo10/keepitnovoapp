import type { AsyncCallOptions } from '../types';
import type { EstabelecimentoHorario, EstabelecimentoStatus } from './store.port';

/**
 * Story 3.5 (AC2, AC3, AC4) — [IDS] CREATE, [AUTO-DECISION].
 *
 * [AUTO-DECISION] Port dedicada (`EstabelecimentoCadastroPort`), não
 * extensão de `StorePort` → (reason: `StorePort.Estabelecimento`
 * (`ports/store.port.ts`) é o tipo de domínio da DESCOBERTA — consumido por
 * telas do Cliente — e modela só o subconjunto público de `estabelecimentos`
 * (sem `cnpj`, `dono_user_id`, `responsavel_nome`, `telefone`, `chave_pix`).
 * Sobrecarregar `StorePort`/`Estabelecimento` com os campos privados do
 * cadastro do lojista vazaria dado sensível para um tipo que hoje só circula
 * em telas do Cliente. Mesmo raciocínio já registrado em
 * `LojistaAuthPort` (Story 3.2, JSDoc de `ports/lojista-auth.port.ts`) para
 * não produzir um "Cliente/Estabelecimento fantasma" — aqui, um
 * "Estabelecimento de descoberta fantasma" com campos que a Descoberta nunca
 * deveria enxergar.
 *
 * Mecanismo de escrita atômica (RPC única `criar_estabelecimento_completo`,
 * migration `20260812123048_rpc_criar_estabelecimento_completo.sql`) e o
 * bucket de Storage `fachadas` (migration
 * `20260812123049_storage_bucket_fachadas.sql`) já foram decididos e
 * aplicados por @data-engineer antes desta implementação — esta port só
 * formaliza o contrato de app para os dois métodos que a Story 3.5 (Passo 3
 * do cadastro) precisa: upload da fachada (AC2) e a chamada da RPC (AC3/AC4).
 */

/** Espelha o CHECK `chave_pix_tipo` de `estabelecimentos` (`03-data-models.md#1.4`). */
export type ChavePixTipoCadastro = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

/**
 * Uma das 7 linhas de `estabelecimentos_horarios` (`dia_semana` 0=domingo..6=sábado).
 * `hora_abre`/`hora_fecha` usam `''` (nunca `null`) quando `aberto = false` — o
 * mesmo contrato que a RPC espera (`NULLIF(v_dia->>'hora_abre', '')::time`,
 * migration `20260812123048`).
 */
export interface HorarioCadastroInput {
  dia_semana: number;
  aberto: boolean;
  hora_abre: string;
  hora_fecha: string;
}

/**
 * Input agregado dos 3 passos do wizard de cadastro do lojista — union 1:1
 * com os parâmetros `p_*` de `criar_estabelecimento_completo`. `dono_user_id`
 * NÃO é campo aqui (nunca vem de fora — a RPC sempre usa `auth.uid()`
 * internamente, ver migration `20260812123048`, item "DEFESA").
 */
export interface CriarEstabelecimentoInput {
  nome_fantasia: string;
  cnpj: string;
  responsavel_nome: string;
  telefone: string;
  categoria: string;
  endereco: string;
  /** `null` = não informado (geo adiado — Story 3.4). */
  lat: number | null;
  /** `null` = não informado (geo adiado — Story 3.4). */
  lng: number | null;
  /** `null` = não informado (NULLABLE no piloto — `03-data-models.md#1.4`). */
  raio_atendimento_km: number | null;
  tempo_medio_entrega_min: number;
  taxa_deslocamento_reais: number;
  /** `null` = em branco, usa o global (`businessConfig.ticketMinimoReais`). */
  ticket_minimo_reais: number | null;
  chave_pix: string;
  chave_pix_tipo: ChavePixTipoCadastro;
  /**
   * PATH do objeto no bucket `fachadas` (ex.: `"{uid}/fachada.jpg"`), NUNCA
   * uma URL assinada — ver JSDoc de `uploadFachada` abaixo para o motivo.
   * `null` = lojista não enviou foto (AC2, campo opcional).
   */
  foto_fachada_url: string | null;
  /** Não coletado por nenhum passo do wizard nesta Story — sempre `null`. */
  descricao: string | null;
  /** Exatamente 7 entradas (uma por `dia_semana`, 0..6) — a RPC rejeita qualquer outra contagem (`HORARIOS_INVALIDOS`). */
  horarios: HorarioCadastroInput[];
}

export interface EstabelecimentoCadastroResult {
  /** `id` do estabelecimento criado/atualizado (reenvio idempotente — AC3). */
  id: string;
}

/**
 * Story 3.10 (AC2-AC6) — [IDS] ADAPT de `EstabelecimentoCadastroPort`, não
 * port nova → (reason: a Story 3.10, Dependencies, delega explicitamente
 * "onde este método mora (extensão de `LojistaAuthPort`, de `StorePort`, ou
 * port nova)" a @architect; sem sessão dedicada nesta execução, sigo o
 * mesmo padrão de delegação das Stories 3.3/3.5/3.7. `StorePort.getById`
 * exige um `id` que o app não tem antes de saber se existe algum
 * estabelecimento (mesmo motivo já documentado ali). `EstabelecimentoCadastroPort`
 * é a port MAIS coesa para esta leitura: já é o único lugar que fala do
 * "estabelecimento do lojista autenticado" no schema privado (`criarCadastro`
 * grava exatamente essa linha; `getMeuEstabelecimento` só lê o que ela
 * escreveu) — reaproveitar `LojistaAuthPort` misturaria identidade de auth
 * com domínio de estabelecimento).
 *
 * `status` reaproveita `EstabelecimentoStatus` de `store.port.ts` (mesmo
 * CHECK constraint, `[IDS] REUSE` — não duplica o union type).
 */
export interface MeuEstabelecimentoStatus {
  status: EstabelecimentoStatus;
  motivo_rejeicao: string | null;
}

/** Extensões aceitas pelo bucket `fachadas` (`allowed_mime_types`, migration `20260812123049`). */
export type FachadaExt = 'jpg' | 'jpeg' | 'png' | 'webp';

/**
 * Story 3.11 (AC1, AC4). Subconjunto do PRÓPRIO `estabelecimentos` exibido em
 * `PerfilPublico.tsx` — deliberadamente MENOR que `MeuEstabelecimentoStatus`
 * (Story 3.10, que só cobre `status`/`motivo_rejeicao` para o roteamento
 * pós-login) e menor que `EstabelecimentoAdmin` (Story 3.7, visão do Admin
 * com campos privados de compliance como `dados_receita`/`chave_pix`, que
 * esta tela do PRÓPRIO dono não precisa e não deveria misturar).
 *
 * [AUTO-DECISION] Método/tipo NOVOS nesta mesma port (`getMeuPerfil`), não
 * uma extensão de `MeuEstabelecimentoStatus` → (reason: `MeuEstabelecimentoStatus`
 * já é consumida por `Login.tsx`/`loginRouting.ts` com um contrato `toEqual`
 * exato nos testes da Story 3.10 — adicionar campos ali obrigaria a INCLUIR
 * uma leitura de `categoria`/`descricao`/fachada/horários em TODO login, só
 * para uma tela que a maioria dos logins nem visita. Método dedicado mantém
 * o roteamento pós-login (Story 3.10) leve e sem regressão, e mantém esta
 * Story coesa com o restante da port (que já é "o que o lojista autenticado
 * pode ler/escrever do PRÓPRIO estabelecimento").
 */
export interface MeuPerfilLojista {
  nome_fantasia: string;
  categoria: string;
  descricao: string | null;
  /**
   * URL assinada de curta expiração (bucket privado `fachadas`, mesmo padrão
   * de `EstabelecimentoAdmin.foto_fachada_url_assinada`, Story 3.7) — nunca
   * uma URL pública permanente. `null` = sem foto cadastrada OU falha ao
   * assinar (degradação graciosa, mesmo padrão REL-001 da Story 3.7/3.11
   * AC4 — nunca derruba a leitura do restante do perfil).
   */
  foto_fachada_url_assinada: string | null;
  /** Resumo somente-leitura de `estabelecimentos_horarios` — `[]` quando nenhuma linha existe (estado vazio honesto, AC1). */
  horarios: EstabelecimentoHorario[];
}

/**
 * Story 3.11 (AC2, AC3). Subconjunto REALMENTE editável por "Salvar" em
 * `PerfilPublico.tsx` — nunca `nome_fantasia`/`cnpj`/`status` (AC2, defesa em
 * profundidade na camada de app, mesmo que RLS/trigger não bloqueiem todos
 * tecnicamente).
 *
 * [AUTO-DECISION] `foto_fachada_url` NÃO faz parte deste input → (reason:
 * `apps/lojista` não tem `expo-image-picker` — Scope da Story 3.11,
 * "Excluído" — então o toggle de "Foto da fachada" na UI nunca produz uma
 * URI real, só o marcador local herdado da Story 0.8
 * (`'local-placeholder'`). Persistir esse marcador na coluna real
 * `foto_fachada_url` corromperia o dado para sempre com uma string que não é
 * um path de Storage válido — pior do que não persistir nada. Quando um
 * picker de imagem real existir, este input ganha um campo dedicado que
 * primeiro passa por `uploadFachada` (já existente nesta port) para obter um
 * PATH real, nunca a URI local direto.).
 */
export interface AtualizarMeuPerfilInput {
  categoria: string;
  descricao: string | null;
}

export interface FachadaUploadInput {
  /**
   * URI local de um arquivo de imagem de verdade (ex.: `file://...`,
   * `content://...`, `data:image/...`). NUNCA o marcador
   * `'local-placeholder'` herdado da Story 0.8 — quem chama este método
   * (`CadastroPasso3.tsx`) é responsável por filtrar o placeholder antes de
   * invocar `uploadFachada` (ver Dev Notes da Story 3.5 sobre a ausência de
   * `expo-image-picker` neste workspace).
   */
  uri: string;
  ext: FachadaExt;
}

export interface EstabelecimentoCadastroPort {
  /**
   * Upload da foto de fachada (AC2) — bucket privado `fachadas`, path
   * `${auth.uid()}/fachada.<ext>` (convenção fixada pela migration
   * `20260812123049_storage_bucket_fachadas.sql`, exigida pelas policies de
   * Storage — a policy só permite gravar sob a própria pasta do uid).
   *
   * [AUTO-DECISION] Retorna o PATH do objeto, NÃO uma URL assinada →
   * (reason: comentário normativo de @data-engineer na própria migration —
   * "a URL final vai em estabelecimentos.foto_fachada_url (path do objeto,
   * não URL pública)". Persistir uma signed URL de expiração curta (5-60min,
   * `05-security.md §6.7`) diretamente na coluna a tornaria inútil poucos
   * minutos após o cadastro; o padrão arquitetural é gerar a signed URL sob
   * demanda no momento da leitura (ex.: Admin, Story 3.7+), não no momento
   * da escrita. Seguido à risca, não reinventado por este @dev.
   */
  uploadFachada(input: FachadaUploadInput, options?: AsyncCallOptions): Promise<string>;

  /**
   * Chama a RPC atômica `criar_estabelecimento_completo` (AC3/AC4) — cria ou
   * atualiza (upsert idempotente por `dono_user_id`, reenvio-como-recuperação)
   * o estabelecimento `em_analise` do lojista autenticado + as 7 linhas de
   * `estabelecimentos_horarios`, numa única transação server-side. Nunca
   * resolve com sucesso simulado: qualquer falha (rede, RLS, violação de
   * constraint, ou um dos 4 erros nomeados da RPC) rejeita a Promise — ver
   * as classes de erro em `../supabase/estabelecimento-cadastro-errors.ts`.
   */
  criarCadastro(
    input: CriarEstabelecimentoInput,
    options?: AsyncCallOptions,
  ): Promise<EstabelecimentoCadastroResult>;

  /**
   * Story 3.10 (AC2-AC6). Lê `status`/`motivo_rejeicao` do PRÓPRIO
   * estabelecimento do lojista autenticado atual — sob a policy
   * `publico_ve_ativos` já aplicada na Story 3.5 (`dono_user_id = auth.uid()`,
   * sem filtro de status; nenhuma migration nova). `null` = nenhuma linha
   * para o `dono_user_id` atual (0 linhas — AC4, o lojista completou só o
   * Passo 1 da Story 3.2 — NUNCA tratado como erro). Qualquer falha real de
   * rede/RLS/autenticação rejeita a Promise, nunca é confundida com "0
   * linhas" (AC6 — a rota pós-login depende só da resposta real).
   */
  getMeuEstabelecimento(options?: AsyncCallOptions): Promise<MeuEstabelecimentoStatus | null>;

  /**
   * Story 3.11 (AC1, AC4). Lê o subconjunto de perfil público do PRÓPRIO
   * estabelecimento do lojista autenticado atual — sob a mesma RLS
   * `publico_ve_ativos` (`dono_user_id = auth.uid()`, Story 3.5) já usada por
   * `getMeuEstabelecimento`. `null` = nenhuma linha para o `dono_user_id`
   * atual (mesma semântica honesta de "0 linhas", nunca um erro) OU sem
   * sessão. Qualquer falha real de rede/RLS na leitura principal rejeita a
   * Promise; falha ao assinar a foto degrada para `foto_fachada_url_assinada:
   * null` sem derrubar o restante (AC4).
   */
  getMeuPerfil(options?: AsyncCallOptions): Promise<MeuPerfilLojista | null>;

  /**
   * Story 3.11 (AC3). Persiste `categoria`/`descricao` do PRÓPRIO
   * estabelecimento via `UPDATE` sob a policy `lojista_atualiza_proprio`
   * (`docs/architecture/05-security.md §3.4`). Nunca envia
   * `nome_fantasia`/`cnpj`/`status` no payload (AC2). Nunca resolve com
   * sucesso simulado — qualquer falha (rede, RLS, constraint) rejeita a
   * Promise, sem persistir nada.
   */
  atualizarMeuPerfil(input: AtualizarMeuPerfilInput, options?: AsyncCallOptions): Promise<MeuPerfilLojista>;

  /**
   * Stories 4.3/4.4 (Dependencies) — [AUTO-DECISION] leitura leve dedicada,
   * ADAPT desta port (REUSE do mesmo padrão `dono_user_id = auth.uid()` já
   * usado por `getMeuEstabelecimento`/`getMeuPerfil`) → (reason: nem
   * `getMeuEstabelecimento` (`status`/`motivo_rejeicao`) nem `getMeuPerfil`
   * (`nome_fantasia`/`categoria`/...) devolvem o `id` do estabelecimento —
   * `ProductCatalogContext` (Épico 4, apps/lojista) precisa só do `id` para
   * resolver `estabelecimento_id` ao listar/criar produtos, sem reler o
   * perfil inteiro (nem os horários) a cada chamada. Alargar
   * `MeuEstabelecimentoStatus` com um campo `id` quebraria o contrato exato
   * (`toEqual`) já fixado pelos testes da Story 3.10 (`Login.tsx`/
   * `loginRouting.ts`) — um método dedicado evita essa colisão sem tocar
   * artefatos de outra Story. `null` = mesma semântica honesta de "0 linhas
   * OU sem sessão" já usada por `getMeuEstabelecimento`/`getMeuPerfil`,
   * nunca um erro. Revisão formal de @architect sobre se este método
   * deveria viver em `StorePort.getById` (ou outro desenho) fica como
   * débito, não bloqueante das Stories 4.3/4.4.
   */
  getMeuEstabelecimentoId(options?: AsyncCallOptions): Promise<string | null>;
}
