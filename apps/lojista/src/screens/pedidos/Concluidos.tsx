import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { PedidoCard } from '../../components/PedidoCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { PedidosStackParamList } from '../../navigation/types';
import { useOrdersContext } from './OrdersContext';

type Props = NativeStackScreenProps<PedidosStackParamList, 'Concluidos'>;

/**
 * "Concluídos" (histórico) — Story 0.10 (Task 8). Lista pedidos com status
 * final (`entregue`, `recusado`, `nao_retirado`) em estilo mais discreto
 * (`opacity: .7`, ver `PedidoCard#discreet`).
 */
export default function Concluidos({ navigation }: Props) {
  const { concluidos, loading, error, reload } = useOrdersContext();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.header}>
        <ScreenHeader title="Concluídos" onBack={() => navigation.goBack()} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={darkColors.accent.brand} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>
            Não foi possível carregar o histórico agora.
          </Text>
          <PrimaryButton label="Tentar novamente" onPress={reload} />
        </View>
      ) : concluidos.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>Nenhum pedido concluído ainda.</Text>
        </View>
      ) : (
        <FlatList
          data={concluidos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing[3] }} />}
          renderItem={({ item }) => (
            <PedidoCard pedido={item} onPress={() => undefined} discreet />
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
