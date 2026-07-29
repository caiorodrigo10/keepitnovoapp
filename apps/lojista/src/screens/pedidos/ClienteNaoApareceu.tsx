import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { FormField } from '../../components/FormField';
import { PedidoResumoCard } from '../../components/PedidoResumoCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { PedidosStackParamList } from '../../navigation/types';
import { useOrdersContext } from './OrdersContext';

type Props = NativeStackScreenProps<PedidosStackParamList, 'ClienteNaoApareceu'>;

/**
 * "Cliente não apareceu" — Story 0.10 (Task 9). Sem frame explícito no
 * protótipo — padrão de alerta dentro da paleta dark (mesmos tokens das
 * demais telas, sem cor nova). Disponível a partir de `DigitarPin` quando
 * `status === 'no_hub'`.
 *
 * O split financeiro 20/80 mencionado no Épico (regra de negócio Rodada 2)
 * NÃO é implementado aqui — apenas a transição visual de estado
 * (`nao_retirado`), conforme Dev Notes da story.
 */
export default function ClienteNaoApareceu({ navigation, route }: Props) {
  const { pedidoId } = route.params;
  const { getById, hubNome, markCustomerNoShow } = useOrdersContext();
  const pedido = getById(pedidoId);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  if (!pedido) return null;

  const podeConfirmar = motivo.trim().length > 0 && !salvando;

  async function onConfirmar() {
    setSalvando(true);
    try {
      await markCustomerNoShow(pedidoId, motivo.trim());
      navigation.navigate('NovosPedidos');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <ScreenHeader title="Cliente não apareceu" onBack={() => navigation.goBack()} />

        <PedidoResumoCard pedido={pedido} subtitle={`${pedido.itens.length} itens · ${hubNome}`} />

        <Text style={[styles.alerta, { color: darkColors.accent.warning }]}>
          Confirme apenas se o cliente não retirou o pedido dentro da janela de tolerância do hub.
        </Text>

        <FormField
          label="Motivo / observação"
          value={motivo}
          onChangeText={setMotivo}
          placeholder="Ex.: aguardei 15 min e o cliente não veio"
          multiline
        />
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          label={salvando ? 'Confirmando...' : 'Confirmar não retirada'}
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
  alerta: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
    lineHeight: typography.sizes.base.lineHeight,
  },
  footer: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[6],
  },
});
