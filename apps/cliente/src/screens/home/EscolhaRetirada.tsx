import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { Hub } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { SelectableRow } from '../../components/checkout';
import { AsyncStateBlock, DevStateToggle, toAsyncCallOptions, type DevSimState } from '../../components/discovery';
import { Button, Screen } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useHubsList } from '../../hooks/useHubsList';
import { DEFAULT_HUB_ID, formatHubDistanciaKm } from '../../lib/discoveryDisplay';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'EscolhaRetirada'>;

function formatAbertoAte(hub: Hub): string | undefined {
  const hoje = new Date().getDay();
  const horario = hub.horarios.find((item) => item.dia_semana === hoje);
  if (!horario?.aberto || !horario.hora_fecha) {
    return undefined;
  }
  return `Aberto até ${horario.hora_fecha.slice(0, 5).replace(':00', 'h')}`;
}

/**
 * Escolha do ponto de retirada (Task 3, AC1/AC4). Fiel a
 * `cliente-05-escolha-ponto-retirada.png`, MENOS o mapa.
 *
 * **[DESVIO CONSCIENTE DO PROTÓTIPO] Sem mapa:** a referência mostra um
 * mapa com pins dos hubs, mas a decisão da Rodada 4 (`docs/ARQUITETURA.md`)
 * é "sem provider de mapa" — decisão que `docs/design-refs/INDEX.md`
 * registra como conflito não resolvido (inspeção anterior do protótipo
 * havia concluído erroneamente que não havia mapa). Esta story HONRA a
 * decisão de arquitetura já fechada (sem provider de mapa = sem custo/
 * dependência nova no MVP) em vez do protótipo, e mantém a lista de hubs
 * (nome/endereço/distância/aberto até) como único mecanismo de escolha —
 * ver `docs/design-refs/INDEX.md#Conflitos`. Pendente de revisão do
 * stakeholder se o mapa deve ser adicionado antes do lançamento.
 */
export default function EscolhaRetirada({ navigation }: Props) {
  const cart = useCart();
  const [devState, setDevState] = useState<DevSimState>('normal');
  const options = toAsyncCallOptions(devState);

  const { data: hubs, loading, error } = useHubsList(options);
  const [selecionado, setSelecionado] = useState<string>(cart.hubId ?? DEFAULT_HUB_ID);

  const handleConfirmar = () => {
    cart.setHubId(selecionado);
    navigation.goBack();
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.roundButton}>
          <Text style={styles.roundButtonIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Escolha o ponto de retirada</Text>
        <View style={styles.roundButton} />
      </View>

      <DevStateToggle value={devState} onChange={setDevState} />

      {error ? (
        <AsyncStateBlock kind="error" errorLabel="Não foi possível carregar os hubs. Tente novamente." />
      ) : loading ? (
        <AsyncStateBlock kind="loading" />
      ) : hubs.length === 0 ? (
        <AsyncStateBlock kind="empty" emptyLabel="Nenhum hub disponível perto de você." />
      ) : (
        <>
          <View style={styles.list}>
            {hubs.map((hub) => (
              <SelectableRow
                key={hub.id}
                selected={hub.id === selecionado}
                title={hub.nome}
                subtitle={`${hub.endereco} · ${formatHubDistanciaKm(hub.id)}`}
                highlight={formatAbertoAte(hub)}
                onPress={() => setSelecionado(hub.id)}
              />
            ))}
          </View>

          <Button title="Confirmar ponto" onPress={handleConfirmar} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing['4'],
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
    flex: 1,
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
    textAlign: 'center',
  },
  list: {
    marginTop: spacing['2'],
    marginBottom: spacing['5'],
  },
});
