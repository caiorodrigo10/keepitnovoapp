import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { businessConfig } from '@keepit/config';
import { getDataClient, type CarteiraLojista, type Saque } from '@keepit/core-data';

import { CURRENT_ESTABELECIMENTO_ID } from '../catalogo/currentStore';

export interface ChavePix {
  tipo: 'PIX';
  valor: string;
}

/** Chave PIX inicial (mock) — mesma exibida no protótipo (painel P5, bloco "RECEBER VIA"). */
export const DEFAULT_CHAVE_PIX: ChavePix = { tipo: 'PIX', valor: 'thiago@email.com' };

/** `businessConfig.saqueMinimoReais`/`carteiraLiberacaoDias` (Story 0.2) — nunca hardcoded na tela. */
const SAQUE_MINIMO_REAIS = businessConfig.saqueMinimoReais;
const CARTEIRA_LIBERACAO_DIAS = businessConfig.carteiraLiberacaoDias;

const EMPTY_CARTEIRA: CarteiraLojista = {
  estabelecimento_id: CURRENT_ESTABELECIMENTO_ID,
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
  /** [TECH DEBT] `WalletPort` não expõe agregação por mês — computado aqui filtrando `saques` do mês corrente (ver Dev Notes da story). */
  sacadoNoMesReais: number;

  chavePix: ChavePix;
  updateChavePix: (chave: ChavePix) => void;

  /** `businessConfig.saqueMinimoReais` (Story 0.2) — nunca hardcoded na tela. */
  saqueMinimoReais: number;
  /** `businessConfig.carteiraLiberacaoDias` (D+7) — usado só como rótulo/contexto (AC1). */
  carteiraLiberacaoDias: number;

  /** Último saque solicitado com sucesso nesta sessão — consumido pela tela de confirmação (`SolicitarSaque`). */
  lastSaque: Saque | null;
  requestWithdrawal: (valorReais: number) => Promise<Saque>;
}

const FinanceiroContext = createContext<FinanceiroContextValue | null>(null);

/**
 * Provider do domínio Financeiro — Story 0.11 (Task 6). Envolve `FinanceiroStack`
 * para compartilhar carteira/saques/chave PIX entre Dashboard, Vendas, Carteira,
 * SolicitarSaque, ExtratoFinanceiro e FormasRecebimento — mesmo padrão de
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
  const [carteira, setCarteira] = useState<CarteiraLojista>(EMPTY_CARTEIRA);
  const [carteiraLoading, setCarteiraLoading] = useState(true);
  const [carteiraError, setCarteiraError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [saques, setSaques] = useState<Saque[]>([]);
  const [saquesLoading, setSaquesLoading] = useState(true);

  const [chavePix, setChavePix] = useState<ChavePix>(DEFAULT_CHAVE_PIX);
  const [lastSaque, setLastSaque] = useState<Saque | null>(null);

  useEffect(() => {
    let cancelled = false;
    const client = getDataClient();

    setCarteiraLoading(true);
    setCarteiraError(null);
    client.wallet
      .getBalance(CURRENT_ESTABELECIMENTO_ID)
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
      .statement(CURRENT_ESTABELECIMENTO_ID)
      .then((lista) => {
        if (!cancelled) setSaques(lista);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSaquesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  async function requestWithdrawal(valorReais: number): Promise<Saque> {
    const client = getDataClient();
    // Validação de UI (AC3): mensagem clara ANTES de chamar o mock (que também
    // valida — ver `wallet.mock.ts#requestWithdrawal` — mas com erro genérico).
    if (valorReais < SAQUE_MINIMO_REAIS) {
      throw new Error(`Valor mínimo de saque: R$ ${SAQUE_MINIMO_REAIS.toFixed(2).replace('.', ',')}`);
    }
    const saque = await client.wallet.requestWithdrawal(CURRENT_ESTABELECIMENTO_ID, valorReais);
    setSaques((previous) => [saque, ...previous]);
    setLastSaque(saque);
    // Recarrega o saldo (saque solicitado impacta `saldo_disponivel_reais`).
    const carteiraAtualizada = await client.wallet.getBalance(CURRENT_ESTABELECIMENTO_ID);
    setCarteira(carteiraAtualizada);
    return saque;
  }

  const sacadoNoMesReais = useMemo(() => {
    const agora = new Date();
    return saques
      .filter((saque) => {
        if (saque.status === 'erro') return false;
        const data = new Date(saque.solicitado_em);
        return data.getUTCFullYear() === agora.getUTCFullYear() && data.getUTCMonth() === agora.getUTCMonth();
      })
      .reduce((soma, saque) => soma + saque.valor_reais, 0);
  }, [saques]);

  const value = useMemo<FinanceiroContextValue>(
    () => ({
      carteira,
      carteiraLoading,
      carteiraError,
      reload: () => setReloadToken((token) => token + 1),
      saquesRecentes: saques,
      saquesLoading,
      sacadoNoMesReais,
      chavePix,
      updateChavePix: setChavePix,
      saqueMinimoReais: SAQUE_MINIMO_REAIS,
      carteiraLiberacaoDias: CARTEIRA_LIBERACAO_DIAS,
      lastSaque,
      requestWithdrawal,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [carteira, carteiraLoading, carteiraError, saques, saquesLoading, sacadoNoMesReais, chavePix, lastSaque],
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
