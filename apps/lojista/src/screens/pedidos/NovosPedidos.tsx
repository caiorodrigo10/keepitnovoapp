import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { Pedido } from '@keepit/core-data';
import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { PedidoCard } from '../../components/PedidoCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { PedidosStackParamList } from '../../navigation/types';
import { useOrdersContext } from './OrdersContext';

type Props = NativeStackScreenProps<PedidosStackParamList, 'NovosPedidos'>;

type TabKey = 'ativos' | 'concluidos';

/**
 * "Pedidos" (Ativos/Concluídos) — Story 0.10 (Task 2). Fiel a
 * `docs/design-refs/lojista-02-pedidos.png` (painel P2): header, tabs pill,
 * cards com CTA contextual por status.
 *
 * [AUTO-DECISION] A tab "Concluídos" navega para a rota própria `Concluidos`
 * (já existente em `PedidosStackParamList` desde a Story 0.3) em vez de
 * trocar conteúdo localmente — reaproveita a rota de stack já reservada
 * para o histórico (Task 8) sem duplicar a lista em dois lugares.
 */
export default function NovosPedidos({ navigation }: Props) {
  const { ativos, loading, error, reload } = useOrdersContext();
  const [tab] = useState<TabKey>('ativos');

  function onCardPress(pedido: Pedido) {
    navigation.navigate('DetalheSepararPedido', { pedidoId: pedido.id });
  }

  function onAcaoStatus(pedido: Pedido) {
    if (pedido.status === 'aceito' || pedido.status === 'em_preparo') {
      navigation.navigate('DetalheSepararPedido', { pedidoId: pedido.id });
    } else if (pedido.status === 'saindo_hub') {
      navigation.navigate('ChegueiAoHub', { pedidoId: pedido.id });
    } else if (pedido.status === 'no_hub') {
      navigation.navigate('DigitarPin', { pedidoId: pedido.id });
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: darkColors.text.primary }]}>Pedidos</Text>

        <View style={styles.tabs}>
          <View style={[styles.tab, { backgroundColor: tab === 'ativos' ? darkColors.accent.brand : darkColors.bg.surface }]}>
            <Text style={[styles.tabLabel, { color: tab === 'ativos' ? darkColors.bg.primary : darkColors.text.tertiary }]}>
              Ativos
            </Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Concluidos')}
            style={[styles.tab, { backgroundColor: darkColors.bg.surface }]}
          >
            <Text style={[styles.tabLabel, { color: darkColors.text.tertiary }]}>Concluídos</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={darkColors.accent.brand} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>
            Não foi possível carregar seus pedidos agora.
          </Text>
          <PrimaryButton label="Tentar novamente" onPress={reload} />
        </View>
      ) : ativos.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>Nenhum pedido ativo no momento.</Text>
        </View>
      ) : (
        <FlatList
          data={ativos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing[3] }} />}
          renderItem={({ item }) => (
            <PedidoCard
              pedido={item}
              onPress={() => onCardPress(item)}
              onAceitar={() => navigation.navigate('AceitarPedido', { pedidoId: item.id })}
              onRecusar={() => navigation.navigate('RecusarPedido', { pedidoId: item.id })}
              onAcaoStatus={() => onAcaoStatus(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    gap: spacing[4],
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
  },
  tabs: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  tab: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
  },
  tabLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.base.fontSize,
  },
  listContent: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[8],
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
    paddingHorizontal: spacing[6],
  },
  emptyText: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
    textAlign: 'center',
  },
});
