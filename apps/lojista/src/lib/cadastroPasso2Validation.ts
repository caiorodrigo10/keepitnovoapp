/**
 * Validação client-side do Cadastro passo 2 (dados operacionais) — Story 3.4
 * (AC2).
 *
 * [IDS] CREATE — mesmo padrão local-por-story de `./cnpj.ts` (Story 3.3) e
 * `./telefoneMask.ts` (Story 3.2): função pura, síncrona, sem chamada de
 * rede nem dependência de `@keepit/core-data`, testável isoladamente.
 *
 * Ranges (AC1/AC2, Épico 3 Story 3.4): raio 1-15 km, tempo 5-120 min, taxa
 * 0-30 R$, ticket mínimo (se informado) >= 5 R$. Coerência de geo (ajuste
 * @po, 2026-08-12): `lat`/`lng` — ambas informadas ou ambas em branco;
 * meia-coordenada é rejeitada (não tem valor para a retomada geográfica
 * futura, Story 3.5 nunca persistiria um par incompleto).
 */

export interface CadastroPasso2ValidationInput {
  raio_atendimento_km: number;
  tempo_medio_entrega_min: number;
  taxa_deslocamento_reais: number;
  /** `null` = deixado em branco pelo lojista (usa o global — ver `businessConfig.ticketMinimoReais`). */
  ticket_minimo_reais: number | null;
  /** `null` = deixado em branco (geo adiado — ver Dev Notes da Story 3.4, "Geo adiado"). */
  lat: number | null;
  /** `null` = deixado em branco (geo adiado). */
  lng: number | null;
}

export interface CadastroPasso2Errors {
  raio_atendimento_km?: string;
  tempo_medio_entrega_min?: string;
  taxa_deslocamento_reais?: string;
  ticket_minimo_reais?: string;
  /** Texto digitado em latitude não é um número válido (ex.: typo). */
  lat?: string;
  /** Texto digitado em longitude não é um número válido (ex.: typo). */
  lng?: string;
  /** Erro de coerência "ambas ou nenhuma" — não pertence a um campo único (lat OU lng), exibido junto ao bloco de geo. */
  geo?: string;
}

export const RAIO_ATENDIMENTO_MIN_KM = 1;
export const RAIO_ATENDIMENTO_MAX_KM = 15;
export const TEMPO_MEDIO_MIN_MIN = 5;
export const TEMPO_MEDIO_MAX_MIN = 120;
export const TAXA_DESLOCAMENTO_MIN_REAIS = 0;
export const TAXA_DESLOCAMENTO_MAX_REAIS = 30;
export const TICKET_MINIMO_MIN_REAIS = 5;

/**
 * Valida os campos operacionais do Passo 2. Retorna um objeto de erros
 * (chave presente = campo inválido); objeto vazio = formulário válido.
 * Não lança exceção — o chamador decide como bloquear "Continuar".
 */
export function validateCadastroPasso2(input: CadastroPasso2ValidationInput): CadastroPasso2Errors {
  const errors: CadastroPasso2Errors = {};

  if (
    !Number.isFinite(input.raio_atendimento_km) ||
    input.raio_atendimento_km < RAIO_ATENDIMENTO_MIN_KM ||
    input.raio_atendimento_km > RAIO_ATENDIMENTO_MAX_KM
  ) {
    errors.raio_atendimento_km = `Informe um raio entre ${RAIO_ATENDIMENTO_MIN_KM} e ${RAIO_ATENDIMENTO_MAX_KM} km.`;
  }

  if (
    !Number.isFinite(input.tempo_medio_entrega_min) ||
    input.tempo_medio_entrega_min < TEMPO_MEDIO_MIN_MIN ||
    input.tempo_medio_entrega_min > TEMPO_MEDIO_MAX_MIN
  ) {
    errors.tempo_medio_entrega_min = `Informe um tempo entre ${TEMPO_MEDIO_MIN_MIN} e ${TEMPO_MEDIO_MAX_MIN} min.`;
  }

  if (
    !Number.isFinite(input.taxa_deslocamento_reais) ||
    input.taxa_deslocamento_reais < TAXA_DESLOCAMENTO_MIN_REAIS ||
    input.taxa_deslocamento_reais > TAXA_DESLOCAMENTO_MAX_REAIS
  ) {
    errors.taxa_deslocamento_reais = `Informe uma taxa entre R$ ${TAXA_DESLOCAMENTO_MIN_REAIS} e R$ ${TAXA_DESLOCAMENTO_MAX_REAIS}.`;
  }

  if (input.ticket_minimo_reais !== null) {
    if (!Number.isFinite(input.ticket_minimo_reais) || input.ticket_minimo_reais < TICKET_MINIMO_MIN_REAIS) {
      errors.ticket_minimo_reais = `Se informado, o ticket mínimo deve ser pelo menos R$ ${TICKET_MINIMO_MIN_REAIS}.`;
    }
  }

  const latValid = input.lat === null || Number.isFinite(input.lat);
  const lngValid = input.lng === null || Number.isFinite(input.lng);
  if (!latValid) errors.lat = 'Latitude inválida — use um número (ou deixe em branco).';
  if (!lngValid) errors.lng = 'Longitude inválida — use um número (ou deixe em branco).';

  // Coerência "ambas ou nenhuma" só é avaliada quando os dois campos, se
  // preenchidos, já são números válidos — evita empilhar o erro de geo em
  // cima de um erro de formato que já bloqueia "Continuar" sozinho.
  if (latValid && lngValid) {
    const hasLat = input.lat !== null;
    const hasLng = input.lng !== null;
    if (hasLat !== hasLng) {
      errors.geo = 'Informe latitude e longitude juntas, ou deixe as duas em branco.';
    }
  }

  return errors;
}

export function isCadastroPasso2Valido(errors: CadastroPasso2Errors): boolean {
  return Object.keys(errors).length === 0;
}

/**
 * Converte o texto digitado nos campos opcionais de latitude/longitude para
 * `number | null`. String em branco (ou só espaços) vira `null` (geo
 * adiado — avança normalmente). Aceita vírgula decimal (`-23,55`) além de
 * ponto, e um texto não numérico é devolvido como `NaN` — a validação de
 * coerência acima trata `NaN` como "informado, porém inválido" (não é
 * silenciosamente tratado como em branco, para não mascarar um typo do
 * lojista como se o campo estivesse vazio).
 */
export function parseCoordenadaOpcional(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  return Number(trimmed.replace(',', '.'));
}
