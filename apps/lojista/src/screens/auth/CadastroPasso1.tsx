import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { CATEGORIA_OPTIONS, HUB_OPTIONS } from './cadastroDraft';

type Props = NativeStackScreenProps<AuthStackParamList, 'CadastroPasso1'>;

/** Máscara visual simples de CNPJ (`00.000.000/0001-00`) — sem validação real (AC3). */
function maskCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 14);
  let out = digits;
  if (digits.length > 2) out = `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length > 5) out = `${out.slice(0, 6)}.${out.slice(6)}`;
  if (digits.length > 8) out = `${out.slice(0, 10)}/${out.slice(10)}`;
  if (digits.length > 12) out = `${out.slice(0, 15)}-${out.slice(15)}`;
  return out;
}

/**
 * Cadastro passo 1 — dados básicos — Story 0.8 (Task 4).
 *
 * Fiel a `docs/design-refs/lojista-06-cadastro-passo1.png` (painel P6):
 * header + progress bar, upload de logo (placeholder), Nome da loja,
 * Categoria, CNPJ (máscara visual), Hub de operação, "Continuar".
 */
export default function CadastroPasso1({ navigation }: Props) {
  const { draft, updateDraft } = useCadastroDraft();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <CadastroHeader step={1} />

        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: darkColors.text.primary }]}>Cadastre seu estabelecimento</Text>
          <Text style={[styles.subtitle, { color: darkColors.text.secondary }]}>
            Em minutos sua loja já recebe pedidos no hub.
          </Text>
        </View>

        <Pressable
          style={styles.logoUpload}
          /* Upload real de logo fora de escopo do Épico 0 — placeholder local (Task 8 da story). */
          onPress={() => updateDraft({ logoLocalUri: draft.logoLocalUri ? null : 'local-placeholder' })}
        >
          <View style={[styles.logoCircle, { backgroundColor: darkColors.bg.surface, borderColor: darkColors.border.muted }]}>
            <Ionicons name="camera-outline" size={24} color={darkColors.text.secondary} />
          </View>
          <View>
            <Text style={[styles.logoLabel, { color: darkColors.text.primary }]}>Logo da loja</Text>
            <Text style={[styles.logoAction, { color: darkColors.accent.brand }]}>
              {draft.logoLocalUri ? 'Imagem adicionada' : 'Adicionar imagem'}
            </Text>
          </View>
        </Pressable>

        <FormField
          label="Nome da loja"
          value={draft.nome_fantasia}
          onChangeText={(nome_fantasia) => updateDraft({ nome_fantasia })}
          placeholder="Farmácia Vida"
        />

        <SelectField
          label="Categoria"
          value={draft.categoria}
          options={[...CATEGORIA_OPTIONS]}
          onChange={(categoria) => updateDraft({ categoria })}
        />

        <FormField
          label="CNPJ"
          value={draft.cnpj}
          onChangeText={(raw) => updateDraft({ cnpj: maskCnpj(raw) })}
          placeholder="00.000.000/0001-00"
          keyboardType="number-pad"
        />

        <SelectField
          label="Hub de operação"
          value={draft.hubPreferencialId}
          options={[...HUB_OPTIONS]}
          onChange={(hubPreferencialId) => updateDraft({ hubPreferencialId })}
        />

        <View style={styles.spacer} />
        <PrimaryButton label="Continuar" onPress={() => navigation.navigate('CadastroPasso2')} />
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
  logoUpload: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  logoAction: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
    marginTop: 2,
  },
  spacer: {
    height: spacing[4],
  },
});
