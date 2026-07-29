import { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';
import type { EstabelecimentoHorario } from '@keepit/core-data';

import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import type { CatalogoStackParamList } from '../../navigation/types';
import { useLojaDisponibilidade, type DuracaoPausa } from './LojaDisponibilidadeContext';

type Props = NativeStackScreenProps<CatalogoStackParamList, 'HorariosDisponibilidade'>;

const DURACOES: Array<{ key: DuracaoPausa; label: string }> = [
  { key: '30min', label: '30 min' },
  { key: '1hora', label: '1 hora' },
  { key: 'hoje', label: 'Hoje' },
];

const DIA_LABEL: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};

interface LinhaFuncionamento {
  label: string;
  aberto: boolean;
  horaAbre: string | null;
  horaFecha: string | null;
}

/**
 * Agrupa `estabelecimentos_horarios` (7 linhas, uma por dia) em linhas de
 * exibição — junta Seg-Sex numa única linha quando o horário é idêntico nos
 * 5 dias (caso das fixtures atuais), com fallback dia-a-dia se divergirem.
 * [Source: docs/architecture/03-data-models.md#1.5]
 */
function agruparHorarios(horarios: EstabelecimentoHorario[]): LinhaFuncionamento[] {
  const porDia = new Map(horarios.map((horario) => [horario.dia_semana, horario]));
  const dias1a5 = [1, 2, 3, 4, 5]
    .map((dia) => porDia.get(dia))
    .filter((horario): horario is EstabelecimentoHorario => Boolean(horario));

  const linhas: LinhaFuncionamento[] = [];

  const primeiraDia = dias1a5[0];
  const iguais =
    dias1a5.length === 5 &&
    Boolean(primeiraDia) &&
    dias1a5.every(
      (horario) =>
        horario.aberto === primeiraDia.aberto &&
        horario.hora_abre === primeiraDia.hora_abre &&
        horario.hora_fecha === primeiraDia.hora_fecha,
    );

  if (iguais && primeiraDia) {
    linhas.push({
      label: 'Seg – Sex',
      aberto: primeiraDia.aberto,
      horaAbre: primeiraDia.hora_abre,
      horaFecha: primeiraDia.hora_fecha,
    });
  } else {
    dias1a5.forEach((horario) =>
      linhas.push({
        label: DIA_LABEL[horario.dia_semana],
        aberto: horario.aberto,
        horaAbre: horario.hora_abre,
        horaFecha: horario.hora_fecha,
      }),
    );
  }

  const sabado = porDia.get(6);
  if (sabado) {
    linhas.push({ label: 'Sábado', aberto: sabado.aberto, horaAbre: sabado.hora_abre, horaFecha: sabado.hora_fecha });
  }

  const domingo = porDia.get(0);
  if (domingo) {
    linhas.push({
      label: 'Domingo',
      aberto: domingo.aberto,
      horaAbre: domingo.hora_abre,
      horaFecha: domingo.hora_fecha,
    });
  }

  return linhas;
}

/**
 * Horários & disponibilidade — Story 0.9 (Task 5/6). Fiel a
 * `docs/design-refs/lojista-09-horarios.png` (painel P9).
 *
 * Botões de duração (30 min/1 hora/Hoje) só selecionam visualmente — sem
 * timer real (`pg_cron` de expiração está fora do Épico 0, ver Dev Notes).
 * "Salvar horários" confirma a persistência mock via `Alert`, mesmo padrão
 * de "sem persistência real" já usado em telas da Story 0.8.
 */
export default function HorariosDisponibilidade({ navigation }: Props) {
  const { estabelecimento, loading, recebendoPedidos, setRecebendoPedidos, pausaSelecionada, selecionarPausa } =
    useLojaDisponibilidade();

  const funcionamento = useMemo(() => agruparHorarios(estabelecimento?.horarios ?? []), [estabelecimento]);

  function handleSalvar() {
    Alert.alert('Horários salvos', 'Suas preferências foram salvas nesta sessão.');
  }

  if (loading || !estabelecimento) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
        <View style={styles.centered}>
          <ActivityIndicator color={darkColors.accent.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="Horários" onBack={() => navigation.goBack()} />

        <View style={[styles.card, { backgroundColor: darkColors.bg.surface }]}>
          <View style={styles.cardRow}>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: darkColors.text.primary }]}>Loja aberta</Text>
              <Text
                style={[
                  styles.cardSubtitle,
                  { color: recebendoPedidos ? darkColors.accent.brand : darkColors.text.tertiary },
                ]}
              >
                {recebendoPedidos ? 'Recebendo pedidos agora' : 'Pausado — não recebendo pedidos'}
              </Text>
            </View>
            <ToggleSwitch value={recebendoPedidos} onValueChange={setRecebendoPedidos} />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: darkColors.bg.surface }]}>
          <Text style={[styles.cardTitle, { color: darkColors.text.primary }]}>Pausar novos pedidos</Text>
          <View style={styles.pausaRow}>
            {DURACOES.map((item) => {
              const selecionado = !recebendoPedidos && pausaSelecionada === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => selecionarPausa(item.key)}
                  style={[
                    styles.pill,
                    { backgroundColor: selecionado ? darkColors.accent.brand : darkColors.bg.overlay },
                  ]}
                >
                  <Text
                    style={[
                      styles.pillLabel,
                      { color: selecionado ? darkColors.bg.primary : darkColors.text.secondary },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.funcionamentoSection}>
          <Text style={[styles.sectionLabel, { color: darkColors.text.tertiary }]}>FUNCIONAMENTO</Text>
          {funcionamento.map((linha) => (
            <View key={linha.label} style={styles.diaRow}>
              <Text style={[styles.diaLabel, { color: darkColors.text.primary }]}>{linha.label}</Text>
              <View style={styles.diaRight}>
                <Text
                  style={[
                    styles.diaHorario,
                    { color: linha.aberto ? darkColors.text.secondary : darkColors.text.tertiary },
                  ]}
                >
                  {linha.aberto && linha.horaAbre && linha.horaFecha
                    ? `${linha.horaAbre} – ${linha.horaFecha}`
                    : 'Fechado'}
                </Text>
                <ToggleSwitch value={linha.aberto} disabled />
              </View>
            </View>
          ))}
        </View>

        <PrimaryButton label="Salvar horários" onPress={handleSalvar} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[8],
    gap: spacing[5],
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: radii.card,
    padding: spacing[4],
    gap: spacing[3],
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  cardSubtitle: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
  },
  pausaRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderRadius: radii.sm,
  },
  pillLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.base.fontSize,
  },
  funcionamentoSection: {
    gap: spacing[1],
  },
  sectionLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    letterSpacing: typography.letterSpacing.section,
    marginBottom: spacing[2],
  },
  diaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
  },
  diaLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  diaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  diaHorario: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
  },
});
