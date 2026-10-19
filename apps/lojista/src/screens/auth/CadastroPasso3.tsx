import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { getDataClient } from '@keepit/core-data';
import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { CadastroHeader } from '../../components/CadastroHeader';
import { FormField } from '../../components/FormField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SelectField } from '../../components/SelectField';
import {
  FACHADA_PLACEHOLDER_URI,
  buildHorariosPayload,
  mapCadastroErrorToMessage,
  resolveFachadaUploadInput,
} from '../../lib/cadastroPasso3Submit';
import type { AuthStackParamList } from '../../navigation/types';
import { useCadastroDraft } from './CadastroDraftContext';
import { CHAVE_PIX_TIPO_OPTIONS, diaSemanaLabel, type HorarioDraft } from './cadastroDraft';

type Props = NativeStackScreenProps<AuthStackParamList, 'CadastroPasso3'>;

interface FormErrors {
  chave_pix?: string;
  chave_pix_tipo?: string;
}

/**
 * Cadastro passo 3 — recebimento + fachada + horários — Story 0.8 (Task 6),
 * submit real — Story 3.5 (AC1-AC4).
 *
 * Sem tela literal no protótipo (ver Dev Notes) — mesmo padrão estrutural
 * dos passos 1/2. 7 linhas de horário espelham `estabelecimentos_horarios`
 * (`dia_semana`, `aberto`, `hora_abre`, `hora_fecha`)
 * [Source: docs/architecture/03-data-models.md#1.5]. Sem seletor de hora
 * nativo instalado no workspace — hora é texto livre `HH:mm`, sem validação
 * real de formato (mesma filosofia "sem validação real" do resto do Épico 0).
 *
 * **AC3/AC4 — submit real.** "Enviar cadastro" chama
 * `getDataClient().estabelecimentoCadastro.criarCadastro(...)` (port
 * dedicada — Story 3.5, `packages/core-data/src/ports/estabelecimento-cadastro.port.ts`)
 * juntando os dados coletados nos 3 passos do wizard (`CadastroDraftContext`).
 * Sucesso navega para `EmAnalise` (Story 3.6); falha exibe mensagem honesta
 * (`mapCadastroErrorToMessage`, `../../lib/cadastroPasso3Submit.ts`) sem
 * navegar e sem limpar o draft — o lojista pode corrigir e reenviar (o
 * reenvio é idempotente do lado da RPC, AC3).
 *
 * **AC2 — foto de fachada.** `resolveFachadaUploadInput` (mesmo módulo)
 * decide se `draft.foto_fachada_url` é um URI de arquivo real (upload
 * de verdade) ou o marcador placeholder herdado da Story 0.8 (sem
 * `expo-image-picker` neste workspace — ver JSDoc da função) — no segundo
 * caso, `foto_fachada_url` vai `null` para a RPC, honestamente (nunca um
 * upload fingido). O toggle "Adicionar imagem" abaixo continua idêntico à
 * Story 0.8 (AC1 não pede mudança de UI).
 */
export default function CadastroPasso3({ navigation }: Props) {
  const { draft, updateDraft } = useCadastroDraft();
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function updateHorario(dia_semana: number, patch: Partial<HorarioDraft>) {
    updateDraft({
      horarios: draft.horarios.map((horario) =>
        horario.dia_semana === dia_semana ? { ...horario, ...patch } : horario,
      ),
    });
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    if (!draft.chave_pix.trim()) nextErrors.chave_pix = 'Informe a chave Pix de recebimento.';
    if (!draft.chave_pix_tipo) nextErrors.chave_pix_tipo = 'Selecione o tipo da chave Pix.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleEnviarCadastro() {
    if (!validate()) return;

    setSubmitError(null);
    setLoading(true);
    try {
      const client = getDataClient();

      // AC2 — upload opcional. `resolveFachadaUploadInput` retorna `null`
      // tanto para "sem foto" quanto para o placeholder Story 0.8 (sem
      // arquivo real por trás) — nos dois casos, foto_fachada_url = null.
      const fachadaInput = resolveFachadaUploadInput(draft.foto_fachada_url);
      const fotoFachadaUrl = fachadaInput ? await client.estabelecimentoCadastro.uploadFachada(fachadaInput) : null;

      await client.estabelecimentoCadastro.criarCadastro({
        nome_fantasia: draft.nome_fantasia.trim(),
        cnpj: draft.cnpj,
        responsavel_nome: draft.responsavel_nome.trim(),
        telefone: draft.telefone,
        categoria: draft.categoria ?? '',
        endereco: draft.endereco,
        lat: draft.lat,
        lng: draft.lng,
        raio_atendimento_km: draft.raio_atendimento_km,
        tempo_medio_entrega_min: draft.tempo_medio_entrega_min,
        taxa_deslocamento_reais: draft.taxa_deslocamento_reais,
        ticket_minimo_reais: draft.ticket_minimo_reais,
        chave_pix: draft.chave_pix.trim(),
        // `validate()` acima garante `chave_pix_tipo !== null` antes daqui.
        chave_pix_tipo: draft.chave_pix_tipo!,
        foto_fachada_url: fotoFachadaUrl,
        descricao: null,
        horarios: buildHorariosPayload(draft.horarios),
      });

      // AC4 — sucesso navega para "Em análise" (Story 3.6); o draft
      // permanece intocado (a próxima tela não depende mais dele).
      navigation.navigate('EmAnalise');
    } catch (error) {
      setSubmitError(mapCadastroErrorToMessage(error));
    } finally {
      setLoading(false);
    }
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

        {!!submitError && <Text style={[styles.submitError, { color: darkColors.accent.warning }]}>{submitError}</Text>}

        <FormField
          label="Chave Pix"
          value={draft.chave_pix}
          onChangeText={(chave_pix) => updateDraft({ chave_pix })}
          placeholder="Chave Pix da loja"
          error={errors.chave_pix}
        />

        <SelectField
          label="Tipo da chave"
          value={draft.chave_pix_tipo}
          options={CHAVE_PIX_TIPO_OPTIONS}
          onChange={(chave_pix_tipo) => updateDraft({ chave_pix_tipo: chave_pix_tipo as typeof draft.chave_pix_tipo })}
        />
        {!!errors.chave_pix_tipo && (
          <Text style={[styles.fieldError, { color: darkColors.accent.warning }]}>{errors.chave_pix_tipo}</Text>
        )}

        <Pressable
          style={styles.fachadaUpload}
          /* Upload real de foto fora de escopo do Épico 0/expo-image-picker — placeholder local (Story 3.5 conecta o submit real; ver resolveFachadaUploadInput). */
          onPress={() =>
            updateDraft({ foto_fachada_url: draft.foto_fachada_url ? null : FACHADA_PLACEHOLDER_URI })
          }
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
        <PrimaryButton label="Enviar cadastro" onPress={handleEnviarCadastro} loading={loading} />
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
  submitError: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
  },
  fieldError: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
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
