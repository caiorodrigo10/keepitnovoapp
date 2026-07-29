import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { Saque } from '@keepit/core-data';
import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { PrimaryButton } from '../../components/PrimaryButton';
import type { FinanceiroStackParamList } from '../../navigation/types';
import { useFinanceiro } from './FinanceiroContext';
import { formatBRL, formatDataCurta } from './format';

type Props = NativeStackScreenProps<FinanceiroStackParamList, 'Carteira'>;

const SAQUE_STATUS_LABEL: Record<Saque['status'], string> = {
  solicitado: 'Solicitado',
  processando: 'Processando',
  concluido: 'Concluído',
  erro: 'Erro',
};

/**
 * Carteira + fluxo "Solicitar saque" — Story 0.11 (Task 3). Fiel a
 * `docs/design-refs/lojista-05-carteira.png` (painel P5): card de saldo
 * (verde, accent brand), formulário de saque inline, bloco "RECEBER VIA" com
 * ação "Alterar", botão "Solicitar saque", lista "Saques recentes".
 *
 * [AUTO-DECISION] O protótipo (P5) mostra TUDO numa única tela — inclusive o
 * formulário de saque e "RECEBER VIA" — e AC5 exige que "Alterar" fique
 * especificamente "na Carteira". Por isso o formulário vive aqui (não na rota
 * `SolicitarSaque`, que Story 0.3 já reservava). `SolicitarSaque` é reaproveitada
 * como tela de CONFIRMAÇÃO pós-envio (ver `SolicitarSaque.tsx`), preservando a
 * rota do esqueleto de navegação sem duplicar o formulário em dois lugares.
 */
