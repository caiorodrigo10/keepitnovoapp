import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import type { Saque } from '@keepit/core-data';
import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { PrimaryButton } from '../../components/PrimaryButton';
import { useFinanceiro } from './FinanceiroContext';
import { formatBRL, formatDataCurta } from './format';

const SAQUE_STATUS_LABEL: Record<Saque['status'], string> = {
  solicitado: 'Solicitado',
  processando: 'Processando',
  concluido: 'Concluído',
  erro: 'Erro',
};

/** Carteira com saldo e histórico; novos pagamentos seguem lotes semanais. */
export default function Carteira() {
  const {
    carteira,
    carteiraLoading,
    carteiraError,
    reload,
    saquesRecentes,
    saquesLoading,
    sacadoNoMesReais,
  } = useFinanceiro();

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

            <Text style={[styles.sectionTitle, { color: darkColors.text.primary }]}>Repasses semanais</Text>
            <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>
              O saldo disponível entra nos lotes preparados pelo Admin. O PIX é registrado após a transferência manual.
            </Text>
          </>
        )}

        <View style={styles.saquesSection}>
          <Text style={[styles.sectionTitle, { color: darkColors.text.primary }]}>Histórico de PIX</Text>
          {saquesLoading ? (
            <ActivityIndicator color={darkColors.accent.brand} />
          ) : saquesRecentes.length === 0 ? (
            <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>Nenhum PIX registrado ainda.</Text>
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
