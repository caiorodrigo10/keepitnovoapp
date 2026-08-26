import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock } from '../../components/discovery';
import { Button, Screen } from '../../components/ui';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { useHubDetail } from '../../hooks/useHubDetail';
import { useStoreDetail } from '../../hooks/useStoreDetail';
import { usePedidoDetail } from '../../hooks/usePedidoDetail';
import { formatReais } from '../../lib/format';
import { isPedidoCancelado, PEDIDO_STATUS_LABEL } from '../../lib/pedidoStatus';
import type { PedidosStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PedidosStackParamList, 'Recibo'>;

/**
 * "Recibo / pedido concluído" (Task 4, AC1/AC2/AC3/AC4) — fiel a
 * `cliente-14-pedido-concluido.png`: header "Pedido #{numero}", faixa de
 * status com ícone de check + data/hora + hub, lista de itens (snapshot do
 * pedido, nunca recalculado), Subtotal/Taxa/Total e forma de pagamento.
 *
 * Também cobre o desfecho de ramos de exceção (cancelado/não retirado/
 * lojista não veio) reaproveitando o MESMO layout — só a faixa de status
 * muda de tom (verde para `entregue`, aviso para os demais terminais),
 * evitando uma tela dedicada a cada desfecho terminal.
 *
 * **Story 6.16 (AC1-AC4) — [IDS] ADAPT, dois gaps confirmados por leitura
 * direta do código, corrigidos aqui:**
 * 1. **Hub ausente** (AC2): esta tela nunca exibia hub, apesar do AC1 do
 *    épico pedir "itens, valores, hub, data" — reaproveita o MESMO padrão
 *    já validado em `ModalConfirmarPin.tsx`
 *    (`useHubDetail(pedido?.hub_id ?? '', { forceEmpty: !pedido })`).
 * 2. **Rótulo financeiro incorreto** (AC3): a seção de totais rotulava
 *    "Taxa de serviço" mas mostrava o VALOR de `taxa_deslocamento_reais`, e
 *    nunca exibia `taxa_servico_comprador_reais` — o MESMO bug que
 *    `Checkout.tsx` já teve e corrigiu (Rodada 8,
 *    `docs/PERGUNTAS_REGRAS_NEGOCIO.md` linha 561). Corrigido para o MESMO
 *    padrão do Checkout: Subtotal / Taxa de deslocamento / Taxa de serviço
 *    (tag "provisório", só quando `> 0`) / Total. `taxa_keepit_reais`
 *    (cobrada do lojista) continua NUNCA exibida ao cliente — mesma regra
 *    do Checkout.
 *
 * **Fronteira com o Épico 7 (AC4):** esta tela só EXIBE o recibo —
 * nenhum lançamento de carteira/ledger nem contagem de D+7
 * (`businessConfig.carteiraLiberacaoDias`) acontece aqui.
 */
export default function Recibo({ route, navigation }: Props) {
  const { data: cliente } = useCurrentCliente();
  const { data: pedido, loading, error } = usePedidoDetail(cliente?.id ?? null, route.params?.pedidoId);
  const { data: estabelecimento } = useStoreDetail(pedido?.estabelecimento_id ?? '', { forceEmpty: !pedido });
  const { data: hub } = useHubDetail(pedido?.hub_id ?? '', { forceEmpty: !pedido });

  const cancelado = pedido ? isPedidoCancelado(pedido.status) : false;

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.roundButton}>
          <Text style={styles.roundButtonIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{pedido ? `Pedido #${pedido.numero}` : 'Pedido'}</Text>
        <View style={styles.roundButton} />
      </View>

      {loading && <AsyncStateBlock kind="loading" />}
      {!loading && !!error && <AsyncStateBlock kind="error" />}
      {!loading && !error && !pedido && (
        <AsyncStateBlock kind="empty" emptyLabel="Pedido não encontrado." />
      )}

      {!loading && !error && pedido && (
        <>
          <View style={[styles.statusFaixa, cancelado && styles.statusFaixaAlerta]}>
            <View style={[styles.statusCheck, cancelado && styles.statusCheckAlerta]}>
              <Text style={styles.statusCheckGlyph}>{cancelado ? '!' : '✓'}</Text>
            </View>
            <View>
              <Text style={styles.statusLabel}>{PEDIDO_STATUS_LABEL[pedido.status]}</Text>
              {pedido.entregue_em && <Text style={styles.statusData}>{formatData(pedido.entregue_em)}</Text>}
            </View>
          </View>

          {estabelecimento && (
            <View style={styles.lojaRow}>
              <Text style={styles.lojaNome}>{estabelecimento.nome_fantasia}</Text>
              <Text style={styles.lojaSub}>Retirado por você</Text>
            </View>
          )}

          {hub && (
            <View style={styles.hubRow}>
              <Text style={styles.hubNome}>{hub.nome}</Text>
              <Text style={styles.hubEndereco}>{hub.endereco}</Text>
            </View>
          )}

          <View style={styles.itens}>
            {pedido.itens.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemQtd}>{item.quantidade}x</Text>
                <Text style={styles.itemNome}>{item.nome_snapshot}</Text>
                <Text style={styles.itemValor}>{formatReais(item.subtotal_reais)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.divider} />

          <View style={styles.totaisRow}>
            <Text style={styles.totaisLabel}>Subtotal</Text>
            <Text style={styles.totaisValue}>{formatReais(pedido.subtotal_produtos_reais)}</Text>
          </View>
          <View style={styles.totaisRow}>
            <Text style={styles.totaisLabel}>Taxa de deslocamento</Text>
            <Text style={styles.totaisValue}>{formatReais(pedido.taxa_deslocamento_reais)}</Text>
          </View>
          {pedido.taxa_servico_comprador_reais > 0 && (
            <View style={styles.totaisRow}>
              <View style={styles.taxaServicoLabelRow}>
                <Text style={styles.totaisLabel}>Taxa de serviço</Text>
                <Text style={styles.provisorioTag}>provisório</Text>
              </View>
              <Text style={styles.totaisValue}>{formatReais(pedido.taxa_servico_comprador_reais)}</Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.totaisRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatReais(pedido.total_pago_reais)}</Text>
          </View>

          <View style={styles.pagamento}>
            <Text style={styles.pagamentoLabel}>
              Pago com {pedido.forma_pagamento === 'pix' ? 'PIX' : 'cartão'}
            </Text>
          </View>

          <Button title="Comprar de novo" onPress={() => navigation.getParent()?.navigate('HomeTab' as never)} />
        </>
      )}
    </Screen>
  );
}

function formatData(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') +
    ', ' +
    date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing['5'],
  },
  roundButton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonIcon: {
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    color: lightColors.text.primary,
  },
  statusFaixa: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    padding: spacing['4'],
    marginBottom: spacing['4'],
  },
  statusFaixaAlerta: {
    backgroundColor: lightColors.accent.successBgAlt,
  },
  statusCheck: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: lightColors.accent.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing['3'],
  },
  statusCheckAlerta: {
    backgroundColor: lightColors.accent.warning,
  },
  statusCheckGlyph: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
  statusLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
  statusData: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.text.secondary,
    marginTop: 2,
  },
  lojaRow: {
    marginBottom: spacing['4'],
  },
  lojaNome: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
  lojaSub: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
    marginTop: 2,
  },
  hubRow: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    padding: spacing['3'],
    marginBottom: spacing['4'],
  },
  hubNome: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.primary,
  },
  hubEndereco: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.text.secondary,
    marginTop: 2,
  },
  itens: {
    marginBottom: spacing['2'],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing['1'],
  },
  itemQtd: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.successFg,
    marginRight: spacing['2'],
  },
  itemNome: {
    flex: 1,
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.primary,
  },
  itemValor: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.primary,
  },
  divider: {
    height: 1,
    backgroundColor: lightColors.border.default,
    marginVertical: spacing['2'],
  },
  totaisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing['1'],
  },
  totaisLabel: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
  },
  totaisValue: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
  },
  taxaServicoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2'],
  },
  provisorioTag: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.accent.warning,
    textTransform: 'uppercase',
  },
  totalLabel: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  totalValue: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  pagamento: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    padding: spacing['3'],
    marginVertical: spacing['4'],
  },
  pagamentoLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.primary,
  },
});
