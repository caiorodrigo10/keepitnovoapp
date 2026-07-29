import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getDataClient } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock } from '../../components/discovery';
import { Button, Screen } from '../../components/ui';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { usePedidoDetail } from '../../hooks/usePedidoDetail';
import { cancelamentoFaseFromStatus, cancelamentoPolicy } from '../../lib/cancelamentoPolicy';
import type { PedidosStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PedidosStackParamList, 'CancelarPedido'>;

/**
 * "Cancelar pedido" (Task 6, AC1/AC2/AC3/AC4) — CTA "Cancelar" já confirmado
 * no protótipo (verde/destaque, `#1F9D57` → `accent.successFg`). Sem tela de
 * confirmação dedicada visível no bundle — segue os padrões das demais
 * telas de exceção desta story. Respeita a matriz de cancelamento fechada
 * (Rodada 2): antes do aceite = 100%, após aceite/antes de sair para o hub
 * = 90%/10%, após sair para o hub = bloqueado.
 */
export default function CancelarPedido({ route, navigation }: Props) {
  const { data: cliente } = useCurrentCliente();
  const { data: pedido, loading, error, refresh } = usePedidoDetail(cliente?.id ?? null, route.params?.pedidoId);
  const [cancelando, setCancelando] = useState(false);
  const [cancelado, setCancelado] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const fase =
    pedido &&
    (pedido.status === 'aguardando_pagamento' ||
      pedido.status === 'aguardando_aceite' ||
      pedido.status === 'aceito' ||
      pedido.status === 'em_preparo' ||
      pedido.status === 'saindo_hub' ||
      pedido.status === 'no_hub')
      ? cancelamentoFaseFromStatus(pedido.status)
      : null;

  const bloqueado = fase === 'bloqueado_apos_saida';

  const handleCancelar = async () => {
    if (!pedido) return;
    setCancelando(true);
    setErroAcao(null);
    try {
      await getDataClient().order.cancel(pedido.id, 'Cancelado pelo cliente');
      refresh();
      setCancelado(true);
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Não foi possível cancelar. Tente novamente.');
    } finally {
      setCancelando(false);
    }
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.roundButton}>
          <Text style={styles.roundButtonIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Cancelar pedido</Text>
        <View style={styles.roundButton} />
      </View>

      {loading && <AsyncStateBlock kind="loading" />}
      {!loading && !!error && <AsyncStateBlock kind="error" />}
      {!loading && !error && !pedido && (
        <AsyncStateBlock kind="empty" emptyLabel="Nenhum pedido em andamento para cancelar." />
      )}

      {!loading && !error && pedido && (
        <>
          {cancelado ? (
            <View style={styles.card}>
              <Text style={styles.cardTitulo}>Pedido cancelado</Text>
              <Text style={styles.cardCopy}>{copyForFase(fase)}</Text>
              <Button title="Voltar para Meus pedidos" onPress={() => navigation.navigate('MeusPedidos')} />
            </View>
          ) : bloqueado ? (
            <View style={styles.card}>
              <Text style={styles.cardTituloAlerta}>Não é possível cancelar nesta fase</Text>
              <Text style={styles.cardCopy}>
                Seu pedido já saiu para o hub. Você precisa comparecer para retirá-lo — se o lojista não aparecer,
                use a opção "Lojista não veio" na tela do seu pedido.
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitulo}>Tem certeza que quer cancelar?</Text>
              <Text style={styles.cardCopy}>{copyForFase(fase)}</Text>
              {!!erroAcao && <Text style={styles.erro}>{erroAcao}</Text>}
              <Button title="Cancelar pedido" onPress={handleCancelar} loading={cancelando} />
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function copyForFase(fase: ReturnType<typeof cancelamentoFaseFromStatus> | null): string {
  if (fase === 'antes_aceite') {
    return `Como a loja ainda não aceitou seu pedido, você recebe ${cancelamentoPolicy.antesAceitePercent}% de reembolso.`;
  }
  if (fase === 'apos_aceite_antes_saida') {
    return `Como a loja já aceitou seu pedido, você recebe ${cancelamentoPolicy.aposAceitePercentCliente}% de reembolso (${cancelamentoPolicy.aposAceitePercentLojista}% fica com o lojista pelo preparo já iniciado).`;
  }
  return 'Cancelamento não permitido nesta fase do pedido.';
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing['5'],
  },
  roundButton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonIcon: {
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    color: lightColors.text.primary,
  },
  card: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    padding: spacing['4'],
  },
  cardTitulo: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
    marginBottom: spacing['2'],
  },
  cardTituloAlerta: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.accent.warning,
    marginBottom: spacing['2'],
  },
  cardCopy: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
    lineHeight: typography.sizes.md.lineHeight,
    marginBottom: spacing['4'],
  },
  erro: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.warning,
    marginBottom: spacing['3'],
  },
});
