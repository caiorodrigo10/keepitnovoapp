import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { CadastroHeader } from '../../components/CadastroHeader';
import { FormField } from '../../components/FormField';
import { NumericStepper } from '../../components/NumericStepper';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SelectField } from '../../components/SelectField';
import {
  RAIO_ATENDIMENTO_MAX_KM,
  RAIO_ATENDIMENTO_MIN_KM,
  TAXA_DESLOCAMENTO_MAX_REAIS,
  TAXA_DESLOCAMENTO_MIN_REAIS,
  TEMPO_MEDIO_MAX_MIN,
  TEMPO_MEDIO_MIN_MIN,
  isCadastroPasso2Valido,
  parseCoordenadaOpcional,
  validateCadastroPasso2,
  type CadastroPasso2Errors,
} from '../../lib/cadastroPasso2Validation';
import type { AuthStackParamList } from '../../navigation/types';
import { useCadastroDraft } from './CadastroDraftContext';
import { CATEGORIA_OPTIONS } from './cadastroDraft';

type Props = NativeStackScreenProps<AuthStackParamList, 'CadastroPasso2'>;

/**
 * Cadastro passo 2 — dados operacionais — Story 0.8 (Task 5), reescrita pela
 * Story 3.4 (Épico 3, AC1/AC2/AC3/AC4/AC5).
 *
 * Sem tela literal no protótipo (ver Dev Notes da Story 0.8) — segue o mesmo
 * padrão estrutural do passo 1 (`CadastroHeader`, título, subtítulo).
 *
 * **AC1/AC5.** Campos: categoria (dropdown, movido do Passo 1 nesta Story —
 * ver JSDoc de `CadastroPasso1.tsx`), endereço completo (input livre, sem
 * autocompletar), latitude/longitude (opcionais, input manual — **sem
 * geocoding/mapa**, "Geo adiado" — ver Dev Notes da Story), raio de
 * atendimento (1-15 km), tempo médio de entrega (5-120 min), taxa de
 * deslocamento (0-30 R$), ticket mínimo próprio (opcional, em branco = usa o
 * global). `responsavel_nome`/`telefone` foram **removidos** desta tela
 * (AC5) — já são reais desde o Passo 1 (Story 3.2); mantê-los aqui era um
 * formulário duplicado herdado da Story 0.8.
 *
 * **AC2 — validação.** `../../lib/cadastroPasso2Validation.ts` (função pura,
 * testada isoladamente) valida os ranges e a coerência "ambas ou nenhuma" de
 * `lat`/`lng` (ajuste @po, 2026-08-12). Erros inline; "Continuar" bloqueado
 * enquanto inválido.
 *
 * **AC3/AC4 — recorte de persistência.** "Continuar" só chama `updateDraft`
 * (estado do `CadastroDraftContext`, em memória) e navega para
 * `CadastroPasso3` — nenhuma chamada a `getDataClient()`/`DataClient` nesta
 * tela. A linha `estabelecimentos` só é criada pela Story 3.5.
 */
