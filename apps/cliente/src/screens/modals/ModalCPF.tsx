import { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getDataClient } from '@keepit/core-data';
import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import { Button, FormSheet, TextField } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { apenasDigitosCpf, isCpfValido, maskCpf } from '../../lib/cpf';
import { createCpfSubmissionController, type CpfSubmitResult } from '../../lib/cpfSubmission';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ModalCPF'>;

const CPF_INVALIDO = 'Digite um CPF válido.';
const CPF_NAO_SALVO = 'Não foi possível salvar seu CPF. Tente novamente.';

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
 *
 * Story 6.5 (AC2): "Confirmar" só habilita com CPF VÁLIDO (dígito
 * verificador, `apps/cliente/src/lib/cpf.ts`) — antes só checava a
 * contagem de 11 dígitos, sem validar de verdade.
 */
export default function ModalCPF({ navigation, route }: Props) {
  const cart = useCart();
  const { data: cliente } = useCurrentCliente();
  const controllerRef = useRef(createCpfSubmissionController());
  const [cpf, setCpf] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();

  const digits = apenasDigitosCpf(cpf);
  const invalidCpfError = digits.length === 11 && !isCpfValido(digits) ? CPF_INVALIDO : undefined;
  const fieldError = erro ?? invalidCpfError;

  const handleConfirmar = async () => {
    const controller = controllerRef.current;
    if (controller.isPending()) return;
    setErro(undefined);
    setSalvando(true);
    const result: CpfSubmitResult = await controller.submit({
      cpf,
      clienteId: cliente?.id,
      updateCpf: async (clienteId, digits) => {
        await getDataClient().auth.updateCpf(clienteId, digits);
      },
    });
    setSalvando(false);

    if (result.status === 'invalid') {
      setErro(CPF_INVALIDO);
      return;
    }
    if (result.status === 'save-failed') {
      setErro(CPF_NAO_SALVO);
      return;
    }
    if (result.status === 'busy') return;

    cart.markCpfCollected();
    route.params?.onSubmit?.();
    navigation.goBack();
  };

  return (
    <FormSheet
      footer={
        <Button
          title={salvando ? 'Confirmando...' : 'Confirmar'}
          onPress={handleConfirmar}
          disabled={!isCpfValido(digits) || salvando}
        />
      }
    >
      <Text style={styles.title}>Confirme seu CPF</Text>
      <Text style={styles.subtitle}>
        Precisamos do seu CPF na primeira compra para emitir a nota fiscal e prevenir fraudes. Não pedimos de
        novo nos próximos pedidos.
      </Text>
      <TextField
        label="CPF"
        value={cpf}
        onChangeText={(value) => {
          setErro(undefined);
          setCpf(maskCpf(value));
        }}
        placeholder="000.000.000-00"
        keyboardType="number-pad"
        editable={!salvando}
        error={fieldError}
      />
    </FormSheet>
  );
}

const styles = StyleSheet.create({
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
