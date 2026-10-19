import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { PedidosStackParamList } from '../../navigation/types';
import { useOrdersContext } from './OrdersContext';
import { separacaoPedidoPresentation } from './separacaoPedidoPresentation';
import { getStatusBadge, prateleiraFromId, tempoRelativo } from './statusMeta';

type Props = NativeStackScreenProps<PedidosStackParamList, 'DetalheSepararPedido'>;

/**
 * "Detalhe do pedido / separar" — Story 0.10 (Task 5). Fiel a
 * `docs/design-refs/lojista-08-pedido-detalhe-separar.png` (painel P8).
 *
 * O checklist deriva de `PedidoItem.separado`, persistido pela RPC; a tela pode
 * ser reaberta sem perder a separação. O CTA do rodapé muda conforme o status atual do pedido
 * [AUTO-DECISION]: permite reabrir esta tela em qualquer ponto do fluxo
 * ativo (`aceito`/`em_preparo` → separar, `saindo_hub` → ir para "Cheguei ao
 * hub", `no_hub` → ir direto para o PIN) sem duplicar telas de resumo.
 */
export default function DetalheSepararPedido({ navigation, route }: Props) {
  const { pedidoId } = route.params;
  const { getById, nomeHub, nomeCliente, markReadyForHub, setItemSeparado, solicitacoes } = useOrdersContext();
  const pedido = getById(pedidoId);
  const [salvando, setSalvando] = useState(false);
  const [salvandoItem, setSalvandoItem] = useState(false);
  const [erroSeparacao, setErroSeparacao] = useState<string | null>(null);

  const badge = pedido ? getStatusBadge(pedido.status) : null;
  const emAnalise = solicitacoes.some((item) => item.pedidoId === pedidoId && item.estado === 'aberta');

  const separacao = useMemo(() => (pedido ? separacaoPedidoPresentation(pedido) : null), [pedido]);

  if (!pedido || !badge) return null;

  async function toggleItem(itemId: string, separado: boolean) {
    setSalvandoItem(true);
    setErroSeparacao(null);
    try {
      await setItemSeparado(itemId, !separado);
    } catch {
      setErroSeparacao('Não foi possível atualizar a separação. Tente novamente.');
    } finally {
      setSalvandoItem(false);
    }
  }

  async function onMarcarPronto() {
    setSalvando(true);
    try {
      await markReadyForHub(pedidoId);
      navigation.navigate('SaindoParaHub', { pedidoId });
    } finally {
      setSalvando(false);
    }
  }

  const nomeCliente_ = pedido.cliente_nome ?? (pedido.cliente_id === null ? 'Cliente excluído' : nomeCliente(pedido.cliente_id));

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          title={`Pedido #${pedido.numero}`}
          onBack={() => navigation.goBack()}
          rightSlot={
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeLabel, { color: badge.fg }]}>{badge.label}</Text>
            </View>
          }
        />

        {emAnalise && <Text style={{ color: darkColors.accent.warning }}>Há uma solicitação em análise. O pedido continua ativo até a decisão.</Text>}

        <View style={[styles.clienteCard, { backgroundColor: darkColors.bg.surface }]}>
          <View style={[styles.avatar, { backgroundColor: darkColors.bg.overlay }]}>
            <Text style={[styles.avatarLetter, { color: darkColors.accent.brand }]}>
              {nomeCliente_.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={[styles.clienteNome, { color: darkColors.text.primary }]}>{nomeCliente_}</Text>
            <Text style={[styles.clienteSubtitulo, { color: darkColors.text.tertiary }]}>
              {nomeHub(pedido.hub_id)} · {tempoRelativo(pedido.criado_em)}
            </Text>
          </View>
        </View>

        <View style={styles.itensHeader}>
          <Text style={[styles.itensTitulo, { color: darkColors.text.primary }]}>Itens para separar</Text>
          <Text style={[styles.itensContador, { color: darkColors.accent.brand }]}>
            {separacao!.separados} / {separacao!.total}
          </Text>
        </View>

        <View>
          {pedido.itens.map((item, index) => {
            const checked = item.separado;
            return (
              <View key={item.id}>
                <Pressable
                  onPress={() => {
                    void toggleItem(item.id, item.separado);
                  }}
                  disabled={salvandoItem}
                  style={styles.itemRow}
                >
                  <View
                    style={[
                      styles.checkbox,
                      checked
                        ? { backgroundColor: darkColors.accent.brand }
                        : { borderWidth: 2, borderColor: darkColors.bg.muted },
                    ]}
                  >
                    {checked ? <Ionicons name="checkmark" size={18} color={darkColors.bg.primary} /> : null}
                  </View>
                  <View style={styles.itemTexts}>
                    <Text
                      style={[
                        styles.itemNome,
                        { color: checked ? darkColors.text.faint : darkColors.text.primary },
                        checked && styles.itemNomeRiscado,
                      ]}
                    >
                      {item.nome_snapshot}
                    </Text>
                    <Text style={[styles.itemDetalhe, { color: darkColors.text.tertiary }]}>
                      {item.quantidade} un · Prateleira {prateleiraFromId(item.id)}
                    </Text>
                    {separacao!.complementosPorItem[index]?.map((linha) => (
                      <Text key={linha} style={[styles.itemDetalhe, { color: darkColors.text.secondary }]}>{linha}</Text>
                    ))}
                  </View>
                </Pressable>
                {index < pedido.itens.length - 1 ? (
                  <View style={[styles.separator, { backgroundColor: darkColors.border.default }]} />
                ) : null}
              </View>
            );
          })}
        </View>

        {erroSeparacao ? <Text style={{ color: darkColors.accent.warning }}>{erroSeparacao}</Text> : null}

        <View style={[styles.notaRetirada, { backgroundColor: darkColors.bg.surface }]}>
          <Ionicons name="location-outline" size={18} color={darkColors.text.secondary} />
          <Text style={[styles.notaTexto, { color: darkColors.text.secondary }]}>
            Retirada no balcão do <Text style={{ fontFamily: 'HankenGrotesk-Bold' }}>{nomeHub(pedido.hub_id)}</Text>
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {pedido.status === 'aceito' || pedido.status === 'em_preparo' ? (
          <PrimaryButton
            label={salvando ? 'Enviando...' : 'Marcar como pronto no hub'}
            onPress={onMarcarPronto}
            disabled={!separacao!.todosSeparados || salvando || salvandoItem}
          />
        ) : pedido.status === 'saindo_hub' ? (
          <PrimaryButton label="Cheguei ao hub" onPress={() => navigation.navigate('ChegueiAoHub', { pedidoId })} />
        ) : pedido.status === 'no_hub' ? (
          <PrimaryButton label="Confirmar retirada" onPress={() => navigation.navigate('DigitarPin', { pedidoId })} />
        ) : null}
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
    paddingBottom: spacing[8],
    gap: spacing[5],
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
  clienteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: radii.card,
    padding: spacing[4],
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
  clienteNome: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  clienteSubtitulo: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
    marginTop: 2,
  },
  itensHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itensTitulo: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
  },
  itensContador: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.md.fontSize,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: radii.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTexts: {
    flex: 1,
  },
  itemNome: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  itemNomeRiscado: {
    textDecorationLine: 'line-through',
  },
  itemDetalhe: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
    marginTop: 2,
  },
  separator: {
    height: 1,
  },
  notaRetirada: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radii.card,
    padding: spacing[4],
  },
  notaTexto: {
    flex: 1,
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
  },
  footer: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[6],
  },
});
