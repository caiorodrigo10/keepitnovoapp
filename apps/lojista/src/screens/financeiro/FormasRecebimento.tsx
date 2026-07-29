import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { FormField } from '../../components/FormField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { FinanceiroStackParamList } from '../../navigation/types';
import { useFinanceiro } from './FinanceiroContext';

type Props = NativeStackScreenProps<FinanceiroStackParamList, 'FormasRecebimento'>;

/**
 * Formas de recebimento (chave PIX) — Story 0.11 (Task 5, AC5). Acessível a
 * partir de Configurações (item "Formas de recebimento", já ligado desde a
 * Story 0.8) e do link "Alterar" em `Carteira.tsx` (bloco "RECEBER VIA").
 *
 * O protótipo não tem um frame dedicado para esta tela (ver `INDEX.md`) —
 * segue por analogia o mesmo bloco "RECEBER VIA" visível no painel P5
 * (`lojista-05-carteira.png`), agora editável.
 *
 * [TECH DEBT] `WalletPort` não expõe nenhum método para chave PIX (nem
 * leitura nem escrita) — edição fica local-only via `FinanceiroContext`
 * (`updateChavePix`), sem persistência real nem validação bancária (AC5/AC8).
 */
export default function FormasRecebimento({ navigation }: Props) {
  const { chavePix, updateChavePix } = useFinanceiro();
  const [valor, setValor] = useState(chavePix.valor);

  function onSalvar() {
    updateChavePix({ tipo: 'PIX', valor: valor.trim() || chavePix.valor });
    navigation.goBack();
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <ScreenHeader title="Formas de recebimento" onBack={() => navigation.goBack()} />

        <Text style={[styles.description, { color: darkColors.text.tertiary }]}>
          Chave PIX usada para receber seus saques. Sem validação bancária real neste estágio do app.
        </Text>

        <FormField
          label="Chave PIX"
          value={valor}
          onChangeText={setValor}
          placeholder="email, telefone, CPF/CNPJ ou chave aleatória"
          keyboardType="email-address"
        />

        <View style={styles.ctaSpacer}>
          <PrimaryButton label="Salvar" onPress={onSalvar} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    gap: spacing[5],
  },
  description: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
  },
  ctaSpacer: {
    marginTop: spacing[2],
  },
});
