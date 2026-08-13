import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { SUPORTE_WHATSAPP_DISPONIVEL, SUPORTE_WHATSAPP_NUMERO } from '@keepit/config';
import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock } from '../../components/discovery';
import { OrderStatusDevAdvancer, PedidoTimeline } from '../../components/pedidos';
import { useCurrentCliente } from '../../hooks/useCurrentCliente';
import { useHubDetail } from '../../hooks/useHubDetail';
import { usePedidoDetail } from '../../hooks/usePedidoDetail';
import { Screen } from '../../components/ui';
import { comoChegarLabel, comoChegarUrl } from '../../lib/comoChegar';
import { formatReais } from '../../lib/format';
import { timelineStepIndex } from '../../lib/pedidoStatus';
import type { RootStackParamList } from '../../navigation/types';

/**
 * Story 6.7 (AC2) — seam WA-001 (`@keepit/config`), mesmo padrão já
 * validado em `apps/lojista/src/screens/perfil/ExcluirConta.tsx`/
 * `Configuracoes.tsx`. Sem mapa integrado no MVP — o destino, quando
 * disponível, é abrir uma conversa de WhatsApp perguntando a localização.
 */
function handleComoChegar(): void {
  const url = comoChegarUrl(SUPORTE_WHATSAPP_DISPONIVEL, SUPORTE_WHATSAPP_NUMERO);
  if (url) {
    void Linking.openURL(url);
  }
}

type Props = NativeStackScreenProps<RootStackParamList, 'ModalConfirmarPin'>;

/**
 * "Seu pedido" (Task 2, AC1/AC2/AC3/AC4) — fiel a
 * `cliente-06-seu-pedido-pin.png`: header "Seu pedido", timeline de 4
 * passos, cartão escuro "SEU CÓDIGO DE RETIRADA" com os 4 dígitos do PIN
 * separados e o copy "Mostre este código ao lojista no hub para confirmar
 * a retirada.", card do hub com link "Como chegar", e o rodapé
 * "Pedido #{numero} · {loja} · {total}".
 *
 * Rota `ModalConfirmarPin` (decisão da Story 0.3): é o destino real do item
 * de inventário "Confirmar retirada / PIN" da Story 0.7 — o cliente só
 * EXIBE o PIN aqui, nunca digita (quem digita é o lojista, Story 0.10).
 *
 * **Story 6.7.** Em `DATA_SOURCE=supabase`, `usePedidoDetail`/
 * `usePedidosMine` passam a resolver `OrderPort.listMine` real (adapter
 * Supabase, Story 6.7) — nenhuma mudança nesta tela além do link "Como
 * chegar" (ver `handleComoChegar` acima), que antes era um `<Text>` sem
 * `onPress` (link morto).
 */
export default function ModalConfirmarPin({ route, navigation }: Props) {
  const { data: cliente } = useCurrentCliente();
  const { data: pedido, loading, error, refresh } = usePedidoDetail(cliente?.id ?? null, route.params?.pedidoId);
  const { data: hub } = useHubDetail(pedido?.hub_id ?? '', { forceEmpty: !pedido });

  const status = pedido?.status;

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.roundButton}>
          <Text style={styles.roundButtonIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Seu pedido</Text>
        <View style={styles.roundButton} />
      </View>

      {loading && <AsyncStateBlock kind="loading" />}
      {!loading && !!error && <AsyncStateBlock kind="error" />}
      {!loading && !error && !pedido && (
        <AsyncStateBlock kind="empty" emptyLabel="Nenhum pedido em andamento para mostrar." />
      )}

      {!loading && !error && pedido && status && (
        <>
          <PedidoTimeline currentStep={timelineStepIndex(status)} />

          <View style={styles.pinCard}>
            <Text style={styles.pinCardLabel}>SEU CÓDIGO DE RETIRADA</Text>
            <View style={styles.pinDigits}>
              {pedido.pin_texto.split('').map((digito, index) => (
                <View key={`${digito}-${index}`} style={styles.pinDigitBox}>
                  <Text style={styles.pinDigit}>{digito}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.pinCardCopy}>
              Mostre este código ao lojista no hub{'\n'}para confirmar a retirada.
            </Text>
          </View>

          {hub && (
            <View style={styles.hubCard}>
              <View style={styles.hubIcon}>
                <Text style={styles.hubIconGlyph}>⚲</Text>
              </View>
              <View style={styles.hubInfo}>
                <Text style={styles.hubNome}>{hub.nome}</Text>
                <Text style={styles.hubEndereco}>{hub.endereco}</Text>
              </View>
              <Pressable onPress={handleComoChegar} disabled={!SUPORTE_WHATSAPP_DISPONIVEL} hitSlop={8}>
                <Text style={[styles.comoChegar, !SUPORTE_WHATSAPP_DISPONIVEL && styles.comoChegarDesabilitado]}>
                  {comoChegarLabel(SUPORTE_WHATSAPP_DISPONIVEL)}
                </Text>
              </Pressable>
            </View>
          )}

          <OrderStatusDevAdvancer pedido={pedido} onChanged={refresh} />

          <Text style={styles.footer}>
            Pedido #{pedido.numero} · {formatReais(pedido.total_pago_reais)}
          </Text>
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
    marginBottom: spacing['5'],
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
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    color: lightColors.text.primary,
  },
  pinCard: {
    backgroundColor: lightColors.text.primary,
    borderRadius: radii.card,
    paddingVertical: spacing['6'],
    paddingHorizontal: spacing['4'],
    alignItems: 'center',
    marginBottom: spacing['4'],
  },
  pinCardLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.text.faint,
    letterSpacing: 1,
    marginBottom: spacing['4'],
  },
  pinDigits: {
    flexDirection: 'row',
    gap: spacing['2'],
    marginBottom: spacing['4'],
  },
  pinDigitBox: {
    width: 56,
    height: 64,
    borderRadius: radii.md,
    backgroundColor: lightColors.bg.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDigit: {
    fontFamily: 'HankenGrotesk-ExtraBold',
    fontSize: typography.sizes['2xl'].fontSize,
    color: lightColors.accent.brand,
  },
  pinCardCopy: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.faint,
    textAlign: 'center',
    lineHeight: typography.sizes.sm.lineHeight,
  },
  hubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.card,
    padding: spacing['3'],
    marginBottom: spacing['4'],
  },
  hubIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: lightColors.text.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing['3'],
  },
  hubIconGlyph: {
    color: lightColors.accent.brand,
    fontSize: typography.sizes.md.fontSize,
  },
  hubInfo: {
    flex: 1,
  },
  hubNome: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.primary,
  },
  hubEndereco: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.text.secondary,
    marginTop: 2,
  },
  comoChegar: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.successFg,
  },
  comoChegarDesabilitado: {
    color: lightColors.text.tertiary,
  },
  footer: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.xs.fontSize,
    color: lightColors.text.tertiary,
    textAlign: 'center',
    marginTop: spacing['6'],
  },
});
