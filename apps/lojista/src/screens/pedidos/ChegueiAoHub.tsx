import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { PedidoResumoCard } from '../../components/PedidoResumoCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { PedidosStackParamList } from '../../navigation/types';
import { useOrdersContext } from './OrdersContext';

type Props = NativeStackScreenProps<PedidosStackParamList, 'ChegueiAoHub'>;

/**
 * "Cheguei ao hub" — Story 0.10 (Task 6). Sem frame explícito no protótipo.
 * Confirma a chegada física do lojista ao hub (`markArrivedAtHub` →
 * `lojista_chegou_em`, distinto de `cliente_chegou_em` do lado Cliente) e
 * habilita a tela de PIN (Task 7).
 */
export default function ChegueiAoHub({ navigation, route }: Props) {
  const { pedidoId } = route.params;
  const { getById, hubNome, markArrivedAtHub } = useOrdersContext();
  const pedido = getById(pedidoId);
  const [confirmando, setConfirmando] = useState(false);

  if (!pedido) return null;

  async function onConfirmar() {
    setConfirmando(true);
    try {
      await markArrivedAtHub(pedidoId);
      navigation.replace('DigitarPin', { pedidoId });
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <ScreenHeader title="Cheguei ao hub" onBack={() => navigation.goBack()} />

        <PedidoResumoCard pedido={pedido} subtitle={`${pedido.itens.length} itens · ${hubNome}`} />

        <Text style={[styles.mensagem, { color: darkColors.text.secondary }]}>
          Confirme que você chegou ao {hubNome} para aguardar o cliente e liberar a tela de retirada.
        </Text>
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          label={confirmando ? 'Confirmando...' : 'Confirmar chegada'}
          onPress={onConfirmar}
          disabled={confirmando}
        />
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
  mensagem: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
  },
  footer: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[6],
  },
});
