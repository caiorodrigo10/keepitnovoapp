import { useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  getDataClient,
  type QaOrderProgressionDelaysMs,
  type QaSimulationDomain,
  type QaSimulationState,
} from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { BuildMetadata } from '../../components/qa/BuildMetadata';
import { AppHeader, Button, Screen, TextField } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useQaScenario } from '../../context/QaScenarioContext';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { useCurrentEmail } from '../../hooks/useCurrentEmail';
import { usePedidosMine } from '../../hooks/usePedidosMine';
import { clearPedidosResource } from '../../lib/ordersResource';
import {
  advanceOrderForQa,
  canRunQaOrderOutcome,
  getNextQaOrderAction,
  runQaOrderOutcome,
  type QaOrderOutcome,
} from '../../lib/qaOrderActions';
import {
  parseQaOrderProgression,
  qaOrderProgressionValuesFrom,
  type QaOrderProgressionValues,
} from '../../lib/qaOrderProgression';
import { resetDemoScenario } from '../../lib/resetDemoScenario';
import type { PerfilStackParamList } from '../../navigation/types';
import { getQaResetFeedback } from './painelQaFeedback';

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

const PROGRESSION_FIELDS: ReadonlyArray<{
  key: keyof QaOrderProgressionDelaysMs;
  label: string;
}> = [
  { key: 'aceito', label: 'Aceitar após (segundos)' },
  { key: 'em_preparo', label: 'Iniciar preparo após (segundos)' },
  { key: 'saindo_hub', label: 'Sair para o hub após (segundos)' },
  { key: 'no_hub', label: 'Chegar ao hub após (segundos)' },
];

