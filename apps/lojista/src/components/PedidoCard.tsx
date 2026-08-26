import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Pedido } from '@keepit/core-data';
import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { useOrdersContext } from '../screens/pedidos/OrdersContext';
import { formatReais, getStatusBadge, inicialDoNome, tempoRelativo } from '../screens/pedidos/statusMeta';
import { tempoAceiteTexto } from '../screens/pedidos/tempoAceite';

/**
 * Card de pedido da lista "Pedidos" — Story 0.10 (Task 2/8). Fiel a
 * `docs/design-refs/lojista-02-pedidos.png` (painel P2): avatar com inicial,
 * nome, "Pedido #{numero} · há {tempo}", badge de status, resumo dos itens,
 * valor total, CTA contextual conforme o status.
 *
 * O CTA por status é uma [AUTO-DECISION]: o protótipo mostra um botão de
 * ação rápida diferente por card ("Aceitar pedido" / "Marcar pronto" /
 * "Confirmar retirada") — para os status `aceito`/`em_preparo`/`saindo_hub`
 * o botão navega para o Detalhe/separar (Task 5) em vez de disparar a
 * transição diretamente, preservando o checklist de separação como o único
 * caminho real para `markReadyForHub` (Task 5/6).
 */
export interface PedidoCardProps {
  pedido: Pedido;
  onPress: () => void;
  onAceitar?: () => void;
  onRecusar?: () => void;
  onAcaoStatus?: () => void;
  /** Estilo "discreto" (opacidade reduzida) usado no histórico "Concluídos" — Task 8. */
  discreet?: boolean;
}

function acaoLabelPorStatus(pedido: Pedido): string | null {
  switch (pedido.status) {
    case 'aceito':
    case 'em_preparo':
      return 'Marcar pronto';
    case 'saindo_hub':
      return 'Cheguei ao hub';
    case 'no_hub':
      return 'Confirmar retirada';
    default:
      return null;
  }
}

export function PedidoCard({ pedido, onPress, onAceitar, onRecusar, onAcaoStatus, discreet = false }: PedidoCardProps) {
  const { nomeCliente: resolveNomeCliente } = useOrdersContext();
  const badge = getStatusBadge(pedido.status);
  const nomeCliente = resolveNomeCliente(pedido.cliente_id);
  const resumoItens = pedido.itens.map((item) => item.nome_snapshot).join(', ');
  const acaoLabel = acaoLabelPorStatus(pedido);
  const isNovo = pedido.status === 'aguardando_aceite';

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: darkColors.bg.surface, opacity: discreet ? 0.7 : 1 },
        isNovo && styles.cardDestaque,
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: darkColors.bg.overlay }]}>
          <Text style={[styles.avatarLetter, { color: darkColors.accent.brand }]}>{inicialDoNome(nomeCliente)}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.nome, { color: darkColors.text.primary }]}>{nomeCliente}</Text>
          <Text style={[styles.subtitulo, { color: darkColors.text.tertiary }]}>
            Pedido #{pedido.numero} · {tempoRelativo(pedido.criado_em)}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeLabel, { color: badge.fg }]}>{badge.label}</Text>
        </View>
      </View>

      <Text numberOfLines={1} style={[styles.itens, { color: darkColors.text.secondary }]}>
        {pedido.itens.length} {pedido.itens.length === 1 ? 'item' : 'itens'} · {resumoItens}
      </Text>

      {isNovo ? (
        <Text style={[styles.prazoAceite, { color: darkColors.text.tertiary }]}>
          {tempoAceiteTexto(pedido.criado_em)}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <Text style={[styles.total, { color: darkColors.text.primary }]}>{formatReais(pedido.total_pago_reais)}</Text>

        {isNovo ? (
          <View style={styles.acoesNovo}>
            {onRecusar ? (
              <Pressable onPress={onRecusar} hitSlop={8}>
                <Text style={[styles.recusarLink, { color: darkColors.text.tertiary }]}>Recusar</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onAceitar}
              style={[styles.ctaButton, { backgroundColor: darkColors.accent.brand }]}
            >
              <Text style={[styles.ctaLabel, { color: darkColors.bg.primary }]}>Aceitar pedido</Text>
            </Pressable>
          </View>
        ) : acaoLabel && onAcaoStatus ? (
          <Pressable
            onPress={onAcaoStatus}
            style={[
              styles.ctaButton,
              pedido.status === 'no_hub'
                ? { backgroundColor: darkColors.accent.brand }
                : { backgroundColor: 'transparent', borderWidth: 1, borderColor: darkColors.border.muted },
            ]}
          >
            <Text
              style={[
                styles.ctaLabel,
                { color: pedido.status === 'no_hub' ? darkColors.bg.primary : darkColors.text.primary },
              ]}
            >
              {acaoLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    padding: spacing[4],
    gap: spacing[3],
  },
  cardDestaque: {
    borderWidth: 1,
    borderColor: 'rgba(117,220,141,0.3)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.md.fontSize,
  },
  headerText: {
    flex: 1,
  },
  nome: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  subtitulo: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radii.badge,
  },
  badgeLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.xs.fontSize,
    letterSpacing: typography.letterSpacing.badge,
  },
  itens: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
  },
  prazoAceite: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.xs.fontSize,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  total: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
  },
  acoesNovo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
  },
  recusarLink: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.base.fontSize,
  },
  ctaButton: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
  },
  ctaLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.base.fontSize,
  },
});
