import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { NumericStepper } from '../../components/NumericStepper';
import { PedidoResumoCard } from '../../components/PedidoResumoCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { PedidosStackParamList } from '../../navigation/types';
import { useOrdersContext } from './OrdersContext';

type Props = NativeStackScreenProps<PedidosStackParamList, 'AceitarPedido'>;

/**
 * "Aceitar pedido" — Story 0.10 (Task 3). Sem frame explícito no protótipo
 * estático — segue o padrão visual dos demais modais/telas dark do épico
 * (mesma paleta/cards/botões desta story).
 *
 * Campo "Tempo estimado" pré-preenchido com
 * `estabelecimentos.tempo_medio_entrega_min` real (via `OrdersContext`,
 * Task 3 Dev Notes) — fallback documentado em `OrdersContext.tsx` se a
 * chamada falhar.
 */
export default function AceitarPedido({ navigation, route }: Props) {
  const { pedidoId } = route.params;
  const { getById, tempoMedioPrepMin, acceptOrder } = useOrdersContext();
  const pedido = getById(pedidoId);
  const [tempoEstimadoMin, setTempoEstimadoMin] = useState(tempoMedioPrepMin);
  const [salvando, setSalvando] = useState(false);

  if (!pedido) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
        <Text style={[styles.notFound, { color: darkColors.text.secondary }]}>Pedido não encontrado.</Text>
      </SafeAreaView>
    );
  }

  async function onConfirmar() {
    setSalvando(true);
    try {
      await acceptOrder(pedidoId, tempoEstimadoMin);
      navigation.goBack();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <ScreenHeader title="Aceitar pedido" onBack={() => navigation.goBack()} />

        <PedidoResumoCard pedido={pedido} subtitle={`${pedido.itens.length} itens · Hub Centro`} />

        <Text style={[styles.helper, { color: darkColors.text.secondary }]}>
          Confirme o tempo estimado de preparo para avisar o cliente.
        </Text>

        <NumericStepper
          label="Tempo estimado"
          value={tempoEstimadoMin}
          onChange={setTempoEstimadoMin}
          min={5}
          max={120}
          step={5}
          unit="min"
        />
      </View>

      <View style={styles.footer}>
        <PrimaryButton label={salvando ? 'Confirmando...' : 'Confirmar'} onPress={onConfirmar} disabled={salvando} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    gap: spacing[5],
  },
  helper: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
  },
  footer: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[6],
  },
  notFound: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
    textAlign: 'center',
    marginTop: spacing[8],
  },
});