export default function Carteira({ navigation }: Props) {
  const {
    carteira,
    carteiraLoading,
    carteiraError,
    reload,
    saquesRecentes,
    saquesLoading,
    sacadoNoMesReais,
    chavePix,
    saqueMinimoReais,
    requestWithdrawal,
  } = useFinanceiro();

  const [valorInput, setValorInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!carteiraLoading && !carteiraError) {
      setValorInput(carteira.saldo_disponivel_reais.toFixed(2).replace('.', ','));
    }
  }, [carteiraLoading, carteiraError, carteira.saldo_disponivel_reais]);

  const valorNumerico = Number(valorInput.replace(/\./g, '').replace(',', '.')) || 0;
  const abaixoDoMinimo = valorInput.length > 0 && valorNumerico < saqueMinimoReais;

  async function onSolicitarSaque() {
    setFormError(null);
    if (abaixoDoMinimo || valorNumerico <= 0) {
      setFormError(`Valor mínimo de saque: ${formatBRL(saqueMinimoReais)}`);
      return;
    }
    setSubmitting(true);
    try {
      await requestWithdrawal(valorNumerico);
      navigation.navigate('SolicitarSaque');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível solicitar o saque agora.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: darkColors.text.primary }]}>Carteira</Text>

        {carteiraError ? (
          <View style={[styles.card, { backgroundColor: darkColors.bg.surface }]}>
            <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>
              Não foi possível carregar sua carteira agora.
            </Text>
            <PrimaryButton label="Tentar novamente" onPress={reload} />
          </View>
        ) : carteiraLoading ? (
          <ActivityIndicator color={darkColors.accent.brand} style={styles.loader} />
        ) : (
          <>
            <View style={[styles.balanceCard, { backgroundColor: darkColors.accent.brand }]}>
              <Text style={[styles.balanceLabel, { color: darkColors.accent.success }]}>Saldo disponível</Text>
              <Text style={[styles.balanceValue, { color: darkColors.bg.primary }]}>
                {formatBRL(carteira.saldo_disponivel_reais)}
              </Text>
              <View style={[styles.balanceDivider, { backgroundColor: darkColors.bg.primary, opacity: 0.15 }]} />
              <View style={styles.balanceRow}>
                <View>
                  <Text style={[styles.balanceSubLabel, { color: darkColors.accent.success }]}>A receber</Text>
                  <Text style={[styles.balanceSubValue, { color: darkColors.bg.primary }]}>
                    {formatBRL(carteira.saldo_bloqueado_reais)}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.balanceSubLabel, { color: darkColors.accent.success }]}>Sacado no mês</Text>
                  <Text style={[styles.balanceSubValue, { color: darkColors.bg.primary }]}>
                    {formatBRL(sacadoNoMesReais)}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: darkColors.text.primary }]}>Solicitar saque</Text>

            <View style={[styles.inputCard, { backgroundColor: darkColors.bg.surface }]}>
              <Text style={[styles.inputLabel, { color: darkColors.text.tertiary }]}>Valor do saque</Text>
              <View style={styles.inputRow}>
                <Text style={[styles.inputPrefix, { color: darkColors.text.tertiary }]}>R$</Text>
                <TextInput
                  value={valorInput}
                  onChangeText={setValorInput}
                  keyboardType="decimal-pad"
                  style={[styles.input, { color: darkColors.text.primary }]}
                  placeholder="0,00"
                  placeholderTextColor={darkColors.text.placeholder}
                />
              </View>
            </View>
            {abaixoDoMinimo ? (
              <Text style={[styles.warningText, { color: darkColors.accent.warning }]}>
                Valor mínimo de saque: {formatBRL(saqueMinimoReais)}
              </Text>
            ) : null}

            <View style={[styles.pixCard, { backgroundColor: darkColors.bg.surface }]}>
              <View style={[styles.pixIcon, { backgroundColor: darkColors.bg.muted }]}>
                <Ionicons name="flash-outline" size={18} color={darkColors.accent.brand} />
              </View>
              <View style={styles.pixText}>
                <Text style={[styles.pixLabel, { color: darkColors.text.tertiary }]}>RECEBER VIA</Text>
                <Text style={[styles.pixValue, { color: darkColors.text.primary }]}>
                  {chavePix.tipo} · {chavePix.valor}
                </Text>
              </View>
              <Text
                style={[styles.pixAlterar, { color: darkColors.accent.brand }]}
                onPress={() => navigation.navigate('FormasRecebimento')}
              >
                Alterar
              </Text>
            </View>

            {formError ? <Text style={[styles.warningText, { color: darkColors.accent.warning }]}>{formError}</Text> : null}

            <PrimaryButton
              label={submitting ? 'Solicitando...' : 'Solicitar saque'}
              onPress={onSolicitarSaque}
              disabled={submitting || valorNumerico <= 0 || abaixoDoMinimo}
            />
          </>
        )}

        <View style={styles.saquesSection}>
          <Text style={[styles.sectionTitle, { color: darkColors.text.primary }]}>Saques recentes</Text>
          {saquesLoading ? (
            <ActivityIndicator color={darkColors.accent.brand} />
          ) : saquesRecentes.length === 0 ? (
            <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>Nenhum saque realizado ainda.</Text>
          ) : (
            saquesRecentes.map((saque) => (
              <View key={saque.id} style={styles.saqueRow}>
                <View style={[styles.saqueIcon, { backgroundColor: darkColors.bg.muted }]}>
                  <Ionicons name="checkmark" size={16} color={darkColors.accent.brand} />
                </View>
                <View style={styles.saqueText}>
                  <Text style={[styles.saqueData, { color: darkColors.text.primary }]}>
                    {formatDataCurta(saque.solicitado_em)} · PIX
                  </Text>
                  <Text style={[styles.saqueStatus, { color: darkColors.text.tertiary }]}>
                    {SAQUE_STATUS_LABEL[saque.status]}
                  </Text>
                </View>
                <Text style={[styles.saqueValor, { color: darkColors.text.primary }]}>{formatBRL(saque.valor_reais)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
    paddingBottom: spacing[8],
    gap: spacing[4],
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
  },
  loader: {
    marginTop: spacing[8],
  },
  card: {
    borderRadius: radii.card,
    padding: spacing[5],
    gap: spacing[3],
  },
  emptyText: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
  },
  balanceCard: {
    borderRadius: radii.card,
    padding: spacing[5],
    gap: spacing[1],
  },
  balanceLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
  },
  balanceValue: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['3xl'].fontSize,
  },
  balanceDivider: {
    height: 1,
    marginVertical: spacing[3],
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balanceSubLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
  },
  balanceSubValue: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.md.fontSize,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
  },
  inputCard: {
    borderRadius: radii.card,
    padding: spacing[4],
    gap: spacing[1],
  },
  inputLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing[2],
  },
  inputPrefix: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
  },
  input: {
    flex: 1,
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
    padding: 0,
  },
  warningText: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
  },
  pixCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: radii.card,
    padding: spacing[4],
  },
  pixIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pixText: {
    flex: 1,
  },
  pixLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.xs.fontSize,
    letterSpacing: typography.letterSpacing.section,
  },
  pixValue: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    marginTop: 2,
  },
  pixAlterar: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.base.fontSize,
  },
  saquesSection: {
    gap: spacing[3],
    marginTop: spacing[2],
  },
  saqueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  saqueIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saqueText: {
    flex: 1,
  },
  saqueData: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
  },
  saqueStatus: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    marginTop: 2,
  },
  saqueValor: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
});
