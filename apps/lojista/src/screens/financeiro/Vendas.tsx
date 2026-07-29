import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { PeriodTabs } from '../../components/PeriodTabs';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SimpleBarChart } from '../../components/SimpleBarChart';
import type { FinanceiroStackParamList } from '../../navigation/types';
import { formatBRL, formatPercent } from './format';
import { CURRENT_ESTABELECIMENTO_ID } from '../catalogo/currentStore';
import { getVendasDetalhe, PERIODOS, type Periodo, type VendasDetalhe } from './financeiroPresentation';

type Props = NativeStackScreenProps<FinanceiroStackParamList, 'Vendas'>;

const EMPTY: VendasDetalhe = {
  totalReais: 0,
  variacaoPercent: 0,
  variacaoLabel: '',
  barras: [],
  destaqueIndex: -1,
  pedidos: 0,
  ticketMedioReais: 0,
  itensVendidos: 0,
  retiradasOkPercent: 0,
  topProdutos: [],
};

/**
 * Vendas detalhada — Story 0.11 (Task 2). Fiel a
 * `docs/design-refs/lojista-04-vendas.png` (painel P4): tabs de período
 * (reaproveitadas do Dashboard, `PeriodTabs`), total + variação, mini-gráfico,
 * grid de métricas, "Top produtos".
 *
 * [AUTO-DECISION] Rota nova em `FinanceiroStackParamList` — o esqueleto de
 * navegação da Story 0.3 registrou apenas 5 stubs (Dashboard, Carteira,
 * SolicitarSaque, ExtratoFinanceiro, FormasRecebimento), sem uma rota
 * dedicada para "Vendas" mesmo esta story listando `Vendas.tsx` em File
 * Locations (Dev Notes). Adicionar a rota é extensão de `apps/lojista/**`
 * (dentro do escopo desta execução), não uma mudança de framework/pacote.
 * Acessível a partir do link "Ver tudo" no bloco "Vendas" do Dashboard.
 */
export default function Vendas({ navigation }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('30d');
  const [detalhe, setDetalhe] = useState<VendasDetalhe>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getVendasDetalhe(CURRENT_ESTABELECIMENTO_ID, periodo)
      .then(setDetalhe)
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setLoading(false));
  }

  useEffect(load, [periodo]);

  const metricas = [
    { label: 'Pedidos', valor: String(detalhe.pedidos) },
    { label: 'Ticket médio', valor: formatBRL(detalhe.ticketMedioReais) },
    { label: 'Itens vendidos', valor: String(detalhe.itensVendidos) },
    { label: 'Retiradas ok', valor: `${detalhe.retiradasOkPercent}%` },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="Vendas" onBack={() => navigation.goBack()} />

        <PeriodTabs options={PERIODOS} value={periodo} onChange={setPeriodo} />

        {loading ? (
          <ActivityIndicator color={darkColors.accent.brand} style={styles.loader} />
        ) : error ? (
          <View style={styles.centered}>
            <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>
              Não foi possível carregar as vendas agora.
            </Text>
            <PrimaryButton label="Tentar novamente" onPress={load} />
          </View>
        ) : (
          <>
            <View>
              <Text style={[styles.totalLabel, { color: darkColors.text.tertiary }]}>Total no período</Text>
              <Text style={[styles.total, { color: darkColors.text.primary }]}>{formatBRL(detalhe.totalReais)}</Text>
              <View style={styles.variacaoRow}>
                <Ionicons name="trending-up" size={16} color={darkColors.accent.brand} />
                <Text style={[styles.variacao, { color: darkColors.accent.brand }]}>
                  {formatPercent(detalhe.variacaoPercent)} {detalhe.variacaoLabel}
                </Text>
              </View>
            </View>

            <SimpleBarChart values={detalhe.barras} highlightIndex={detalhe.destaqueIndex} height={140} />

            <View style={styles.metricsGrid}>
              {metricas.map((metrica) => (
                <View key={metrica.label} style={[styles.metricCard, { backgroundColor: darkColors.bg.surface }]}>
                  <Text style={[styles.metricValor, { color: darkColors.text.primary }]}>{metrica.valor}</Text>
                  <Text style={[styles.metricLabel, { color: darkColors.text.tertiary }]}>{metrica.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.topProdutosSection}>
              <Text style={[styles.sectionTitle, { color: darkColors.text.primary }]}>Top produtos</Text>
              {detalhe.topProdutos.length === 0 ? (
                <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>
                  Nenhuma venda registrada neste período.
                </Text>
              ) : (
                detalhe.topProdutos.map((produto) => (
                  <View key={produto.nome} style={styles.produtoRow}>
                    <View style={[styles.produtoThumb, { backgroundColor: darkColors.bg.muted }]} />
                    <Text style={[styles.produtoNome, { color: darkColors.text.primary }]} numberOfLines={1}>
                      {produto.nome}
                    </Text>
                    <Text style={[styles.produtoValor, { color: darkColors.accent.brand }]}>
                      {formatBRL(produto.valorReais)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
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
    gap: spacing[5],
  },
  loader: {
    marginTop: spacing[8],
  },
  centered: {
    alignItems: 'center',
    gap: spacing[4],
    paddingVertical: spacing[8],
  },
  emptyText: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
    textAlign: 'center',
  },
  totalLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
  },
  total: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['3xl'].fontSize,
  },
  variacaoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: 2,
  },
  variacao: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.base.fontSize,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  metricCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radii.card,
    padding: spacing[4],
    gap: spacing[1],
  },
  metricValor: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
  },
  metricLabel: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
  },
  topProdutosSection: {
    gap: spacing[3],
  },
  sectionTitle: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
  },
  produtoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  produtoThumb: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
  },
  produtoNome: {
    flex: 1,
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
  },
  produtoValor: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
});
