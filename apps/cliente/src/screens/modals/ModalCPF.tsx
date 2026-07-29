import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getDataClient } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { Button, TextField } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ModalCPF'>;

/**
 * Máscara visual `000.000.000-00` — apenas exibição, sem validação real de
 * CPF (BrasilAPI/dígito verificador ficam fora do Épico 0, ver Dev Notes da
 * Story 0.6).
 */
function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean);
  let masked = parts.join('.');
  if (digits.length > 9) {
    masked += `-${digits.slice(9, 11)}`;
  }
  return masked;
}

/**
 * Modal CPF (Task 4, AC1). Sem frame de dispositivo na referência — usa o
 * design system compartilhado (`Button`/`TextField`/tokens), igual aos
 * demais modais raiz (`ModalPermissaoPush`). Exibido só no 1º checkout
 * (`!cart.cpfCollected`, controlado pela tela Checkout antes de navegar
 * aqui) — regra fechada: CPF opcional no cadastro, obrigatório no 1º
 * checkout (NF/antifraude).
 * [Source: docs/PERGUNTAS_REGRAS_NEGOCIO.md#Rodada 2 — Cadastro do cliente]
 *
 * Religado para `client.auth.updateCpf` (Story 1.10, Task 3) — antes o CPF
 * só marcava `cart.cpfCollected` local, sem persistir `clientes.cpf` real.
 */
export default function ModalCPF({ navigation, route }: Props) {
  const cart = useCart();
  const { data: cliente } = useCurrentCliente();
  const [cpf, setCpf] = useState('');
  const [salvando, setSalvando] = useState(false);

  const digits = cpf.replace(/\D/g, '');
  const podeConfirmar = digits.length === 11 && !salvando;

  const handleConfirmar = async () => {
    setSalvando(true);
    try {
      if (cliente?.id) {
        await getDataClient().auth.updateCpf(cliente.id, digits);
      }
      cart.markCpfCollected();
      route.params?.onSubmit?.();
      navigation.goBack();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>Confirme seu CPF</Text>
        <Text style={styles.subtitle}>
          Precisamos do seu CPF na primeira compra para emitir a nota fiscal e prevenir fraudes. Não pedimos de
          novo nos próximos pedidos.
        </Text>
        <TextField
          label="CPF"
          value={cpf}
          onChangeText={(value) => setCpf(maskCpf(value))}
          placeholder="000.000.000-00"
          keyboardType="number-pad"
        />
        <Button title={salvando ? 'Confirmando...' : 'Confirmar'} onPress={handleConfirmar} disabled={!podeConfirmar} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: lightColors.bg.primary,
    borderTopLeftRadius: radii.modal,
    borderTopRightRadius: radii.modal,
    padding: spacing['6'],
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    color: lightColors.text.primary,
    marginBottom: spacing['2'],
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
    color: lightColors.text.secondary,
    marginBottom: spacing['5'],
  },
});
