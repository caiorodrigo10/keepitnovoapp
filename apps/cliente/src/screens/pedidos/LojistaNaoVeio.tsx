import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { createSupportOperationId, getDataClient } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock } from '../../components/discovery';
import { AppHeader, Button, Screen } from '../../components/ui';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { usePedidoDetail } from '../../hooks/usePedidoDetail';
import type { PedidosStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PedidosStackParamList, 'LojistaNaoVeio'>;

/**
 * "Lojista não veio" (Task 7, AC1/AC2/AC3/AC4) — Nota de fidelidade: o
 * bundle do protótipo não expõe texto literal para esta tela (busca
 * textual não encontrou "lojista não veio"/"não apareceu"). Segue os
 * padrões visuais já estabelecidos nas demais telas de exceção do Cliente
 * (mesma tipografia/cores de alerta de `@keepit/ui-tokens`, mesmo padrão de
 * card/CTA de `CancelarPedido`/`ChegueiAoHub`) — sinalizado para @ux-expert
 * validar quando houver acesso a mais telas do protótipo/Figma.
 * O relato abre atendimento e mantém o pedido ativo até decisão.
 */
export default function LojistaNaoVeio({ route, navigation }: Props) {
  const { data: cliente } = useCurrentCliente();
  const { data: pedido, loading, error, refresh } = usePedidoDetail(cliente?.id ?? null, route.params?.pedidoId);
  const [enviando, setEnviando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const operacaoId = useRef(createSupportOperationId());

  const handleReportar = async () => {
    if (!pedido || !motivo.trim()) return;
    setEnviando(true);
    setErroAcao(null);
    try {
      await getDataClient().support.abrir({ pedidoId: pedido.id, tipo: 'lojista_ausente', motivo: motivo.trim(), operacaoId: operacaoId.current });
      refresh();
      setConfirmado(true);
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Não foi possível registrar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        title="Lojista não veio"
        back={{ navigation, fallback: () => navigation.navigate('MeusPedidos') }}
      />

      {loading && <AsyncStateBlock kind="loading" />}
      {!loading && !!error && <AsyncStateBlock kind="error" />}
      {!loading && !error && !pedido && (
        <AsyncStateBlock kind="empty" emptyLabel="Nenhum pedido em andamento para reportar." />
      )}

      {!loading && !error && pedido && (
        <View style={styles.card}>
          {confirmado ? (
            <>
              <Text style={styles.cardTitulo}>Registramos sua solicitação</Text>
              <Text style={styles.cardCopy}>
                O atendimento vai analisar o ocorrido. Seu pedido continua disponível para retirada até a decisão.
              </Text>
              <Button title="Voltar para Meus pedidos" onPress={() => navigation.navigate('MeusPedidos')} />
            </>
          ) : (
            <>
              <Text style={styles.cardTitulo}>O lojista não apareceu no hub?</Text>
              <Text style={styles.cardCopy}>
                Se você já esperou o tempo combinado e o lojista não chegou, conte o que aconteceu. O atendimento vai analisar sua solicitação.
              </Text>
              <TextInput style={styles.motivo} value={motivo} onChangeText={setMotivo} placeholder="Descreva o ocorrido" multiline accessibilityLabel="Motivo da solicitação" />
              {!!erroAcao && <Text style={styles.erro}>{erroAcao}</Text>}
              <Button title="Enviar solicitação" onPress={handleReportar} loading={enviando} disabled={!motivo.trim()} />
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    padding: spacing['4'],
  },
  cardTitulo: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
    marginBottom: spacing['2'],
  },
  cardCopy: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
    lineHeight: typography.sizes.md.lineHeight,
    marginBottom: spacing['4'],
  },
  erro: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.warning,
    marginBottom: spacing['3'],
  },
  motivo: { borderWidth: 1, borderColor: lightColors.text.secondary, borderRadius: radii.card, padding: spacing['3'], minHeight: 80, marginBottom: spacing['3'], color: lightColors.text.primary },
});
