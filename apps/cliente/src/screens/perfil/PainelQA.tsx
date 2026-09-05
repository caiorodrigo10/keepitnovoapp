import { useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  getDataClient,
  type QaSimulationDomain,
  type QaSimulationState,
} from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { BuildMetadata } from '../../components/qa/BuildMetadata';
import { Button, Screen } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useQaScenario } from '../../context/QaScenarioContext';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { useCurrentEmail } from '../../hooks/useCurrentEmail';
import { usePedidosMine } from '../../hooks/usePedidosMine';
import { advanceOrderForQa, getNextQaOrderAction } from '../../lib/qaOrderActions';
import { resetDemoScenario, type ResetDemoScenarioResult } from '../../lib/resetDemoScenario';
import type { PerfilStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PerfilStackParamList, 'PainelQA'>;

const SIMULATION_DOMAINS: ReadonlyArray<{
  key: Exclude<QaSimulationDomain, 'favorites'>;
  label: string;
}> = [
  { key: 'orders', label: 'Pedidos' },
  { key: 'stores', label: 'Lojas' },
  { key: 'hubs', label: 'Hubs' },
  { key: 'profile', label: 'Perfil' },
  { key: 'search', label: 'Busca' },
];

const SIMULATION_STATES: ReadonlyArray<{ key: QaSimulationState; label: string }> = [
  { key: 'normal', label: 'Normal' },
  { key: 'loading', label: 'Loading' },
  { key: 'empty', label: 'Vazio' },
  { key: 'error', label: 'Erro' },
];

const RESET_FAILURE_LABELS: Record<
  Extract<ResetDemoScenarioResult, { status: 'degraded' }>['failures'][number],
  string
> = {
  'scenario-persistence': 'cenário persistido',
  'cart-persistence': 'carrinho persistido',
  'cart-live-state': 'carrinho em memória',
};

export default function PainelQA({ navigation }: Props) {
  const client = getDataClient();
  const { resetDemoCart } = useCart();
  const { state, setSimulation, syncFromClient } = useQaScenario();
  const { data: cliente, loading: clienteLoading } = useCurrentCliente();
  const { data: email, loading: emailLoading } = useCurrentEmail();
  const {
    data: pedidos,
    loading: pedidosLoading,
    error: pedidosError,
    refresh: refreshPedidos,
  } = usePedidosMine(cliente?.id ?? null);

  const [simulationPending, setSimulationPending] = useState<string | null>(null);
  const [advancingOrderId, setAdvancingOrderId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSimulation(domain: QaSimulationDomain, value: QaSimulationState) {
    setSimulationPending(`${domain}:${value}`);
    setNotice(null);
    try {
      const result = await setSimulation(domain, value);
      if (result.status === 'degraded') {
        setNotice('Simulação aplicada em memória, mas não foi persistida.');
      }
    } catch {
      setNotice('Não foi possível aplicar a simulação.');
    } finally {
      setSimulationPending(null);
    }
  }

  async function handleAdvanceOrder(pedidoId: string) {
    const pedido = pedidos.find((candidate) => candidate.id === pedidoId);
    if (!pedido) return;

    setAdvancingOrderId(pedido.id);
    setNotice(null);
    try {
      await advanceOrderForQa(client, pedido);
      refreshPedidos();
    } catch {
      setNotice(`Não foi possível avançar o pedido #${pedido.numero}.`);
    } finally {
      setAdvancingOrderId(null);
    }
  }

  function describeResetResult(result: ResetDemoScenarioResult) {
    if (result.status === 'reset') {
      setNotice('Cenário restaurado');
      return;
    }
    if (result.status === 'degraded') {
      const layers = result.failures.map((failure) => RESET_FAILURE_LABELS[failure]).join(', ');
      setNotice(
        `Cenário limpo em memória, mas uma ou mais camadas não foram persistidas. Camadas: ${layers}.`,
      );
      return;
    }
    if (result.status === 'unavailable') {
      setNotice('Reset disponível somente no datasource mock');
    }
  }

  async function confirmReset() {
    setResetting(true);
    setNotice(null);
    try {
      const result = await resetDemoScenario(client, true, { clearLiveCart: resetDemoCart });
      syncFromClient();
      refreshPedidos();
      describeResetResult(result);
    } catch {
      setNotice('Não foi possível restaurar o cenário agora.');
    } finally {
      setResetting(false);
    }
  }

  function requestReset() {
    const account = cliente?.nome ?? email ?? 'conta demo atual';
    Alert.alert(
      'Resetar cenário?',
      `${account} será restaurada. Pedidos, favoritos futuros e o carrinho atual serão perdidos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Resetar', style: 'destructive', onPress: () => void confirmReset() },
      ],
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Painel QA</Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => navigation.goBack()}>
          <Text style={styles.backLabel}>Voltar</Text>
        </Pressable>
      </View>

      <Section title="Build">
        <BuildMetadata />
      </Section>

      <Section title="Conta demo">
        <View style={styles.card}>
          <View style={styles.accountHeader}>
            <Text style={styles.accountName}>
              {clienteLoading ? 'Carregando…' : cliente?.nome ?? 'Sessão não encontrada'}
            </Text>
            <Text style={styles.selectedBadge}>Selecionada</Text>
          </View>
          <Text style={styles.secondaryText}>
            {emailLoading ? 'Carregando e-mail…' : email ?? 'E-mail indisponível'}
          </Text>
        </View>
      </Section>

      <Section title="Simulações">
        {SIMULATION_DOMAINS.map((domain) => (
          <View key={domain.key} style={styles.simulationBlock}>
            <Text style={styles.itemTitle}>{domain.label}</Text>
            <View style={styles.chipRow}>
              {SIMULATION_STATES.map((simulation) => {
                const active = state.simulations[domain.key] === simulation.key;
                const pending = simulationPending === `${domain.key}:${simulation.key}`;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: Boolean(simulationPending) }}
                    disabled={Boolean(simulationPending)}
                    key={simulation.key}
                    onPress={() => void handleSimulation(domain.key, simulation.key)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                      {pending ? 'Aplicando…' : simulation.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </Section>

      <Section title="Pedidos">
        {pedidosLoading && <Text style={styles.secondaryText}>Carregando pedidos…</Text>}
        {pedidosError && <Text style={styles.errorText}>Não foi possível carregar os pedidos reais.</Text>}
        {!pedidosLoading && !pedidosError && pedidos.length === 0 && (
          <Text style={styles.secondaryText}>Nenhum pedido para esta conta.</Text>
        )}
        {!pedidosError &&
          pedidos.map((pedido) => {
            const action = getNextQaOrderAction(pedido);
            return (
              <View key={pedido.id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <Text style={styles.itemTitle}>Pedido #{pedido.numero}</Text>
                  <Text style={styles.orderStatus}>{pedido.status}</Text>
                </View>
                {action && (
                  <Button
                    disabled={Boolean(advancingOrderId)}
                    loading={advancingOrderId === pedido.id}
                    onPress={() => void handleAdvanceOrder(pedido.id)}
                    title={action.label}
                    variant="outline"
                  />
                )}
              </View>
            );
          })}
      </Section>

      <Section title="Resetar cenário">
        <Text style={styles.resetDescription}>
          Restaura a conta demo e remove pedidos, favoritos futuros e o carrinho atual.
        </Text>
        <Button loading={resetting} onPress={requestReset} title="Resetar cenário" />
      </Section>

      {!!notice && (
        <View accessibilityRole="alert" style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}
    </Screen>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing['6'],
  },
  title: {
    color: lightColors.text.primary,
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
  },
  backLabel: {
    color: lightColors.accent.successFg,
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  section: {
    marginBottom: spacing['8'],
  },
  sectionTitle: {
    color: lightColors.text.primary,
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    marginBottom: spacing['3'],
  },
  card: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    padding: spacing['4'],
  },
  accountHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing['3'],
    justifyContent: 'space-between',
  },
  accountName: {
    color: lightColors.text.primary,
    flex: 1,
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
  },
  selectedBadge: {
    backgroundColor: lightColors.accent.brand,
    borderRadius: radii.full,
    color: lightColors.text.primary,
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.xs.fontSize,
    overflow: 'hidden',
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['1'],
  },
  secondaryText: {
    color: lightColors.text.secondary,
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    marginTop: spacing['1'],
  },
  simulationBlock: {
    marginBottom: spacing['4'],
  },
  itemTitle: {
    color: lightColors.text.primary,
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    marginBottom: spacing['2'],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing['2'],
  },
  chip: {
    backgroundColor: lightColors.bg.surface,
    borderColor: lightColors.border.default,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['2'],
  },
  chipActive: {
    backgroundColor: lightColors.accent.brand,
    borderColor: lightColors.accent.brand,
  },
  chipLabel: {
    color: lightColors.text.secondary,
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
  },
  chipLabelActive: {
    color: lightColors.text.primary,
    fontFamily: 'HankenGrotesk-SemiBold',
  },
  orderCard: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    marginBottom: spacing['3'],
    padding: spacing['4'],
  },
  orderHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing['3'],
    justifyContent: 'space-between',
  },
  orderStatus: {
    color: lightColors.text.secondary,
    flexShrink: 1,
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.xs.fontSize,
    textAlign: 'right',
  },
  errorText: {
    color: lightColors.accent.warning,
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
  },
  resetDescription: {
    color: lightColors.text.secondary,
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    marginBottom: spacing['4'],
  },
  notice: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    padding: spacing['4'],
  },
  noticeText: {
    color: lightColors.text.primary,
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
  },
});
