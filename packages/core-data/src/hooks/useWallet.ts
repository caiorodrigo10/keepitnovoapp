import { getDataClient } from '../index';
import type { CarteiraLojista } from '../ports/wallet.port';
import { useAsyncResource, type AsyncResourceState } from './useAsyncResource';

const EMPTY_CARTEIRA: CarteiraLojista = {
  estabelecimento_id: '',
  saldo_disponivel_reais: 0,
  saldo_bloqueado_reais: 0,
  total_sacado_reais: 0,
  total_debitado_reais: 0,
};

export function useWallet(estabelecimentoId: string): AsyncResourceState<CarteiraLojista> {
  const client = getDataClient();
  return useAsyncResource<CarteiraLojista>(
    () => client.wallet.getBalance(estabelecimentoId),
    EMPTY_CARTEIRA,
    [estabelecimentoId],
  );
}
