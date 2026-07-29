import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { PedidoResumoCard } from '../../components/PedidoResumoCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { PedidosStackParamList } from '../../navigation/types';
import { useOrdersContext } from './OrdersContext';

type Props = NativeStackScreenProps<PedidosStackParamList, 'SaindoParaHub'>;

/**
 * "Saindo pro hub" — Story 0.10 (Task 6). Sem frame explícito no protótipo —
 * padrão visual consistente com o Detalhe (mesmo header, card de resumo,
 * botão primário). Exibida logo após `markReadyForHub` (chamado em
 * `DetalheSepararPedido`) confirmar a transição para `saindo_hub`.
 */
export default function SaindoParaHub({ navigation, route }: Props) {
  const { pedidoId } = route.params;
  const { getById, hubNome } = useOrdersContext();
  const pedido = getById(pedidoId);

  if (!pedido) return null;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <ScreenHeader title="Pedido a caminho" onBack={() => navigation.navigate('NovosPedidos')} />

        <PedidoResumoCard pedido={pedido} subtitle={`${pedido.itens.length} itens · ${hubNome}`} />

        <Text style={[styles.mensagem, { color: darkColors.text.secondary }]}>
          Pedido separado e a caminho do {hubNome}. Confirme abaixo assim que você chegar ao hub para aguardar
          o cliente.
        </Text>
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="Cheguei ao hub" onPress={() => navigation.navigate('ChegueiAoHub', { pedidoId })} />
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
