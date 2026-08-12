import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';
import { getDataClient } from '@keepit/core-data';

import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import {
  diaSemanaLabel,
  edicaoParaHorarios,
  horariosParaEdicao,
  validarHorariosEdicao,
  type HorarioEdicaoDia,
} from '../../lib/horariosEdicao';
import type { CatalogoStackParamList } from '../../navigation/types';
import { CURRENT_ESTABELECIMENTO_ID } from './currentStore';
import { useLojaDisponibilidade, type DuracaoPausa } from './LojaDisponibilidadeContext';

type Props = NativeStackScreenProps<CatalogoStackParamList, 'HorariosDisponibilidade'>;

const DURACOES: Array<{ key: DuracaoPausa; label: string }> = [
  { key: '30min', label: '30 min' },
  { key: '1hora', label: '1 hora' },
  { key: 'hoje', label: 'Hoje' },
];

/**
 * Horários & disponibilidade — Story 0.9 (Task 5/6), edição real de
 * horários — Story 4.7 (AC1, AC3). Fiel a
 * `docs/design-refs/lojista-09-horarios.png` (painel P9) na estrutura geral
 * (cards "Loja aberta" e "Pausar novos pedidos", seção "FUNCIONAMENTO"); a
 * seção FUNCIONAMENTO deixou de ser somente-leitura (`ToggleSwitch disabled`,
 * sem inputs de horário) e ganhou edição real por dia da semana.
 *
 * Botões de duração (30 min/1 hora/Hoje) continuam só visuais — sem timer
 * real (`pg_cron` de expiração está fora do Épico 0/piloto, ver Dev Notes da
 * Story 4.8). Esta seção (e a de "Loja aberta") NÃO são tocadas por esta
 * edição — já são reais desde a Story 1.10/4.8.
 *
 * [AUTO-DECISION] A edição é POR DIA individual (7 linhas Seg → Dom), sem
 * preservar o agrupamento "Seg – Sex" que a exibição somente-leitura usava
 * (`agruparHorarios`, removida) → (reason: a Story 4.7, Dev Notes, sinaliza
 * explicitamente esta escolha como decisão de UX em aberto — "se o lojista
 * editar só a Terça-feira, o agrupamento precisa desagrupar". Editar dia a
 * dia é a leitura mais direta do AC1 ("checkbox aberto + hh:mm abertura +
 * hh:mm fechamento por dia, Seg a Dom") e evita a complexidade de detectar
 * dinamicamente quando desagrupar/reagrupar 5 dias — sem perda de
 * funcionalidade, já que os 7 dias continuam sempre visíveis).
 */
export default function HorariosDisponibilidade({ navigation }: Props) {
  const { estabelecimento, loading, recebendoPedidos, setRecebendoPedidos, pausaSelecionada, selecionarPausa } =
    useLojaDisponibilidade();

  const [dias, setDias] = useState<HorarioEdicaoDia[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Hidrata o rascunho de edição só na primeira carga — mudanças
  // subsequentes de `estabelecimento` (ex.: toggle "Loja aberta", Story 4.8)
  // não devem sobrescrever uma edição de horário em andamento.
  useEffect(() => {
    if (estabelecimento && dias.length === 0) {
      setDias(horariosParaEdicao(estabelecimento.horarios));
    }
  }, [estabelecimento, dias.length]);

  function updateDia(dia_semana: number, patch: Partial<HorarioEdicaoDia>) {
    setDias((atual) => atual.map((dia) => (dia.dia_semana === dia_semana ? { ...dia, ...patch } : dia)));
    setErro(null);
  }

  async function handleSalvar() {
    const mensagemValidacao = validarHorariosEdicao(dias);
    if (mensagemValidacao) {
      setErro(mensagemValidacao);
      return;
    }

    setErro(null);
    setSalvando(true);
    try {
      const horariosPersistidos = await getDataClient().store.updateHorarios(
        CURRENT_ESTABELECIMENTO_ID,
        edicaoParaHorarios(dias),
      );
      setDias(horariosParaEdicao(horariosPersistidos));
      Alert.alert('Horários salvos', 'Seus horários de funcionamento foram atualizados.');
    } catch {
      setErro('Não foi possível salvar os horários agora. Tente novamente em instantes.');
    } finally {
      setSalvando(false);
    }
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
          {dias.map((dia) => (
            <View
              key={dia.dia_semana}
              style={[styles.diaCard, { backgroundColor: darkColors.bg.surface }]}
            >
              <View style={styles.diaHeader}>
                <Text style={[styles.diaLabel, { color: darkColors.text.primary }]}>
                  {diaSemanaLabel(dia.dia_semana)}
                </Text>
                <ToggleSwitch value={dia.aberto} onValueChange={(aberto) => updateDia(dia.dia_semana, { aberto })} />
              </View>
              {dia.aberto ? (
                <View style={styles.diaTimes}>
                  <TextInput
                    value={dia.hora_abre}
                    onChangeText={(hora_abre) => updateDia(dia.dia_semana, { hora_abre })}
                    placeholder="08:00"
                    placeholderTextColor={darkColors.text.placeholder}
                    style={[
                      styles.timeInput,
                      {
                        backgroundColor: darkColors.bg.overlay,
                        color: darkColors.text.primary,
                        borderColor: darkColors.border.default,
                      },
                    ]}
                  />
                  <Text style={[styles.timeSeparator, { color: darkColors.text.tertiary }]}>até</Text>
                  <TextInput
                    value={dia.hora_fecha}
                    onChangeText={(hora_fecha) => updateDia(dia.dia_semana, { hora_fecha })}
                    placeholder="18:00"
                    placeholderTextColor={darkColors.text.placeholder}
                    style={[
                      styles.timeInput,
                      {
                        backgroundColor: darkColors.bg.overlay,
                        color: darkColors.text.primary,
                        borderColor: darkColors.border.default,
                      },
                    ]}
                  />
                </View>
              ) : (
                <Text style={[styles.fechadoLabel, { color: darkColors.text.tertiary }]}>Fechado</Text>
              )}
            </View>
          ))}
        </View>

        {!!erro && <Text style={[styles.erro, { color: darkColors.accent.warning }]}>{erro}</Text>}

        <PrimaryButton label="Salvar horários" onPress={handleSalvar} loading={salvando} />
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
    gap: spacing[2],
  },
  sectionLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    letterSpacing: typography.letterSpacing.section,
    marginBottom: spacing[1],
  },
  diaCard: {
    borderRadius: radii.card,
    padding: spacing[3],
    gap: spacing[2],
  },
  diaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  diaLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  diaTimes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  timeInput: {
    flex: 1,
    height: 40,
    borderRadius: radii.xs,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
    textAlign: 'center',
  },
  timeSeparator: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
  },
  fechadoLabel: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.base.fontSize,
  },
  erro: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
  },
});
