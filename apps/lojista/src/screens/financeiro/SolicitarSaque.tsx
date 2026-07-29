import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { PrimaryButton } from '../../components/PrimaryButton';
import type { FinanceiroStackParamList } from '../../navigation/types';
import { useFinanceiro } from './FinanceiroContext';
import { formatBRL } from './format';

type Props = NativeStackScreenProps<FinanceiroStackParamList, 'SolicitarSaque'>;

/**
 * Confirmação de saque solicitado — Story 0.11 (Task 3, AC8).
 *
 * [AUTO-DECISION] Esta rota (reservada desde a Story 0.3) vira a tela de
 * CONFIRMAÇÃO pós-envio do formulário de `Carteira.tsx` — ver nota em
 * `Carteira.tsx` sobre por que o formulário em si vive lá (fidelidade ao
 * painel P5 + AC5 exigindo "Alterar" na Carteira). Sem chamada de rede real
 * (AC8) — apenas exibe o `lastSaque` já criado via `wallet.port.requestWithdrawal`
 * no `FinanceiroContext`.
 */
export default function SolicitarSaque({ navigation }: Props) {
  const { lastSaque } = useFinanceiro();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: darkColors.accent.brand }]}>
          <Ionicons name="checkmark" size={32} color={darkColors.bg.primary} />
        </View>

        <Text style={[styles.title, { color: darkColors.text.primary }]}>Saque solicitado!</Text>

        {lastSaque ? (
          <>
            <Text style={[styles.valor, { color: darkColors.text.primary }]}>{formatBRL(lastSaque.valor_reais)}</Text>
            <Text style={[styles.subtitle, { color: darkColors.text.tertiary }]}>
              Você receberá via PIX assim que o processamento for concluído. Acompanhe o status em "Saques recentes"
              na Carteira.
            </Text>
          </>
        ) : (
          <Text style={[styles.subtitle, { color: darkColors.text.tertiary }]}>
            Nenhum saque em andamento no momento.
          </Text>
        )}

        <View style={styles.ctaSpacer}>
          <PrimaryButton label="Voltar para Carteira" onPress={() => navigation.navigate('Carteira')} />
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    gap: spacing[3],
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
  },
  valor: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['3xl'].fontSize,
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    textAlign: 'center',
  },
  ctaSpacer: {
    marginTop: spacing[5],
    alignSelf: 'stretch',
  },
});
