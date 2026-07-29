import type { AsyncCallOptions } from '../types';

/**
 * Domínio: view `carteira_lojista`.
 * [Source: docs/architecture/03-data-models.md#6.5]
 */
export interface CarteiraLojista {
  estabelecimento_id: string;
  saldo_disponivel_reais: number;
  saldo_bloqueado_reais: number;
  total_sacado_reais: number;
  total_debitado_reais: number;
}

export type SaqueStatus = 'solicitado' | 'processando' | 'concluido' | 'erro';

/**
 * Domínio: tabela `saques`.
 * [Source: docs/architecture/03-data-models.md#6.2]
 */
export interface Saque {
  id: string;
  estabelecimento_id: string;
  valor_reais: number;
  status: SaqueStatus;
  solicitado_em: string;
  processado_em: string | null;
  concluido_em: string | null;
}

export interface WalletPort {
  getBalance(estabelecimentoId: string, options?: AsyncCallOptions): Promise<CarteiraLojista>;
  /**
   * Valida `valorReais >= businessConfig.saqueMinimoReais` antes de criar o
   * saque — nunca hard-coded. Rejeita a Promise se o valor for menor.
   */
  requestWithdrawal(estabelecimentoId: string, valorReais: number, options?: AsyncCallOptions): Promise<Saque>;
  statement(estabelecimentoId: string, options?: AsyncCallOptions): Promise<Saque[]>;
}
