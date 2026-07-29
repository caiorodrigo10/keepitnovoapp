import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { CadastroHeader } from '../../components/CadastroHeader';
import { FormField } from '../../components/FormField';
import { NumericStepper } from '../../components/NumericStepper';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { AuthStackParamList } from '../../navigation/types';
import { useCadastroDraft } from './CadastroDraftContext';

type Props = NativeStackScreenProps<AuthStackParamList, 'CadastroPasso2'>;

/**
 * Cadastro passo 2 — dados operacionais — Story 0.8 (Task 5).
 *
 * Sem tela literal no protótipo (ver Dev Notes) — segue o mesmo padrão
 * estrutural do passo 1 (`CadastroHeader`, título, subtítulo).
 *
 * `raio_atendimento_km` (0.1–30) e `tempo_medio_entrega_min` (5–240)
 * espelham os `CHECK` constraints de `estabelecimentos`
 * [Source: docs/architecture/03-data-models.md#1.4]. Responsável/telefone
 * também coletados aqui (regra de negócio já decidida — Dev Notes).
 * `lat`/`lng` não têm campo próprio nesta tela: sem geocoding real no
 * Épico 0, ficam com o placeholder fixo definido em `cadastroDraft.ts`.
 */
export default function CadastroPasso2({ navigation }: Props) {
  const { draft, updateDraft } = useCadastroDraft();

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

        <FormField
          label="Nome do responsável"
          value={draft.responsavel_nome}
          onChangeText={(responsavel_nome) => updateDraft({ responsavel_nome })}
          placeholder="Nome completo"
        />

        <FormField
          label="Telefone"
          value={draft.telefone}
          onChangeText={(telefone) => updateDraft({ telefone })}
          placeholder="(11) 90000-0000"
          keyboardType="phone-pad"
        />

        <FormField
          label="Endereço"
          value={draft.endereco}
          onChangeText={(endereco) => updateDraft({ endereco })}
          placeholder="Rua, número — bairro"
        />

        <NumericStepper
          label="Raio de atendimento"
          value={draft.raio_atendimento_km}
          onChange={(raio_atendimento_km) => updateDraft({ raio_atendimento_km })}
          min={0.1}
          max={30}
          step={0.5}
          unit="km"
        />

        <NumericStepper
          label="Tempo médio de entrega"
          value={draft.tempo_medio_entrega_min}
          onChange={(tempo_medio_entrega_min) => updateDraft({ tempo_medio_entrega_min })}
          min={5}
          max={240}
          step={5}
          unit="min"
        />

        <View style={styles.spacer} />
        <PrimaryButton label="Continuar" onPress={() => navigation.navigate('CadastroPasso3')} />
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
  spacer: {
    height: spacing[4],
  },
});
