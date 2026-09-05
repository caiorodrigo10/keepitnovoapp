import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getDataClient } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock } from '../../components/discovery';
import { AppHeader, Button, Screen } from '../../components/ui';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { usePedidoDetail } from '../../hooks/usePedidoDetail';
import { cancelamentoPolicy } from '../../lib/cancelamentoPolicy';
import type { PedidosStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PedidosStackParamList, 'LojistaNaoVeio'>;

/**
 * "Lojista não veio" (Task 7, AC1/AC2/AC3/AC4) — Nota de fidelidade: o
 * bundle do protótipo não expõe texto literal para esta tela (busca
 * textual não encontrou "lojista não veio"/"não apareceu"). Segue os
 * padrões visuais já estabelecidos nas demais telas de exceção do Cliente
 * (mesma tipografia/cores de alerta de `@keepit/ui-tokens`, mesmo padrão de
 * card/CTA de `CancelarPedido`/`ChegueiAoHub`) — sinalizado para @ux-expert
 * validar quando houver acesso a mais telas do protótipo/Figma.
 *
 * **Story 6.20 (AC2, AC4) — [IDS] ADAPT: fecha o `[TECH DEBT]` que este
 * arquivo documentava desde a Story 0.7.** Antes, `handleReportar` chamava
 * `order.cancel(...)`, que só grava o status genérico `cancelado` (sem
 * `nao_entregue_lojista`, sem refund 100% real, sem registrar a falha de
 * qualidade do lojista). Agora chama `order.reportLojistaNaoVeio(pedidoId)`
 * — método dedicado que transiciona para `nao_entregue_lojista`, insere o
 * refund 100% pendente e registra a falha (`tipo='lojista_nao_apareceu'`),
 * os 3 efeitos atômicos (mock e real). Esta tela NÃO foi redesenhada — só a
 * chamada de backend mudou.
 */
export default function LojistaNaoVeio({ route, navigation }: Props) {
  const { data: cliente } = useCurrentCliente();
  const { data: pedido, loading, error, refresh } = usePedidoDetail(cliente?.id ?? null, route.params?.pedidoId);
  const [enviando, setEnviando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const handleReportar = async () => {
    if (!pedido) return;
    setEnviando(true);
    setErroAcao(null);
    try {
      await getDataClient().order.reportLojistaNaoVeio(pedido.id);
      refresh();
      setConfirmado(true);
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Não foi possível registrar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        title="Lojista não veio"
        back={{ navigation, fallback: () => navigation.navigate('MeusPedidos') }}
      />

      {loading && <AsyncStateBlock kind="loading" />}
      {!loading && !!error && <AsyncStateBlock kind="error" />}
      {!loading && !error && !pedido && (
        <AsyncStateBlock kind="empty" emptyLabel="Nenhum pedido em andamento para reportar." />
      )}

      {!loading && !error && pedido && (
        <View style={styles.card}>
          {confirmado ? (
            <>
              <Text style={styles.cardTitulo}>Registramos sua solicitação</Text>
              <Text style={styles.cardCopy}>
                Você receberá {cancelamentoPolicy.lojistaNaoVeioPercent}% de reembolso e registramos uma falha de
                qualidade para este lojista.
              </Text>
              <Button title="Voltar para Meus pedidos" onPress={() => navigation.navigate('MeusPedidos')} />
            </>
          ) : (
            <>
              <Text style={styles.cardTitulo}>O lojista não apareceu no hub?</Text>
              <Text style={styles.cardCopy}>
                Se você já esperou o tempo combinado e o lojista não chegou, você recebe{' '}
                {cancelamentoPolicy.lojistaNaoVeioPercent}% de reembolso e registramos uma falha de qualidade para
                este lojista.
              </Text>
              {!!erroAcao && <Text style={styles.erro}>{erroAcao}</Text>}
              <Button title="Confirmar — lojista não veio" onPress={handleReportar} loading={enviando} />
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
