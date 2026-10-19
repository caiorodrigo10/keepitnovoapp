import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';
import { createClient } from '@keepit/supabase-client';

import type { CardRegistration, CardRegistrationState, CardValidationConfiguration, SavedCardSummary, SavedCardsPort } from '../ports/saved-cards.port';

const registrationStates = new Set<CardRegistrationState>(['criando', 'tokenizado', 'validando', 'estorno_pendente', 'concluida', 'recusada', 'reconciliacao']);

function invalidResponse(): Error {
  return new Error('RESPOSTA_INVALIDA');
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function parseCard(value: unknown): SavedCardSummary {
  const source = record(value);
  if (!source || typeof source.id !== 'string' || !source.id || typeof source.bandeira !== 'string' || !source.bandeira
    || typeof source.ultimo4 !== 'string' || !/^\d{4}$/.test(source.ultimo4) || typeof source.principal !== 'boolean') throw invalidResponse();
  return { id: source.id, bandeira: source.bandeira, ultimo4: source.ultimo4, principal: source.principal };
}

function parseCards(value: unknown): SavedCardSummary[] {
  if (!Array.isArray(value)) throw invalidResponse();
  return value.map(parseCard);
}

function parseConfiguration(value: unknown): CardValidationConfiguration {
  const source = record(value);
  if (!source || typeof source.disponivel !== 'boolean' || !positiveInteger(source.valorCentavos)) throw invalidResponse();
  return { disponivel: source.disponivel, valorCentavos: source.valorCentavos };
}

function parseRegistration(value: unknown): CardRegistration {
  const source = record(value);
  if (!source || typeof source.id !== 'string' || !source.id || !registrationStates.has(source.estado as CardRegistrationState)
    || !positiveInteger(source.valorCentavos)) throw invalidResponse();
  return { id: source.id, estado: source.estado as CardRegistrationState, valorCentavos: source.valorCentavos };
}

function explicitFailure(scope: string): Error {
  return new Error(`[core-data/supabase] ${scope} falhou.`);
}

export function createSavedCardsSupabase(client?: SupabaseClient<Database>): SavedCardsPort {
  const resolve = () => (client ??= createClient());

  async function listCards() {
    const { data, error } = await resolve().rpc('listar_cartoes_cliente');
    if (error) throw explicitFailure('listar_cartoes_cliente');
    return parseCards(data);
  }

  async function manageCards(name: 'definir_cartao_principal' | 'remover_cartao_cliente', args: { p_cartao_id: string; p_operacao_id: string }) {
    const { data, error } = await resolve().rpc(name, args);
    if (error) throw explicitFailure(name);
    return parseCards(data);
  }

  async function tokenize(body: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await resolve().functions.invoke('tokenize-card', { body });
    if (error || record(data)?.error) throw explicitFailure('tokenize-card');
    return data;
  }

  return {
    listar: () => listCards(),
    definirPrincipal: ({ cartaoId, operacaoId }) => manageCards('definir_cartao_principal', { p_cartao_id: cartaoId, p_operacao_id: operacaoId }),
    remover: ({ cartaoId, operacaoId }) => manageCards('remover_cartao_cliente', { p_cartao_id: cartaoId, p_operacao_id: operacaoId }),
    async consultarConfiguracao() {
      return parseConfiguration(await tokenize({ acao: 'configuracao' }));
    },
    async cadastrar({ operacaoId, cartao, titular }) {
      const { holderName, number, expiryMonth, expiryYear, ccv } = cartao;
      const { name, email, cpfCnpj, postalCode, addressNumber, phone } = titular;
      return parseRegistration(await tokenize({
        acao: 'cadastrar',
        operacao_id: operacaoId,
        cartao: { holderName, number, expiryMonth, expiryYear, ccv },
        titular: { name, email, cpfCnpj, postalCode, addressNumber, phone },
      }));
    },
    async consultarCadastro(operacaoId) {
      const { data, error } = await resolve().rpc('consultar_cadastro_cartao', { p_operacao_id: operacaoId });
      if (error) throw explicitFailure('consultar_cadastro_cartao');
      return data === null ? null : parseRegistration(data);
    },
  };
}
