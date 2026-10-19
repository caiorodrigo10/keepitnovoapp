import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import { Button, Screen, TextField } from '../../components/ui';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ConfirmacaoSMS'>;

/**
 * Confirmação SMS (Task 3, AC1, AC2, AC3).
 *
 * Sem referência visual dedicada no protótipo (`docs/design-refs/INDEX.md`
 * só cobre 14 telas do Cliente; esta não está entre elas) — layout segue o
 * design system (`_design-system-legend.png`: cores/tipografia) com
 * consistência ao restante do fluxo de auth.
 *
 * [Source: docs/prd/02-requirements.md#FR2] código de 4-6 dígitos via
 * Zenvia — aqui é **apenas o teclado/input visual**, sem envio real de SMS
 * (Zenvia é integração de backend, fora do Épico 0). Reenviar/contagem
 * regressiva é estado visual estático.
 *
 * **Story 2.6 (AC6, REL-008):** removida a navegação imperativa morta
 * (`navigation.getParent()?.navigate('Main', ...)`). Esta tela continua
 * fora do inventário de rotas alcançáveis desde a decisão 10.4 (auth por
 * e-mail/senha via Supabase, não mais telefone + SMS) — stub inativo, não
 * reativado por esta story. "Confirmar" não navega nem chama
 * `auth.port.confirmPhone` (que exige um `clienteId` que esta rota não
 * recebe como parâmetro).
 */
export default function ConfirmacaoSMS(_props: Props) {
  const [codigo, setCodigo] = useState('');

  function handleConfirmar() {
    // Story 2.6 (AC6): sem navegação imperativa — ver docstring acima.
  }

  return (
    <Screen>
      <Text style={styles.brand}>KEEPITHUB</Text>
      <Text style={styles.title}>Confirme seu telefone</Text>
      <Text style={styles.subtitle}>
        Enviamos um código de 4 a 6 dígitos por SMS para o telefone informado no cadastro.
      </Text>

      <TextField
        label="Código de confirmação"
        value={codigo}
        onChangeText={(value) => setCodigo(value.replace(/[^0-9]/g, '').slice(0, 6))}
        placeholder="000000"
        keyboardType="number-pad"
      />

      <View style={styles.resendRow}>
        <Text style={styles.resendText}>Não recebeu? </Text>
        <Pressable hitSlop={8}>
          <Text style={styles.resendLink}>Reenviar código</Text>
        </Pressable>
      </View>

      <Button
        title="Confirmar"
        onPress={handleConfirmar}
        disabled={codigo.length < 4}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    fontFamily: 'HankenGrotesk-ExtraBold',
    fontSize: typography.sizes.xl.fontSize,
    letterSpacing: typography.letterSpacing.wide,
    color: lightColors.text.primary,
    marginBottom: spacing['6'],
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
    lineHeight: typography.sizes['2xl'].lineHeight,
    color: lightColors.text.primary,
    marginBottom: spacing['1'],
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight,
    color: lightColors.text.secondary,
    marginBottom: spacing['6'],
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing['8'],
  },
  resendText: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
  },
  resendLink: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.accent.successFg,
  },
});
