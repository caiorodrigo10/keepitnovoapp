import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { PedidoResumoCard } from '../../components/PedidoResumoCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { PedidosStackParamList } from '../../navigation/types';
import { useOrdersContext } from './OrdersContext';

type Props = NativeStackScreenProps<PedidosStackParamList, 'ConfirmarRetirada'>;

/**
 * "Confirmar retirada" (sucesso) — Story 0.10 (Task 7). Sem frame explícito
 * no protótipo — tela de confirmação mostrada após `confirmPin` resolver
 * com `correto: true` em `DigitarPin`, antes de voltar para a lista.
 */
export default function ConfirmarRetirada({ navigation, route }: Props) {
  const { pedidoId } = route.params;
  const { getById, hubNome } = useOrdersContext();
  const pedido = getById(pedidoId);

  if (!pedido) return null;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <View style={[styles.check, { backgroundColor: darkColors.accent.brand }]}>
          <Ionicons name="checkmark" size={36} color={darkColors.bg.primary} />
        </View>

        <Text style={[styles.titulo, { color: darkColors.text.primary }]}>Retirada confirmada!</Text>
        <Text style={[styles.subtitulo, { color: darkColors.text.secondary }]}>
          O pedido foi entregue ao cliente no {hubNome}.
        </Text>

        <PedidoResumoCard pedido={pedido} subtitle={`${pedido.itens.length} itens · ${hubNome}`} />
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="Voltar para pedidos" onPress={() => navigation.navigate('NovosPedidos')} />
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
    paddingTop: spacing[10],
    alignItems: 'center',
    gap: spacing[4],
  },
  check: {
    width: 72,
    height: 72,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
  },
  subtitulo: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[6],
    width: '100%',
  },
});
