import type { CardInput, HolderInput } from './payment.port';

/** Metadados públicos de um cartão salvo; nunca inclui token nem customer. */
export interface SavedCardSummary {
  id: string;
  bandeira: string;
  ultimo4: string;
  principal: boolean;
}

export interface CardValidationConfiguration {
  disponivel: boolean;
  valorCentavos: number;
}

export type CardRegistrationState = 'criando' | 'tokenizado' | 'validando' | 'estorno_pendente' | 'concluida' | 'recusada' | 'reconciliacao';

/** Projeção pública de uma validação de cartão; sem token, customer ou formulário. */
export interface CardRegistration {
  id: string;
  estado: CardRegistrationState;
  valorCentavos: number;
}

export interface SavedCardsPort {
  listar(): Promise<SavedCardSummary[]>;
  definirPrincipal(input: { cartaoId: string; operacaoId: string }): Promise<SavedCardSummary[]>;
  remover(input: { cartaoId: string; operacaoId: string }): Promise<SavedCardSummary[]>;
  consultarConfiguracao(): Promise<CardValidationConfiguration>;
  cadastrar(input: { operacaoId: string; cartao: CardInput; titular: HolderInput }): Promise<CardRegistration>;
  consultarCadastro(operacaoId: string): Promise<CardRegistration | null>;
}
