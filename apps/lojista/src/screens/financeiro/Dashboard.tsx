import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { getDataClient } from '@keepit/core-data';
import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { PeriodTabs } from '../../components/PeriodTabs';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SimpleBarChart } from '../../components/SimpleBarChart';
import type { FinanceiroStackParamList } from '../../navigation/types';
import { CURRENT_ESTABELECIMENTO_ID } from '../catalogo/currentStore';
import { useFinanceiro } from './FinanceiroContext';
import { formatBRL, formatPercent } from './format';
import { getVendasResumo, PERIODOS, type Periodo, type VendasResumo } from './financeiroPresentation';

type Props = NativeStackScreenProps<FinanceiroStackParamList, 'Dashboard'>;

const EMPTY_VENDAS: VendasResumo = { totalReais: 0, variacaoPercent: 0, variacaoLabel: '', barras: [], destaqueIndex: -1 };

/**
 * Dashboard financeiro (Painel do lojista) — Story 0.11 (Task 1). Fiel a
 * `docs/design-refs/lojista-01-painel.png` (painel P1): header com nome da
 * loja, card de saldo + "a receber" + CTA "Solicitar saque", bloco "Vendas"
 * com tabs de período + mini-gráfico.
 *
 * [AUTO-DECISION] A seção "Pedidos novos" do painel P1 NÃO é implementada
 * aqui — não está no escopo desta story (AC1 só cobre saldo + vendas) e já é
 * o domínio completo de `PedidosStack`/`OrdersContext` (Story 0.10, tab
 * "Pedidos"). Evita duplicar dado/lógica entre duas tabs (reason: escopo
 * "NÃO fazer" da story pede fidelidade ao AC, não a cada pixel do frame).
 */
export default function Dashboard({ navigation }: Props) {
  const { carteira, carteiraLoading, carteiraError, reload, carteiraLiberacaoDias } = useFinanceiro();
  const [periodo, setPeriodo] = useState<Periodo>('7d');
  const [vendas, setVendas] = useState<VendasResumo>(EMPTY_VENDAS);
  const [vendasLoading, setVendasLoading] = useState(true);
  const [nomeLoja, setNomeLoja] = useState('Minha loja');

  useEffect(() => {
    let cancelled = false;
    setVendasLoading(true);
    getVendasResumo(CURRENT_ESTABELECIMENTO_ID, periodo)
      .then((resultado) => {
        if (!cancelled) setVendas(resultado);
      })
      .finally(() => {
        if (!cancelled) setVendasLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [periodo]);

  useEffect(() => {
    let cancelled = false;
    getDataClient()
      .store.getById(CURRENT_ESTABELECIMENTO_ID)
      .then((estabelecimento) => {
        if (!cancelled && estabelecimento) setNomeLoja(estabelecimento.nome_fantasia);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: darkColors.accent.brand }]}>
            <Text style={[styles.avatarLetter, { color: darkColors.bg.primary }]}>{nomeLoja.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.headerNome, { color: darkColors.text.primary }]}>{nomeLoja}</Text>
            <Text style={[styles.headerSubtitulo, { color: darkColors.text.tertiary }]}>Painel do lojista</Text>
          </View>
          <View style={[styles.bell, { backgroundColor: darkColors.bg.surface }]}>
            <Ionicons name="notifications-outline" size={18} color={darkColors.text.primary} />
          </View>
        </View>

        {carteiraError ? (
          <View style={[styles.card, { backgroundColor: darkColors.bg.surface }]}>
            <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>
              Não foi possível carregar seu saldo agora.
            </Text>
            <PrimaryButton label="Tentar novamente" onPress={reload} />
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: darkColors.bg.surface }]}>
            <Text style={[styles.cardLabel, { color: darkColors.text.tertiary }]}>Saldo disponível</Text>
            {carteiraLoading ? (
              <ActivityIndicator color={darkColors.accent.brand} style={styles.balanceLoader} />
            ) : (
              <>
                <Text style={[styles.balance, { color: darkColors.text.primary }]}>
                  {formatBRL(carteira.saldo_disponivel_reais)}
                </Text>
                <Text style={[styles.aReceber, { color: darkColors.text.tertiary }]}>
                  + {formatBRL(carteira.saldo_bloqueado_reais)} a receber (em até {carteiraLiberacaoDias} dias)
                </Text>
              </>
            )}
            <View style={styles.ctaSpacer}>
              <PrimaryButton label="Solicitar saque" onPress={() => navigation.navigate('Carteira')} />
            </View>
          </View>
        )}

        <View style={styles.vendasSection}>
          <View style={styles.vendasHeader}>
            <Text style={[styles.sectionTitle, { color: darkColors.text.primary }]}>Vendas</Text>
            <Pressable onPress={() => navigation.navigate('Vendas')} hitSlop={8} style={styles.verTudoRow}>
              <Text style={[styles.verTudo, { color: darkColors.accent.brand }]}>Ver tudo</Text>
              <Ionicons name="chevron-forward" size={16} color={darkColors.accent.brand} />
            </Pressable>
          </View>

          <PeriodTabs options={PERIODOS} value={periodo} onChange={setPeriodo} />

          {vendasLoading ? (
            <ActivityIndicator color={darkColors.accent.brand} style={styles.balanceLoader} />
          ) : (
            <>
              <Text style={[styles.vendasTotal, { color: darkColors.text.primary }]}>{formatBRL(vendas.totalReais)}</Text>
              <View style={styles.vendasVariacaoRow}>
                <Ionicons name="trending-up" size={14} color={darkColors.accent.brand} />
                <Text style={[styles.vendasVariacao, { color: darkColors.accent.brand }]}>
                  {formatPercent(vendas.variacaoPercent)} {vendas.variacaoLabel}
                </Text>
              </View>
              <View style={styles.chartSpacer}>
                <SimpleBarChart values={vendas.barras} highlightIndex={vendas.destaqueIndex} />
              </View>
            </>
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
    gap: spacing[5],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
  },
  headerText: {
    flex: 1,
  },
  headerNome: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
  },
  headerSubtitulo: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
    marginTop: 2,
  },
  bell: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: radii.card,
    padding: spacing[5],
    gap: spacing[2],
  },
  cardLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
  },
  balance: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['3xl'].fontSize,
  },
  balanceLoader: {
    marginVertical: spacing[3],
  },
  aReceber: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
  },
  ctaSpacer: {
    marginTop: spacing[3],
  },
  emptyText: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
  },
  vendasSection: {
    gap: spacing[3],
  },
  vendasHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
  },
  verTudoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verTudo: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.base.fontSize,
  },
  vendasTotal: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
  },
  vendasVariacaoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  vendasVariacao: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.base.fontSize,
  },
  chartSpacer: {
    marginTop: spacing[2],
  },
});
