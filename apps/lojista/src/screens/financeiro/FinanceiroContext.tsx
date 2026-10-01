import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { getDataClient, type CarteiraLojista, type Repasse, type Saque } from '@keepit/core-data';

import { useCurrentStore } from '../../context/CurrentStoreContext';
import { paidThisMonth } from './financeiroPayoutPresentation';

const EMPTY_CARTEIRA: CarteiraLojista = {
  estabelecimento_id: '',
  saldo_disponivel_reais: 0,
  saldo_bloqueado_reais: 0,
  total_sacado_reais: 0,
  total_debitado_reais: 0,
};

interface FinanceiroContextValue {
  carteira: CarteiraLojista;
  carteiraLoading: boolean;
  carteiraError: Error | null;
  reload: () => void;

  saquesRecentes: Saque[];
  saquesLoading: boolean;
  /** Total de PIX confirmados no mês corrente. */
  sacadoNoMesReais: number;
  repasses: Repasse[];
  repassesLoading: boolean;
  repassesError: Error | null;
}

const FinanceiroContext = createContext<FinanceiroContextValue | null>(null);

/**
 * Provider do domínio Financeiro — Story 0.11 (Task 6). Envolve `FinanceiroStack`
 * para compartilhar carteira e histórico entre Dashboard, Vendas, Carteira e
 * ExtratoFinanceiro — mesmo padrão de
 * `OrdersContext`/`ProductCatalogContext` (Stories 0.9/0.10).
 *
 * Consome `wallet.port` (via `getDataClient()`, nunca a implementação mock
 * diretamente — Task 6) para saldo e saques. "Vendas por período", "Top
 * produtos" e "Extrato mensal" NÃO passam por este provider — cada tela chama
 * `client.analytics` diretamente (via `financeiroPresentation.ts`, Story
 * 1.10 Task 7), pois são dados puramente de exibição sem mutação/estado
 * compartilhado.
 */
export function FinanceiroProvider({ children }: PropsWithChildren) {
  const { id: storeId } = useCurrentStore();
  const [carteira, setCarteira] = useState<CarteiraLojista>(EMPTY_CARTEIRA);
  const [carteiraLoading, setCarteiraLoading] = useState(true);
  const [carteiraError, setCarteiraError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [saques, setSaques] = useState<Saque[]>([]);
  const [saquesLoading, setSaquesLoading] = useState(true);
  const [repasses, setRepasses] = useState<Repasse[]>([]);
  const [repassesLoading, setRepassesLoading] = useState(true);
  const [repassesError, setRepassesError] = useState<Error | null>(null);


  useEffect(() => {
    if (!storeId) {
      setCarteira(EMPTY_CARTEIRA);
      setSaques([]);
      setRepasses([]);
      setCarteiraLoading(false);
      setSaquesLoading(false);
      setRepassesLoading(false);
      return;
    }
    let cancelled = false;
    const client = getDataClient();

    setCarteira(EMPTY_CARTEIRA);
    setSaques([]);
    setRepasses([]);
    setCarteiraLoading(true);
    setCarteiraError(null);
    client.wallet
      .getBalance(storeId)
      .then((resultado) => {
        if (!cancelled) setCarteira(resultado);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCarteiraError(error instanceof Error ? error : new Error(String(error)));
      })
      .finally(() => {
        if (!cancelled) setCarteiraLoading(false);
      });

    setSaquesLoading(true);
    client.wallet
      .statement(storeId)
      .then((lista) => {
        if (!cancelled) setSaques(lista);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSaquesLoading(false);
      });

    setRepassesLoading(true);
    setRepassesError(null);
    client.payout.listar()
      .then((list) => { if (!cancelled) setRepasses(list.filter((item) => item.estabelecimentoId === storeId)); })
      .catch((error: unknown) => { if (!cancelled) setRepassesError(error instanceof Error ? error : new Error(String(error))); })
      .finally(() => { if (!cancelled) setRepassesLoading(false); });

    return () => {
      cancelled = true;
    };
  }, [reloadToken, storeId]);

  const sacadoNoMesReais = useMemo(() => paidThisMonth(saques), [saques]);

  const value = useMemo<FinanceiroContextValue>(
    () => ({
      carteira,
      carteiraLoading,
      carteiraError,
      reload: () => setReloadToken((token) => token + 1),
      saquesRecentes: saques,
      saquesLoading,
      sacadoNoMesReais,
      repasses,
      repassesLoading,
      repassesError,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [carteira, carteiraLoading, carteiraError, saques, saquesLoading, sacadoNoMesReais,
      repasses, repassesLoading, repassesError],
  );

  return <FinanceiroContext.Provider value={value}>{children}</FinanceiroContext.Provider>;
}

export function useFinanceiro(): FinanceiroContextValue {
  const context = useContext(FinanceiroContext);
  if (!context) {
    throw new Error('useFinanceiro deve ser usado dentro de <FinanceiroProvider>.');
  }
  return context;
}
