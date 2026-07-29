import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { FinanceiroStackParamList } from '../../navigation/types';
import { formatBRL, formatBRLSigned } from './format';
import { CURRENT_ESTABELECIMENTO_ID } from '../catalogo/currentStore';
import { getExtrato, MESES_DISPONIVEIS, type ExtratoMes, type MovimentacaoExtrato } from './financeiroPresentation';

type Props = NativeStackScreenProps<FinanceiroStackParamList, 'ExtratoFinanceiro'>;

const EMPTY: ExtratoMes = { mesLabel: '', repasseLiquidoReais: 0, recebidoReais: 0, taxasKeepitReais: 0, movimentacoes: [] };

function MovimentacaoRow({ movimentacao }: { movimentacao: MovimentacaoExtrato }) {
  const isVenda = movimentacao.tipo === 'venda';
  return (
    <View style={styles.movRow}>
      <View
        style={[
          styles.movIcon,
          { backgroundColor: isVenda ? darkColors.bg.overlay : darkColors.bg.muted },
        ]}
      >
        <Ionicons
          name={isVenda ? 'arrow-up-outline' : 'arrow-down-outline'}
          size={18}
          color={isVenda ? darkColors.accent.brand : darkColors.text.tertiary}
        />
      </View>
      <View style={styles.movText}>
        <Text style={[styles.movTitulo, { color: darkColors.text.primary }]}>
          {isVenda ? `Venda #${movimentacao.numeroPedido}` : 'Saque · PIX'}
        </Text>
        <Text style={[styles.movSubtitulo, { color: darkColors.text.tertiary }]}>
          {isVenda
            ? `${movimentacao.dataLabel} · taxa −${formatBRL(movimentacao.taxaKeepitReais)}`
            : `${movimentacao.dataLabel} · ${movimentacao.status}`}
        </Text>
      </View>
      <Text style={[styles.movValor, { color: isVenda ? darkColors.accent.brand : darkColors.text.primary }]}>
        {isVenda ? formatBRLSigned(movimentacao.valorLiquidoReais) : formatBRLSigned(-movimentacao.valorReais)}
      </Text>
    </View>
  );
}

/**
 * Extrato financeiro — Story 0.11 (Task 4). Fiel a
 * `docs/design-refs/lojista-10-extrato.png` (painel P10): seletor de mês,
 * resumo (repasse líquido / recebido / taxas), lista "MOVIMENTAÇÕES".
 *
 * Religado para `client.analytics.monthlyStatement` real (Story 1.10, Task
 * 7) — o mês corrente (`MESES_DISPONIVEIS[0]`) mostra movimentações reais
 * derivadas de `db.pedidos`/`db.saques`; os demais meses do seletor
 * exercitam o estado vazio ("Nenhuma movimentação neste mês"), já que
 * `analytics.port` cobre apenas o mês corrente (ver `financeiroPresentation.ts`).
 */
export default function ExtratoFinanceiro({ navigation }: Props) {
  const [mes, setMes] = useState(MESES_DISPONIVEIS[0]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [extrato, setExtrato] = useState<ExtratoMes>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getExtrato(CURRENT_ESTABELECIMENTO_ID, mes)
      .then(setExtrato)
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setLoading(false));
  }

  useEffect(load, [mes]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          title="Extrato"
          onBack={() => navigation.goBack()}
          rightSlot={
            <View style={styles.mesWrapper}>
              <Pressable
                onPress={() => setMenuOpen((open) => !open)}
                style={[styles.mesButton, { backgroundColor: darkColors.bg.surface }]}
              >
                <Text style={[styles.mesLabel, { color: darkColors.text.primary }]}>{mes}</Text>
                <Ionicons name="chevron-down" size={14} color={darkColors.text.primary} />
              </Pressable>
              {menuOpen ? (
                <View style={[styles.mesMenu, { backgroundColor: darkColors.bg.elevated }]}>
                  {MESES_DISPONIVEIS.map((opcao) => (
                    <Pressable
                      key={opcao}
                      onPress={() => {
                        setMes(opcao);
                        setMenuOpen(false);
                      }}
                      style={styles.mesMenuItem}
                    >
                      <Text style={[styles.mesMenuLabel, { color: darkColors.text.primary }]}>{opcao}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          }
        />

        {loading ? (
          <ActivityIndicator color={darkColors.accent.brand} style={styles.loader} />
        ) : error ? (
          <View style={styles.centered}>
            <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>
              Não foi possível carregar o extrato agora.
            </Text>
            <PrimaryButton label="Tentar novamente" onPress={load} />
          </View>
        ) : (
          <>
            <View style={[styles.summaryCard, { backgroundColor: darkColors.bg.surface }]}>
              <Text style={[styles.summaryLabel, { color: darkColors.text.tertiary }]}>Repasse líquido</Text>
              <Text style={[styles.summaryValue, { color: darkColors.text.primary }]}>
                {formatBRL(extrato.repasseLiquidoReais)}
              </Text>
              <View style={[styles.summaryDivider, { backgroundColor: darkColors.border.default }]} />
              <View style={styles.summaryRow}>
                <View>
                  <Text style={[styles.summarySubLabel, { color: darkColors.text.tertiary }]}>Recebido</Text>
                  <Text style={[styles.summarySubValue, { color: darkColors.accent.brand }]}>
                    {formatBRL(extrato.recebidoReais)}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.summarySubLabel, { color: darkColors.text.tertiary }]}>Taxas Keepit</Text>
                  <Text style={[styles.summarySubValue, { color: darkColors.text.primary }]}>
                    {formatBRLSigned(-extrato.taxasKeepitReais)}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: darkColors.text.tertiary }]}>MOVIMENTAÇÕES</Text>

            {extrato.movimentacoes.length === 0 ? (
              <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>
                Nenhuma movimentação neste mês.
              </Text>
            ) : (
              extrato.movimentacoes.map((movimentacao) => (
                <MovimentacaoRow key={movimentacao.id} movimentacao={movimentacao} />
              ))
            )}
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
  mesWrapper: {
    position: 'relative',
  },
  mesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
  },
  mesLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.base.fontSize,
  },
  mesMenu: {
    position: 'absolute',
    top: 44,
    right: 0,
    borderRadius: radii.md,
    paddingVertical: spacing[1],
    minWidth: 140,
    zIndex: 10,
  },
  mesMenuItem: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  mesMenuLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
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
  summaryCard: {
    borderRadius: radii.card,
    padding: spacing[5],
    gap: spacing[1],
  },
  summaryLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
  },
  summaryValue: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
  },
  summaryDivider: {
    height: 1,
    marginVertical: spacing[3],
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summarySubLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
  },
  summarySubValue: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.md.fontSize,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    letterSpacing: typography.letterSpacing.section,
  },
  movRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[2],
  },
  movIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movText: {
    flex: 1,
  },
  movTitulo: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  movSubtitulo: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    marginTop: 2,
  },
  movValor: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
});
