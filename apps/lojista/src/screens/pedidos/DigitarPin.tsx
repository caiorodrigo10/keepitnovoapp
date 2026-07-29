import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { PedidoResumoCard } from '../../components/PedidoResumoCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { PedidosStackParamList } from '../../navigation/types';
import { useOrdersContext } from './OrdersContext';

type Props = NativeStackScreenProps<PedidosStackParamList, 'DigitarPin'>;

const PIN_LENGTH = 4;
const TECLADO: Array<string | null> = ['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', 'backspace'];

/**
 * "Digitar PIN" — Story 0.10 (Task 7). Fiel a
 * `docs/design-refs/lojista-03-confirmar-retirada-pin.png` (painel P3):
 * header "‹ Confirmar retirada", card-resumo, 4 caixas de dígito, teclado
 * numérico grid 3 colunas.
 *
 * [AUTO-DECISION] O frame do protótipo mostra um botão explícito
 * "Confirmar entrega" abaixo do teclado (em vez de disparar a confirmação
 * automaticamente ao preencher o 4º dígito) — decisão de fidelidade visual
 * (Task 7 Dev Notes permite essa escolha, desde que documentada): o botão
 * fica desabilitado até os 4 dígitos serem preenchidos.
 *
 * Disponível apenas quando `status === 'no_hub'` (habilitado por
 * `markArrivedAtHub`, Task 6) — `order.port.confirmPin` local rejeita
 * qualquer outro status com `OrderTransitionError`.
 */
export default function DigitarPin({ navigation, route }: Props) {
  const { pedidoId } = route.params;
  const { getById, hubNome, confirmPin } = useOrdersContext();
  const pedido = getById(pedidoId);
  const [digitos, setDigitos] = useState('');
  const [erro, setErro] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  if (!pedido) return null;

  function onDigitPress(tecla: string | null) {
    if (!tecla || confirmando) return;
    setErro(false);
    if (tecla === 'backspace') {
      setDigitos((previous) => previous.slice(0, -1));
      return;
    }
    setDigitos((previous) => (previous.length < PIN_LENGTH ? previous + tecla : previous));
  }

  async function onConfirmarEntrega() {
    setConfirmando(true);
    try {
      const resultado = await confirmPin(pedidoId, digitos);
      if (resultado.correto) {
        navigation.replace('ConfirmarRetirada', { pedidoId });
      } else {
        setErro(true);
        setDigitos('');
      }
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <ScreenHeader title="Confirmar retirada" onBack={() => navigation.goBack()} />

        <PedidoResumoCard pedido={pedido} subtitle={`${pedido.itens.length} itens · ${hubNome}`} />

        <Text style={[styles.instrucao, { color: darkColors.text.tertiary }]}>Peça o código de 4 dígitos ao cliente</Text>

        <View style={styles.digitosRow}>
          {Array.from({ length: PIN_LENGTH }).map((_, index) => {
            const preenchido = index < digitos.length;
            const ativo = index === digitos.length;
            return (
              <View
                key={index}
                style={[
                  styles.digitoBox,
                  {
                    backgroundColor: darkColors.bg.surface,
                    borderColor:
                      preenchido || ativo ? darkColors.accent.brand : 'rgba(255,255,255,0.12)',
                  },
                ]}
              >
                {preenchido ? (
                  <Text style={[styles.digitoTexto, { color: darkColors.text.primary }]}>{digitos[index]}</Text>
                ) : ativo ? (
                  <View style={[styles.cursor, { backgroundColor: darkColors.accent.brand }]} />
                ) : null}
              </View>
            );
          })}
        </View>

        {erro ? (
          <Text style={[styles.erroTexto, { color: darkColors.accent.warning }]}>
            PIN incorreto. Peça o código novamente ao cliente.
          </Text>
        ) : null}

        <View style={styles.teclado}>
          {TECLADO.map((tecla, index) => (
            <Pressable
              key={index}
              onPress={() => onDigitPress(tecla)}
              disabled={!tecla}
              style={[
                styles.tecla,
                { backgroundColor: tecla ? darkColors.bg.surface : 'transparent' },
              ]}
            >
              {tecla === 'backspace' ? (
                <Ionicons name="backspace-outline" size={22} color={darkColors.text.primary} />
              ) : (
                <Text style={[styles.teclaTexto, { color: darkColors.text.primary }]}>{tecla ?? ''}</Text>
              )}
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => navigation.navigate('ClienteNaoApareceu', { pedidoId })} hitSlop={8}>
          <Text style={[styles.naoApareceuLink, { color: darkColors.text.tertiary }]}>Cliente não apareceu</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          label={confirmando ? 'Confirmando...' : 'Confirmar entrega'}
          onPress={onConfirmarEntrega}
          disabled={digitos.length < PIN_LENGTH || confirmando}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    gap: spacing[5],
  },
  instrucao: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
    textAlign: 'center',
  },
  digitosRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing[3],
  },
  digitoBox: {
    width: 62,
    height: 72,
    borderRadius: radii.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitoTexto: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
  },
  cursor: {
    width: 2,
    height: 28,
  },
  erroTexto: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
    textAlign: 'center',
  },
  teclado: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  tecla: {
    width: '30%',
    height: 54,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teclaTexto: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.xl.fontSize,
  },
  naoApareceuLink: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.base.fontSize,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[6],
  },
});
