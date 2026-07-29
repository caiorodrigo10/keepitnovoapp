import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing } from '@keepit/ui-tokens';

import { FormField } from '../../components/FormField';
import { PedidoResumoCard } from '../../components/PedidoResumoCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { PedidosStackParamList } from '../../navigation/types';
import { useOrdersContext } from './OrdersContext';

type Props = NativeStackScreenProps<PedidosStackParamList, 'RecusarPedido'>;

/**
 * "Recusar pedido" — Story 0.10 (Task 4). Sem frame explícito no protótipo
 * — segue o padrão de formulário dark já usado no cadastro do lojista
 * (Story 0.8: `FormField` + `PrimaryButton`).
 */
export default function RecusarPedido({ navigation, route }: Props) {
  const { pedidoId } = route.params;
  const { getById, refuseOrder } = useOrdersContext();
  const pedido = getById(pedidoId);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  if (!pedido) return null;

  const podeConfirmar = motivo.trim().length > 0 && !salvando;

  async function onConfirmar() {
    setSalvando(true);
    try {
      await refuseOrder(pedidoId, motivo.trim());
      navigation.navigate('NovosPedidos');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <ScreenHeader title="Recusar pedido" onBack={() => navigation.goBack()} />

        <PedidoResumoCard pedido={pedido} subtitle={`${pedido.itens.length} itens · Hub Centro`} />

        <FormField
          label="Motivo da recusa"
          value={motivo}
          onChangeText={setMotivo}
          placeholder="Ex.: item sem estoque no momento"
          multiline
        />
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          label={salvando ? 'Confirmando...' : 'Confirmar recusa'}
          onPress={onConfirmar}
          disabled={!podeConfirmar}
          variant="warning"
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
  footer: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[6],
  },
});
