import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { Hub } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { SelectableRow } from '../../components/checkout';
import { AsyncStateBlock, DevStateToggle, toAsyncCallOptions, type DevSimState } from '../../components/discovery';
import { Button, Screen, TextField } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useHubsList } from '../../hooks/useHubsList';
import { DEFAULT_HUB_ID } from '../../lib/discoveryDisplay';
import { formatDistanceKm, haversineKm, type LatLng } from '../../lib/distance';
import { geocodeCep } from '../../lib/geocodeCep';
import { getCurrentCoords } from '../../lib/geolocation';
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

interface HubComDistancia {
  hub: Hub;
  distanciaKm: number | null;
}

/**
 * AC2/AC3/AC4 (Story 5.1.1): calcula a distância de cada hub à `origin`
 * (GPS ou CEP geocodado) e ordena por distância crescente quando há
 * origem. Sem origem, mantém a ordem recebida de `useHubsList` e omite a
 * distância (nunca trava — degradação graciosa).
 */
function ordenarPorDistancia(hubs: Hub[], origin: LatLng | null): HubComDistancia[] {
  if (!origin) {
    return hubs.map((hub) => ({ hub, distanciaKm: null }));
  }

  return hubs
    .map((hub) => ({ hub, distanciaKm: haversineKm(origin, { lat: hub.lat, lng: hub.lng }) }))
    .sort((a, b) => a.distanciaKm - b.distanciaKm);
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
 *
 * **Distância real por GPS/CEP (Story 5.1.1, AC2-AC4):** ao montar, tenta
 * `getCurrentCoords()` (Expo Location no nativo, `navigator.geolocation` no
 * web). Se obtiver a posição: calcula Haversine cliente↔hub
 * (`lib/distance.ts`) e ordena por distância crescente. Se a localização for
 * negada/indisponível: mostra um input de CEP; `geocodeCep` (BrasilAPI CEP
 * v2) resolve a origem a partir do CEP com o mesmo cálculo. Sem GPS e sem
 * CEP (ou CEP que não resolve): a lista continua funcional, sem distância —
 * nenhum caminho trava ou impede a seleção (degradação graciosa, AC3/AC4).
 * O cálculo aqui é client-side, para o demo/mock — produção migra para Edge
 * Function (FR59), fora do escopo desta Story.
 */
export default function EscolhaRetirada({ navigation }: Props) {
  const cart = useCart();
  const [devState, setDevState] = useState<DevSimState>('normal');
  const options = toAsyncCallOptions(devState);

  const { data: hubs, loading, error } = useHubsList(options);
  const [selecionado, setSelecionado] = useState<string>(cart.hubId ?? DEFAULT_HUB_ID);

  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [mostrarInputCep, setMostrarInputCep] = useState(false);
  const [cepInput, setCepInput] = useState('');
  const [cepMensagem, setCepMensagem] = useState<string | undefined>(undefined);
  const [geocodificandoCep, setGeocodificandoCep] = useState(false);

  // AC2/AC3: tenta GPS ao abrir; sem sucesso, cai no fallback de CEP — nunca trava.
  useEffect(() => {
    let cancelado = false;

    getCurrentCoords()
      .then((coords) => {
        if (cancelado) return;
        if (coords) {
          setOrigin(coords);
        } else {
          setMostrarInputCep(true);
        }
      })
      .catch(() => {
        if (!cancelado) setMostrarInputCep(true);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  const hubsComDistancia = useMemo(() => ordenarPorDistancia(hubs, origin), [hubs, origin]);

  const handleBuscarCep = async () => {
    setCepMensagem(undefined);
    setGeocodificandoCep(true);
    const coords = await geocodeCep(cepInput);
    setGeocodificandoCep(false);

    if (coords) {
      setOrigin(coords);
    } else {
      // AC3: degradação graciosa — CEP inválido/sem coordenadas/erro de rede, lista segue sem distância.
      setCepMensagem('Não encontramos esse CEP. A lista continua disponível, sem distância.');
    }
  };

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
          {mostrarInputCep && !origin && (
            <View style={styles.cepBlock}>
              <TextField
                label="Não conseguimos sua localização — informe seu CEP"
                value={cepInput}
                onChangeText={(value) => {
                  setCepInput(value);
                  setCepMensagem(undefined);
                }}
                placeholder="00000-000"
                keyboardType="numeric"
                error={cepMensagem}
              />
              <Button
                title={geocodificandoCep ? 'Buscando…' : 'Usar este CEP'}
                onPress={handleBuscarCep}
                loading={geocodificandoCep}
              />
            </View>
          )}

          <View style={styles.list}>
            {hubsComDistancia.map(({ hub, distanciaKm }) => (
              <SelectableRow
                key={hub.id}
                selected={hub.id === selecionado}
                title={hub.nome}
                subtitle={distanciaKm != null ? `${hub.endereco} · ${formatDistanceKm(distanciaKm)}` : hub.endereco}
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
  cepBlock: {
    marginTop: spacing['2'],
  },
});