export default function CadastroPasso2({ navigation }: Props) {
  const { draft, updateDraft } = useCadastroDraft();

  // Latitude/longitude são campos de texto locais (não sincronizados a cada
  // tecla com o draft): permitem estados intermediários inválidos/parciais
  // durante a digitação (ex.: "-", "-23.", vírgula decimal) sem forçar o
  // shape `number | null` do draft a carregar um `NaN` transitório. São
  // convertidos para `number | null` só na validação/submit.
  const [latText, setLatText] = useState(draft.lat !== null ? String(draft.lat) : '');
  const [lngText, setLngText] = useState(draft.lng !== null ? String(draft.lng) : '');
  // Ticket mínimo tem o mesmo problema (opcional, `number | null`) — mesmo padrão.
  const [ticketMinimoText, setTicketMinimoText] = useState(
    draft.ticket_minimo_reais !== null ? String(draft.ticket_minimo_reais) : '',
  );

  const [errors, setErrors] = useState<CadastroPasso2Errors>({});

  function handleContinuar() {
    const lat = parseCoordenadaOpcional(latText);
    const lng = parseCoordenadaOpcional(lngText);
    const ticket_minimo_reais = parseCoordenadaOpcional(ticketMinimoText);

    const nextErrors = validateCadastroPasso2({
      raio_atendimento_km: draft.raio_atendimento_km,
      tempo_medio_entrega_min: draft.tempo_medio_entrega_min,
      taxa_deslocamento_reais: draft.taxa_deslocamento_reais,
      ticket_minimo_reais,
      lat,
      lng,
    });
    setErrors(nextErrors);
    if (!isCadastroPasso2Valido(nextErrors)) return;

    updateDraft({ lat, lng, ticket_minimo_reais });
    navigation.navigate('CadastroPasso3');
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <CadastroHeader step={2} />

        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: darkColors.text.primary }]}>Dados operacionais</Text>
          <Text style={[styles.subtitle, { color: darkColors.text.secondary }]}>
            Isso ajuda a Keepit a rotear os pedidos certos até você.
          </Text>
        </View>

        <SelectField
          label="Categoria"
          value={draft.categoria}
          options={[...CATEGORIA_OPTIONS]}
          onChange={(categoria) => updateDraft({ categoria })}
        />

        <FormField
          label="Endereço"
          value={draft.endereco}
          onChangeText={(endereco) => updateDraft({ endereco })}
          placeholder="Rua, número — bairro"
        />

        <FormField
          label="Latitude (opcional)"
          value={latText}
          onChangeText={setLatText}
          placeholder="-23.5505"
          keyboardType="numbers-and-punctuation"
          error={errors.lat}
        />

        <FormField
          label="Longitude (opcional)"
          value={lngText}
          onChangeText={setLngText}
          placeholder="-46.6333"
          keyboardType="numbers-and-punctuation"
          error={errors.lng}
        />
        {!!errors.geo && <Text style={[styles.fieldError, { color: darkColors.accent.warning }]}>{errors.geo}</Text>}

        <NumericStepper
          label="Raio de atendimento"
          value={draft.raio_atendimento_km}
          onChange={(raio_atendimento_km) => updateDraft({ raio_atendimento_km })}
          min={RAIO_ATENDIMENTO_MIN_KM}
          max={RAIO_ATENDIMENTO_MAX_KM}
          step={1}
          unit="km"
        />
        {!!errors.raio_atendimento_km && (
          <Text style={[styles.fieldError, { color: darkColors.accent.warning }]}>{errors.raio_atendimento_km}</Text>
        )}

        <NumericStepper
          label="Tempo médio de entrega"
          value={draft.tempo_medio_entrega_min}
          onChange={(tempo_medio_entrega_min) => updateDraft({ tempo_medio_entrega_min })}
          min={TEMPO_MEDIO_MIN_MIN}
          max={TEMPO_MEDIO_MAX_MIN}
          step={5}
          unit="min"
        />
        {!!errors.tempo_medio_entrega_min && (
          <Text style={[styles.fieldError, { color: darkColors.accent.warning }]}>{errors.tempo_medio_entrega_min}</Text>
        )}

        <NumericStepper
          label="Taxa de deslocamento"
          value={draft.taxa_deslocamento_reais}
          onChange={(taxa_deslocamento_reais) => updateDraft({ taxa_deslocamento_reais })}
          min={TAXA_DESLOCAMENTO_MIN_REAIS}
          max={TAXA_DESLOCAMENTO_MAX_REAIS}
          step={0.5}
          unit="R$"
        />
        {!!errors.taxa_deslocamento_reais && (
          <Text style={[styles.fieldError, { color: darkColors.accent.warning }]}>{errors.taxa_deslocamento_reais}</Text>
        )}

        <FormField
          label="Ticket mínimo próprio (opcional)"
          value={ticketMinimoText}
          onChangeText={setTicketMinimoText}
          placeholder="Em branco = usa o mínimo padrão da Keepit"
          keyboardType="decimal-pad"
          error={errors.ticket_minimo_reais}
        />

        <View style={styles.spacer} />
        <PrimaryButton label="Continuar" onPress={handleContinuar} />
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
  fieldError: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
  },
  spacer: {
    height: spacing[4],
  },
});