export default function PainelQA({ navigation }: Props) {
  const client = getDataClient();
  const { resetDemoCart } = useCart();
  const {
    advanceClockBy,
    configureOrderProgression,
    setSimulation,
    state,
    syncFromClient,
  } = useQaScenario();
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
  const [orderOutcomePending, setOrderOutcomePending] = useState<string | null>(null);
  const [scenarioMutationPending, setScenarioMutationPending] = useState<
    'save' | 'pause' | 'clock' | 'recovery' | null
  >(null);
  const [progressionValues, setProgressionValues] = useState<QaOrderProgressionValues>(() =>
    qaOrderProgressionValuesFrom(state),
  );
  const [clockMinutes, setClockMinutes] = useState('');
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const operationInFlightRef = useRef(false);

  const updatingSimulation = simulationPending !== null;
  const mutatingOrder = advancingOrderId !== null || orderOutcomePending !== null;
  const mutatingScenario = scenarioMutationPending !== null;
  const busy = resetting || updatingSimulation || mutatingOrder || mutatingScenario;

  function beginOperation(): boolean {
    if (operationInFlightRef.current) return false;
    operationInFlightRef.current = true;
    return true;
  }

  function finishOperation() {
    operationInFlightRef.current = false;
  }

  async function handleSimulation(domain: QaSimulationDomain, value: QaSimulationState) {
    if (busy || !beginOperation()) return;
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
      finishOperation();
    }
  }

  async function handleAdvanceOrder(pedidoId: string) {
    const pedido = pedidos.find((candidate) => candidate.id === pedidoId);
    if (!pedido || busy || !beginOperation()) return;

    setAdvancingOrderId(pedido.id);
    setNotice(null);
    try {
      await advanceOrderForQa(client, pedido);
      refreshPedidos();
    } catch {
      setNotice(`Não foi possível avançar o pedido #${pedido.numero}.`);
    } finally {
      setAdvancingOrderId(null);
      finishOperation();
    }
  }

  async function handleOrderOutcome(pedidoId: string, outcome: QaOrderOutcome) {
    const pedido = pedidos.find((candidate) => candidate.id === pedidoId);
    if (!pedido || !canRunQaOrderOutcome(pedido, outcome) || busy || !beginOperation()) return;

    setOrderOutcomePending(`${pedido.id}:${outcome}`);
    setNotice(null);
    try {
      await runQaOrderOutcome(client, pedido, outcome);
      refreshPedidos();
    } catch {
      const action = outcome === 'refuse' ? 'recusar' : 'cancelar';
      setNotice(`Não foi possível ${action} o pedido #${pedido.numero}.`);
    } finally {
      setOrderOutcomePending(null);
      finishOperation();
    }
  }

  async function handleSaveProgression() {
    if (busy) return;
    const parsed = parseQaOrderProgression(progressionValues);
    if (parsed.status === 'invalid') {
      setNotice(parsed.message);
      return;
    }
    if (!beginOperation()) return;

    setScenarioMutationPending('save');
    setNotice(null);
    try {
      const result = await configureOrderProgression(parsed.delays, true);
      refreshPedidos();
      if (result.status === 'degraded') {
        setNotice('Avanço automático ativado em memória, mas não foi persistido.');
      }
    } catch {
      setNotice('Não foi possível configurar o avanço automático.');
    } finally {
      setScenarioMutationPending(null);
      finishOperation();
    }
  }

  async function handlePauseProgression() {
    if (busy || !beginOperation()) return;

    setScenarioMutationPending('pause');
    setNotice(null);
    try {
      const result = await configureOrderProgression(state.orderProgressionDelaysMs, false);
      refreshPedidos();
      if (result.status === 'degraded') {
        setNotice('Avanço automático pausado em memória, mas não foi persistido.');
      }
    } catch {
      setNotice('Não foi possível pausar o avanço automático.');
    } finally {
      setScenarioMutationPending(null);
      finishOperation();
    }
  }

  async function handleAdvanceClock() {
    if (busy) return;
    const minutes = Number(clockMinutes.trim());
    if (
      !/^\d+$/.test(clockMinutes.trim()) ||
      !Number.isSafeInteger(minutes) ||
      minutes <= 0 ||
      minutes > Number.MAX_SAFE_INTEGER / 60_000
    ) {
      setNotice('Informe um número inteiro positivo de minutos.');
      return;
    }
    if (!beginOperation()) return;

    setScenarioMutationPending('clock');
    setNotice(null);
    try {
      const result = await advanceClockBy(minutes * 60_000);
      refreshPedidos();
      setClockMinutes('');
      if (result.status === 'degraded') {
        setNotice('Relógio avançado em memória, mas não foi persistido.');
      }
    } catch {
      setNotice('Não foi possível avançar o relógio QA.');
    } finally {
      setScenarioMutationPending(null);
      finishOperation();
    }
  }

  async function handleExpirePasswordRecovery() {
    if (busy || !beginOperation()) return;

    setScenarioMutationPending('recovery');
    setNotice(null);
    try {
      const result = await client.demoScenario!.expirePasswordRecovery();
      if (result.status === 'expired') {
        setNotice('Recuperação pendente marcada como expirada.');
      } else if (result.status === 'unavailable') {
        setNotice('Nenhuma recuperação pendente para expirar.');
      } else {
        setNotice('Não foi possível persistir a expiração da recuperação.');
      }
    } catch {
      setNotice('Não foi possível expirar a recuperação pendente.');
    } finally {
      setScenarioMutationPending(null);
      finishOperation();
    }
  }

  async function confirmReset() {
    if (busy || !beginOperation()) return;
    setResetting(true);
    setNotice(null);
    try {
      const result = await resetDemoScenario(client, true, {
        clearLiveCart: resetDemoCart,
        clearOrders: clearPedidosResource,
      });
      const nextQaState = syncFromClient();
      setProgressionValues(qaOrderProgressionValuesFrom(nextQaState));
      setClockMinutes('');
      const feedback = getQaResetFeedback(result);
      if (feedback) {
        Alert.alert(feedback.title, feedback.message);
      }
    } catch {
      Alert.alert('Não foi possível restaurar o cenário', 'Tente novamente em instantes.');
    } finally {
      setResetting(false);
      finishOperation();
    }
  }

  function requestReset() {
    if (busy || operationInFlightRef.current) return;
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
      <AppHeader title="Painel QA" back={{ navigation, fallback: () => navigation.navigate('Perfil') }} />

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
                    accessibilityState={{ selected: active, disabled: busy }}
                    disabled={busy}
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

      <Section title="Avanço automático de pedidos">
        <Text style={styles.secondaryText}>
          Estado: {state.autoProgressOrders ? 'ativo' : 'pausado'}
        </Text>
        <View style={styles.progressionFields}>
          {PROGRESSION_FIELDS.map((field) => (
            <TextField
              key={field.key}
              keyboardType="number-pad"
              label={field.label}
              onChangeText={(value) =>
                setProgressionValues((current) => ({ ...current, [field.key]: value }))
              }
              value={progressionValues[field.key]}
            />
          ))}
        </View>
        <View style={styles.actionStack}>
          <Button
            disabled={busy}
            loading={scenarioMutationPending === 'save'}
            onPress={() => void handleSaveProgression()}
            title="Salvar e ativar"
          />
          <Button
            disabled={busy || !state.autoProgressOrders}
            loading={scenarioMutationPending === 'pause'}
            onPress={() => void handlePauseProgression()}
            title="Pausar avanço automático"
            variant="outline"
          />
        </View>
        <View style={styles.clockControls}>
          <TextField
            keyboardType="number-pad"
            label="Avançar relógio (minutos)"
            onChangeText={setClockMinutes}
            value={clockMinutes}
          />
          <Button
            disabled={busy}
            loading={scenarioMutationPending === 'clock'}
            onPress={() => void handleAdvanceClock()}
            title="Avançar relógio"
            variant="outline"
          />
        </View>
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
                <View style={styles.orderActions}>
                  {action && (
                    <Button
                      disabled={busy}
                      loading={advancingOrderId === pedido.id}
                      onPress={() => void handleAdvanceOrder(pedido.id)}
                      title={action.label}
                      variant="outline"
                    />
                  )}
                  {canRunQaOrderOutcome(pedido, 'refuse') && (
                    <Button
                      disabled={busy}
                      loading={orderOutcomePending === `${pedido.id}:refuse`}
                      onPress={() => void handleOrderOutcome(pedido.id, 'refuse')}
                      title="Recusar"
                      variant="outline"
                    />
                  )}
                  {canRunQaOrderOutcome(pedido, 'cancel') && (
                    <Button
                      disabled={busy}
                      loading={orderOutcomePending === `${pedido.id}:cancel`}
                      onPress={() => void handleOrderOutcome(pedido.id, 'cancel')}
                      title="Cancelar"
                      variant="outline"
                    />
                  )}
                </View>
              </View>
            );
          })}
      </Section>

      <Section title="Recuperação de senha">
        <Text style={styles.resetDescription}>
          Marca a solicitação mock pendente como expirada para validar o callback inválido.
        </Text>
        <Button
          disabled={busy}
          loading={scenarioMutationPending === 'recovery'}
          onPress={() => void handleExpirePasswordRecovery()}
          title="Expirar recuperação pendente"
          variant="outline"
        />
      </Section>

      <Section title="Resetar cenário">
        <Text style={styles.resetDescription}>
          Restaura a conta demo e remove pedidos, favoritos futuros e o carrinho atual.
        </Text>
        <Button disabled={busy} loading={resetting} onPress={requestReset} title="Resetar cenário" />
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
  progressionFields: {
    marginTop: spacing['4'],
  },
  actionStack: {
    gap: spacing['3'],
  },
  clockControls: {
    marginTop: spacing['5'],
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
  orderActions: {
    gap: spacing['3'],
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
