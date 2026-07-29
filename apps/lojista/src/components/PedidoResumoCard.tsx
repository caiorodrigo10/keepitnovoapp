import { StyleSheet, Text, View } from 'react-native';

import type { Pedido } from '@keepit/core-data';
import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { useOrdersContext } from '../screens/pedidos/OrdersContext';
import { formatReais, inicialDoNome } from '../screens/pedidos/statusMeta';

/**
 * Card-resumo do pedido reutilizado pelas telas de transição/PIN — Story
 * 0.10 (Tasks 3/4/6/7/9). Fiel ao card-resumo do frame `P3 — Confirmar
 * retirada · PIN` (avatar, "{Nome} · #{numero}", subtítulo, valor à
 * direita); o subtítulo é customizável por tela (ex.: "{n} itens · {Hub}"
 * no PIN, "Hub {nome} · há {tempo}" no Detalhe/separar).
 */
export interface PedidoResumoCardProps {
  pedido: Pedido;
  subtitle: string;
  showValor?: boolean;
}

export function PedidoResumoCard({ pedido, subtitle, showValor = true }: PedidoResumoCardProps) {
  const { nomeCliente: resolveNomeCliente } = useOrdersContext();
  const nomeCliente = resolveNomeCliente(pedido.cliente_id);

  return (
    <View style={[styles.card, { backgroundColor: darkColors.bg.surface }]}>
      <View style={[styles.avatar, { backgroundColor: darkColors.bg.overlay }]}>
        <Text style={[styles.avatarLetter, { color: darkColors.accent.brand }]}>{inicialDoNome(nomeCliente)}</Text>
      </View>
      <View style={styles.texts}>
        <Text style={[styles.nome, { color: darkColors.text.primary }]}>
          {nomeCliente} · #{pedido.numero}
        </Text>
        <Text style={[styles.subtitle, { color: darkColors.text.tertiary }]}>{subtitle}</Text>
      </View>
      {showValor ? (
        <Text style={[styles.valor, { color: darkColors.text.primary }]}>{formatReais(pedido.total_pago_reais)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: radii.card,
    padding: spacing[4],
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
  },
  texts: {
    flex: 1,
  },
  nome: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
    marginTop: 2,
  },
  valor: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.md.fontSize,
  },
});
