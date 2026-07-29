import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { CadastroHeader } from '../../components/CadastroHeader';
import { FormField } from '../../components/FormField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SelectField } from '../../components/SelectField';
import type { AuthStackParamList } from '../../navigation/types';
import { useCadastroDraft } from './CadastroDraftContext';
import { CHAVE_PIX_TIPO_OPTIONS, diaSemanaLabel, type HorarioDraft } from './cadastroDraft';

type Props = NativeStackScreenProps<AuthStackParamList, 'CadastroPasso3'>;

/**
 * Cadastro passo 3 — recebimento + fachada + horários — Story 0.8 (Task 6).
 *
 * Sem tela literal no protótipo (ver Dev Notes) — mesmo padrão estrutural
 * dos passos 1/2. 7 linhas de horário espelham `estabelecimentos_horarios`
 * (`dia_semana`, `aberto`, `hora_abre`, `hora_fecha`)
 * [Source: docs/architecture/03-data-models.md#1.5]. Sem seletor de hora
 * nativo instalado no workspace — hora é texto livre `HH:mm`, sem validação
 * real de formato (mesma filosofia "sem validação real" do resto do Épico 0).
 */
export default function CadastroPasso3({ navigation }: Props) {
  const { draft, updateDraft } = useCadastroDraft();

  function updateHorario(dia_semana: number, patch: Partial<HorarioDraft>) {
    updateDraft({
      horarios: draft.horarios.map((horario) =>
        horario.dia_semana === dia_semana ? { ...horario, ...patch } : horario,
      ),
    });
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <CadastroHeader step={3} />

        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: darkColors.text.primary }]}>Recebimento e horários</Text>
          <Text style={[styles.subtitle, { color: darkColors.text.secondary }]}>
            Últimos dados antes de enviar seu cadastro para análise.
          </Text>
        </View>

        <FormField
          label="Chave Pix"
          value={draft.chave_pix}
          onChangeText={(chave_pix) => updateDraft({ chave_pix })}
          placeholder="Chave Pix da loja"
        />

        <SelectField
          label="Tipo da chave"
          value={draft.chave_pix_tipo}
          options={CHAVE_PIX_TIPO_OPTIONS}
          onChange={(chave_pix_tipo) => updateDraft({ chave_pix_tipo: chave_pix_tipo as typeof draft.chave_pix_tipo })}
        />

        <Pressable
          style={styles.fachadaUpload}
          /* Upload real de foto fora de escopo do Épico 0 — placeholder local. */
          onPress={() => updateDraft({ foto_fachada_url: draft.foto_fachada_url ? null : 'local-placeholder' })}
        >
          <View style={[styles.fachadaBox, { backgroundColor: darkColors.bg.surface, borderColor: darkColors.border.muted }]}>
            <Ionicons name="storefront-outline" size={28} color={darkColors.text.secondary} />
            <Text style={[styles.fachadaLabel, { color: darkColors.text.primary }]}>Foto da fachada</Text>
            <Text style={[styles.fachadaAction, { color: darkColors.accent.brand }]}>
              {draft.foto_fachada_url ? 'Imagem adicionada' : 'Adicionar imagem'}
            </Text>
          </View>
        </Pressable>

        <View style={styles.horariosBlock}>
          <Text style={[styles.horariosTitle, { color: darkColors.text.primary }]}>Horários de funcionamento</Text>
          {draft.horarios.map((horario) => (
            <View
              key={horario.dia_semana}
              style={[styles.horarioRow, { borderColor: darkColors.border.default }]}
            >
              <View style={styles.horarioHeader}>
                <Text style={[styles.horarioDia, { color: darkColors.text.primary }]}>
                  {diaSemanaLabel(horario.dia_semana)}
                </Text>
                <Switch
                  value={horario.aberto}
                  onValueChange={(aberto) => updateHorario(horario.dia_semana, { aberto })}
                  trackColor={{ false: darkColors.bg.muted, true: darkColors.accent.brand }}
                  thumbColor={darkColors.text.primary}
                />
              </View>
              {horario.aberto ? (
                <View style={styles.horarioTimes}>
                  <TextInput
                    value={horario.hora_abre}
                    onChangeText={(hora_abre) => updateHorario(horario.dia_semana, { hora_abre })}
                    placeholder="08:00"
                    placeholderTextColor={darkColors.text.placeholder}
                    style={[
                      styles.timeInput,
                      { backgroundColor: darkColors.bg.surface, color: darkColors.text.primary, borderColor: darkColors.border.default },
                    ]}
                  />
                  <Text style={[styles.timeSeparator, { color: darkColors.text.tertiary }]}>até</Text>
                  <TextInput
                    value={horario.hora_fecha}
                    onChangeText={(hora_fecha) => updateHorario(horario.dia_semana, { hora_fecha })}
                    placeholder="18:00"
                    placeholderTextColor={darkColors.text.placeholder}
                    style={[
                      styles.timeInput,
                      { backgroundColor: darkColors.bg.surface, color: darkColors.text.primary, borderColor: darkColors.border.default },
                    ]}
                  />
                </View>
              ) : (
                <Text style={[styles.fechadoLabel, { color: darkColors.text.tertiary }]}>Fechado</Text>
              )}
            </View>
          ))}
        </View>

        <View style={styles.spacer} />
        <PrimaryButton label="Enviar cadastro" onPress={() => navigation.navigate('EmAnalise')} />
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
  titleBlock: {
    gap: spacing[1],
  },
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
    lineHeight: typography.sizes['2xl'].lineHeight,
  },
  subtitle: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
  },
  fachadaUpload: {
    alignSelf: 'stretch',
  },
  fachadaBox: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[6],
    gap: spacing[1],
  },
  fachadaLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  fachadaAction: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
  },
  horariosBlock: {
    gap: spacing[3],
  },
  horariosTitle: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
  },
  horarioRow: {
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing[3],
    gap: spacing[2],
  },
  horarioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  horarioDia: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
  },
  horarioTimes: {
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
  spacer: {
    height: spacing[4],
  },
});
