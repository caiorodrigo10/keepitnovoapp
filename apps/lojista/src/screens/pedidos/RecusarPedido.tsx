import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { FormField } from '../../components/FormField';
import { PedidoResumoCard } from '../../components/PedidoResumoCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { PedidosStackParamList } from '../../navigation/types';
import { useOrdersContext } from './OrdersContext';

type Props = NativeStackScreenProps<PedidosStackParamList, 'RecusarPedido'>;

/** 3 opções fixas do AC1 (Épico 6, Story 6.11) — "Outro" exige o texto livre. */
type MotivoOpcao = 'sem_estoque' | 'fora_do_horario' | 'outro';

const MOTIVO_OPCOES: { value: MotivoOpcao; label: string }[] = [
  { value: 'sem_estoque', label: 'Sem estoque' },
  { value: 'fora_do_horario', label: 'Fora do horário' },
  { value: 'outro', label: 'Outro' },
];

const MOTIVO_LABEL: Record<Exclude<MotivoOpcao, 'outro'>, string> = {
  sem_estoque: 'Sem estoque',
  fora_do_horario: 'Fora do horário',
};

/**
 * "Recusar pedido" — Story 0.10 (Task 4). Sem frame explícito no protótipo
 * — segue o padrão de formulário dark já usado no cadastro do lojista
 * (Story 0.8: `FormField` + `PrimaryButton`).
 *
 * **Story 6.11 (AC1) — [IDS] ADAPT:** o `FormField` de texto livre vira um
 * grupo de rádio obrigatório com as 3 opções fixas do épico. Quando "Outro"
 * é selecionado, o MESMO `FormField` (texto livre) reaparece e passa a ser
 * obrigatório. `motivo` enviado ao backend é sempre o texto final: o rótulo
 * fixo (`sem_estoque`/`fora_do_horario`) ou o texto digitado em "Outro".
 */
export default function RecusarPedido({ navigation, route }: Props) {
  const { pedidoId } = route.params;
  const { getById, refuseOrder } = useOrdersContext();
  const pedido = getById(pedidoId);
  const [opcao, setOpcao] = useState<MotivoOpcao | null>(null);
  const [motivoOutro, setMotivoOutro] = useState('');
  const [salvando, setSalvando] = useState(false);

  if (!pedido) return null;

  const motivoFinal = opcao === 'outro' ? motivoOutro.trim() : opcao ? MOTIVO_LABEL[opcao] : '';
  const podeConfirmar = motivoFinal.length > 0 && !salvando;

  async function onConfirmar() {
    if (!motivoFinal) return;
    setSalvando(true);
    try {
      await refuseOrder(pedidoId, motivoFinal);
      navigation.navigate('NovosPedidos');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.content}>
        <ScreenHeader title="Recusar pedido" onBack={() => navigation.goBack()} />

        <PedidoResumoCard pedido={pedido} subtitle={`${pedido.itens.length} itens · Hub Centro`} />

        <View style={styles.radioGroup}>
          <Text style={[styles.radioGroupLabel, { color: darkColors.text.secondary }]}>Motivo da recusa</Text>
          {MOTIVO_OPCOES.map((item) => {
            const selecionado = opcao === item.value;
            return (
              <Pressable
                key={item.value}
                onPress={() => setOpcao(item.value)}
                style={[
                  styles.radioOption,
                  {
                    borderColor: selecionado ? darkColors.accent.brand : darkColors.border.default,
                    backgroundColor: darkColors.bg.surface,
                  },
                ]}
              >
                <View
                  style={[
                    styles.radioCircle,
                    { borderColor: selecionado ? darkColors.accent.brand : darkColors.border.default },
                  ]}
                >
                  {selecionado && <View style={[styles.radioDot, { backgroundColor: darkColors.accent.brand }]} />}
                </View>
                <Text style={[styles.radioLabel, { color: darkColors.text.primary }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {opcao === 'outro' && (
          <FormField
            label="Descreva o motivo"
            value={motivoOutro}
            onChangeText={setMotivoOutro}
            placeholder="Ex.: item sem estoque no momento"
            multiline
          />
        )}
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          label={salvando ? 'Confirmando...' : 'Confirmar recusa'}
          onPress={onConfirmar}
          disabled={!podeConfirmar}
          variant="warning"
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
  footer: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[6],
  },
  radioGroup: {
    gap: spacing[2],
  },
  radioGroupLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
    lineHeight: typography.sizes.base.lineHeight,
    marginBottom: spacing[1],
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
  },
  radioLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
  },
});
