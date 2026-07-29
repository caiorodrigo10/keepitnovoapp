import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';

import type { Pedido } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock, DevStateToggle, toAsyncCallOptions, type DevSimState } from '../../components/discovery';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { usePedidosMine } from '../../hooks/usePedidosMine';
import { isPedidoConcluido, isPedidoEmAndamento } from '../../lib/pedidoStatus';
import { Screen } from '../../components/ui';
import type { PedidosStackParamList, RootStackParamList } from '../../navigation/types';
import { MeusPedidosRow } from './MeusPedidosRow';

type Props = NativeStackScreenProps<PedidosStackParamList, 'MeusPedidos'>;

type Tab = 'andamento' | 'concluidos';

/**
 * "Meus pedidos" (Task 5, AC1/AC2/AC3/AC4) — fiel a `cliente-07-pedidos.png`:
 * título "Pedidos", pill-tabs "Em andamento"/"Concluídos", cards com badge
 * de status e (quando "Pronto no hub") o chip de PIN. Toca num card navega
 * para "Seu pedido" (`ModalConfirmarPin`, rota raiz) quando em andamento, ou
 * para `Recibo` quando concluído — AC1/Task 5.
 */
export default function MeusPedidos(_props: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<PedidosStackParamList>>();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data: cliente } = useCurrentCliente();
  const [tab, setTab] = useState<Tab>('andamento');
  const [devState, setDevState] = useState<DevSimState>('normal');

  const { data: pedidos, loading, error } = usePedidosMine(cliente?.id ?? null, toAsyncCallOptions(devState));

  const emAndamento = useMemo(() => pedidos.filter((p) => isPedidoEmAndamento(p.status)), [pedidos]);
  const concluidos = useMemo(() => pedidos.filter((p) => isPedidoConcluido(p.status)), [pedidos]);

  const listaAtual = tab === 'andamento' ? emAndamento : concluidos;

  const handlePress = (pedido: Pedido) => {
    if (isPedidoConcluido(pedido.status)) {
      navigation.navigate('Recibo', { pedidoId: pedido.id });
      return;
    }
    rootNavigation.navigate('ModalConfirmarPin', { pedidoId: pedido.id });
  };

  return (
    <Screen>
      <Text style={styles.title}>Pedidos</Text>

      <DevStateToggle value={devState} onChange={setDevState} />

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === 'andamento' && styles.tabActive]}
          onPress={() => setTab('andamento')}
        >
          <Text style={[styles.tabLabel, tab === 'andamento' && styles.tabLabelActive]}>Em andamento</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'concluidos' && styles.tabActive]}
          onPress={() => setTab('concluidos')}
        >
          <Text style={[styles.tabLabel, tab === 'concluidos' && styles.tabLabelActive]}>Concluídos</Text>
        </Pressable>
      </View>

      {loading && <AsyncStateBlock kind="loading" />}
      {!loading && !!error && <AsyncStateBlock kind="error" />}
      {!loading && !error && listaAtual.length === 0 && (
        <AsyncStateBlock
          kind="empty"
          emptyLabel={
            tab === 'andamento' ? 'Nenhum pedido em andamento no momento.' : 'Você ainda não concluiu nenhum pedido.'
          }
        />
      )}

      {!loading &&
        !error &&
        listaAtual.map((pedido) => (
          <MeusPedidosRow key={pedido.id} pedido={pedido} onPress={handlePress} />
        ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    color: lightColors.text.primary,
    marginBottom: spacing['4'],
  },
  tabs: {
    flexDirection: 'row',
    gap: spacing['2'],
    marginBottom: spacing['4'],
  },
  tab: {
    paddingHorizontal: spacing['4'],
    height: 40,
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: lightColors.text.primary,
  },
  tabLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
  },
  tabLabelActive: {
    color: lightColors.bg.primary,
  },
});
