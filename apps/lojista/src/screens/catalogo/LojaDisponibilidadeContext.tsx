import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

import { getDataClient, type Estabelecimento } from '@keepit/core-data';

import { CURRENT_ESTABELECIMENTO_ID } from './currentStore';

export type DuracaoPausa = '30min' | '1hora' | 'hoje';

interface LojaDisponibilidadeContextValue {
  estabelecimento: Estabelecimento | null;
  loading: boolean;
  recebendoPedidos: boolean;
  setRecebendoPedidos: (value: boolean) => void;
  pausaSelecionada: DuracaoPausa | null;
  selecionarPausa: (duracao: DuracaoPausa) => void;
}

const LojaDisponibilidadeContext = createContext<LojaDisponibilidadeContextValue | null>(null);

/**
 * Provider de disponibilidade da loja — Story 0.9 (Task 5/6).
 *
 * Domínio `estabelecimentos.pausado_manualmente`, NÃO `produtos`
 * [Source: docs/architecture/03-data-models.md#1.4] — corrige a imprecisão
 * do inventário do épico que descrevia este toggle como CRUD de
 * `product.port`. Consumido via `store.port` (leitura), não `product.port`.
 *
 * `StorePort` ganhou `setPausadoManualmente` (Story 1.10, Task 6) — o toggle
 * "recebendo pedidos" agora persiste no mock db real e sobrevive a um novo
 * `getById`/remount do provider (antes era estado local-only, ver Stories
 * 0.9/1.10 Dev Notes).
 *
 * Bloco 12 (Higiene) — débito REL-001 (gate da Story 4.8): `setRecebendoPedidos`/
 * `selecionarPausa` faziam update otimista e persistiam com `.catch(() => undefined)`,
 * engolindo falhas reais de escrita (rede/RLS) — a UI ficava mostrando o estado novo
 * mesmo quando `estabelecimentos.pausado_manualmente` não mudou no banco. Corrigido
 * revertendo o estado otimista e avisando via `Alert` em caso de erro — mesma
 * honestidade já aplicada em `handleSalvar` (`HorariosDisponibilidade.tsx`, Story 4.7).
 */
export function LojaDisponibilidadeProvider({ children }: PropsWithChildren) {
  const [estabelecimento, setEstabelecimento] = useState<Estabelecimento | null>(null);
  const [loading, setLoading] = useState(true);
  const [recebendoPedidos, setRecebendoPedidosState] = useState(true);
  const [pausaSelecionada, setPausaSelecionada] = useState<DuracaoPausa | null>(null);

  useEffect(() => {
    const client = getDataClient();
    let cancelled = false;

    client.store.getById(CURRENT_ESTABELECIMENTO_ID).then((estab) => {
      if (cancelled || !estab) return;
      setEstabelecimento(estab);
      setRecebendoPedidosState(!estab.pausado_manualmente);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function setRecebendoPedidos(value: boolean) {
    const recebendoAnterior = recebendoPedidos;
    const pausaAnterior = pausaSelecionada;
    setRecebendoPedidosState(value);
    if (value) setPausaSelecionada(null);
    getDataClient()
      .store.setPausadoManualmente(CURRENT_ESTABELECIMENTO_ID, !value)
      .then((estab) => setEstabelecimento(estab))
      .catch(() => {
        setRecebendoPedidosState(recebendoAnterior);
        setPausaSelecionada(pausaAnterior);
        Alert.alert(
          'Não foi possível atualizar',
          'Não foi possível salvar a disponibilidade da loja agora. Tente novamente em instantes.',
        );
      });
  }

  function selecionarPausa(duracao: DuracaoPausa) {
    const recebendoAnterior = recebendoPedidos;
    const pausaAnterior = pausaSelecionada;
    setPausaSelecionada(duracao);
    setRecebendoPedidosState(false);
    getDataClient()
      .store.setPausadoManualmente(CURRENT_ESTABELECIMENTO_ID, true)
      .then((estab) => setEstabelecimento(estab))
      .catch(() => {
        setPausaSelecionada(pausaAnterior);
        setRecebendoPedidosState(recebendoAnterior);
        Alert.alert(
          'Não foi possível atualizar',
          'Não foi possível pausar novos pedidos agora. Tente novamente em instantes.',
        );
      });
  }

  const value = useMemo<LojaDisponibilidadeContextValue>(
    () => ({ estabelecimento, loading, recebendoPedidos, setRecebendoPedidos, pausaSelecionada, selecionarPausa }),
    [estabelecimento, loading, recebendoPedidos, pausaSelecionada],
  );

  return <LojaDisponibilidadeContext.Provider value={value}>{children}</LojaDisponibilidadeContext.Provider>;
}

export function useLojaDisponibilidade(): LojaDisponibilidadeContextValue {
  const context = useContext(LojaDisponibilidadeContext);
  if (!context) {
    throw new Error('useLojaDisponibilidade deve ser usado dentro de <LojaDisponibilidadeProvider>.');
  }
  return context;
}
