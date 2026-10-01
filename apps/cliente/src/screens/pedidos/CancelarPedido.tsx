import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { createSupportOperationId, getDataClient, type SupportCase } from '@keepit/core-data';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock } from '../../components/discovery';
import { AppHeader, Button, Screen } from '../../components/ui';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { usePedidoDetail } from '../../hooks/usePedidoDetail';
import { cancelamentoFaseFromStatus } from '../../lib/cancelamentoPolicy';
import type { PedidosStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PedidosStackParamList, 'CancelarPedido'>;

/**
 * "Cancelar pedido" (Task 6, AC1/AC2/AC3/AC4) — CTA "Cancelar" já confirmado
 * no protótipo (verde/destaque, `#1F9D57` → `accent.successFg`). Sem tela de
 * confirmação dedicada visível no bundle — segue os padrões das demais
 * telas de exceção. Antes do aceite, o cancelamento é imediato; depois,
 * o cliente abre uma solicitação e o pedido pode continuar em preparo.
 */
export default function CancelarPedido({ route, navigation }: Props) {
  const { data: cliente } = useCurrentCliente();
  const { data: pedido, loading, error, refresh } = usePedidoDetail(cliente?.id ?? null, route.params?.pedidoId);
  const [cancelando, setCancelando] = useState(false);
  const [caso, setCaso] = useState<SupportCase | null>(null);
  const [motivo, setMotivo] = useState('');
  const operacaoId = useRef(createSupportOperationId());
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const fase =
    pedido &&
    (pedido.status === 'aguardando_pagamento' ||
      pedido.status === 'aguardando_aceite' ||
      pedido.status === 'aceito' ||
      pedido.status === 'em_preparo' ||
      pedido.status === 'saindo_hub' ||
      pedido.status === 'no_hub')
      ? cancelamentoFaseFromStatus(pedido.status)
      : null;

  useEffect(() => {
    if (!pedido) return;
    let ativo = true;
    void getDataClient().support.listar().then((lista) => {
      if (ativo) setCaso(lista.find((item) => item.pedidoId === pedido.id && item.tipo === 'cancelamento' && item.estado === 'aberta') ?? null);
    }).catch(() => undefined);
    return () => { ativo = false; };
  }, [pedido?.id]);

  const handleCancelar = async () => {
    if (!pedido || !motivo.trim()) return;
    setCancelando(true);
    setErroAcao(null);
    try {
      const aberto = await getDataClient().support.abrir({ pedidoId: pedido.id, tipo: 'cancelamento', motivo: motivo.trim(), operacaoId: operacaoId.current });
      refresh();
      setCaso(aberto);
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Não foi possível cancelar. Tente novamente.');
    } finally {
      setCancelando(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        title="Cancelar pedido"
        back={{ navigation, fallback: () => navigation.navigate('MeusPedidos') }}
      />

      {loading && <AsyncStateBlock kind="loading" />}
      {!loading && !!error && <AsyncStateBlock kind="error" />}
      {!loading && !error && !pedido && (
        <AsyncStateBlock kind="empty" emptyLabel="Nenhum pedido em andamento para cancelar." />
      )}

      {!loading && !error && pedido && (
        <>
          {caso ? (
            <View style={styles.card}>
              <Text style={styles.cardTitulo}>{caso.estado === 'aprovada' ? 'Pedido cancelado' : 'Solicitação em análise'}</Text>
              <Text style={styles.cardCopy}>{caso.estado === 'aprovada' ? 'O pedido foi cancelado. Se houve pagamento, a devolução integral será acompanhada pelo atendimento.' : 'A loja pode continuar preparando o pedido. O Admin avaliará seu motivo e você verá a decisão em Meus pedidos.'}</Text>
              <Button title="Voltar para Meus pedidos" onPress={() => navigation.navigate('MeusPedidos')} />
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitulo}>{fase === 'antes_aceite' ? 'Cancelar pedido' : 'Solicitar cancelamento'}</Text>
              <Text style={styles.cardCopy}>{copyForFase(fase)}</Text>
              <TextInput style={styles.motivo} value={motivo} onChangeText={setMotivo} placeholder="Conte o motivo" multiline accessibilityLabel="Motivo do cancelamento" />
              {!!erroAcao && <Text style={styles.erro}>{erroAcao}</Text>}
              <Button title={fase === 'antes_aceite' ? 'Cancelar pedido' : 'Enviar solicitação'} onPress={handleCancelar} loading={cancelando} disabled={!motivo.trim() || !fase} />
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function copyForFase(fase: ReturnType<typeof cancelamentoFaseFromStatus> | null): string {
  if (fase === 'antes_aceite') {
    return 'A loja ainda não aceitou. O cancelamento será imediato; se houve pagamento, o valor integral entra na fila de devolução.';
  }
  if (fase === 'em_analise') {
    return 'A loja já aceitou. Informe o motivo para análise do Admin; o preparo e a retirada continuam disponíveis até a decisão.';
  }
  return 'Este pedido não aceita nova solicitação de cancelamento.';
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
  cardTituloAlerta: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.accent.warning,
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
