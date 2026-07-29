import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { FormField } from '../../components/FormField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SelectField } from '../../components/SelectField';
import type { PerfilStackParamList } from '../../navigation/types';
import { useLojaPerfil } from './LojaPerfilContext';
import { CATEGORIA_OPTIONS } from '../auth/cadastroDraft';

type Props = NativeStackScreenProps<PerfilStackParamList, 'PerfilPublico'>;

/** Mapa reverso rótulo->valor de categoria para editar o perfil já existente (que guarda o rótulo em PT). */
function categoriaValueFromLabel(label: string): string | null {
  return CATEGORIA_OPTIONS.find((option) => option.label === label)?.value ?? null;
}

/**
 * Perfil público (editar) — Story 0.8 (Task 9).
 *
 * Ancorada no item "Perfil público" de Configurações (P11 — ver Dev Notes).
 * Mesmos campos do cadastro relacionados à vitrine pública: nome da loja,
 * categoria, foto/logo, descrição, foto da fachada. "Salvar" apenas navega
 * de volta para Configurações, sem persistência real (AC3).
 */
export default function PerfilPublico({ navigation }: Props) {
  const { perfil, updatePerfil } = useLojaPerfil();

  const [nome, setNome] = useState(perfil.nome_fantasia);
  const [categoriaValue, setCategoriaValue] = useState<string | null>(categoriaValueFromLabel(perfil.categoria));
  const [descricao, setDescricao] = useState(perfil.descricao);
  const [logoLocalUri, setLogoLocalUri] = useState(perfil.logoLocalUri);
  const [fotoFachadaUrl, setFotoFachadaUrl] = useState(perfil.foto_fachada_url);

  function handleSalvar() {
    const categoriaLabel = CATEGORIA_OPTIONS.find((option) => option.value === categoriaValue)?.label ?? perfil.categoria;
    updatePerfil({
      nome_fantasia: nome,
      categoria: categoriaLabel,
      descricao,
      logoLocalUri,
      foto_fachada_url: fotoFachadaUrl,
    });
    navigation.navigate('Configuracoes');
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: darkColors.text.primary }]}>Perfil público</Text>

        <Pressable
          style={styles.logoUpload}
          onPress={() => setLogoLocalUri((current) => (current ? null : 'local-placeholder'))}
        >
          <View style={[styles.logoCircle, { backgroundColor: darkColors.bg.surface, borderColor: darkColors.border.muted }]}>
            <Ionicons name="camera-outline" size={24} color={darkColors.text.secondary} />
          </View>
          <View>
            <Text style={[styles.logoLabel, { color: darkColors.text.primary }]}>Logo da loja</Text>
            <Text style={[styles.logoAction, { color: darkColors.accent.brand }]}>
              {logoLocalUri ? 'Imagem adicionada' : 'Adicionar imagem'}
            </Text>
          </View>
        </Pressable>

        <FormField label="Nome da loja" value={nome} onChangeText={setNome} />

        <SelectField
          label="Categoria"
          value={categoriaValue}
          options={[...CATEGORIA_OPTIONS]}
          onChange={setCategoriaValue}
        />

        <FormField
          label="Descrição"
          value={descricao}
          onChangeText={setDescricao}
          placeholder="Conte para os clientes o que sua loja oferece"
          multiline
        />

        <Pressable
          style={styles.fachadaUpload}
          onPress={() => setFotoFachadaUrl((current) => (current ? null : 'local-placeholder'))}
        >
          <View style={[styles.fachadaBox, { backgroundColor: darkColors.bg.surface, borderColor: darkColors.border.muted }]}>
            <Ionicons name="storefront-outline" size={28} color={darkColors.text.secondary} />
            <Text style={[styles.fachadaLabel, { color: darkColors.text.primary }]}>Foto da fachada</Text>
            <Text style={[styles.fachadaAction, { color: darkColors.accent.brand }]}>
              {fotoFachadaUrl ? 'Imagem adicionada' : 'Adicionar imagem'}
            </Text>
          </View>
        </Pressable>

        <View style={styles.spacer} />
        <PrimaryButton label="Salvar" onPress={handleSalvar} />
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
  title: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes['2xl'].fontSize,
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
  spacer: {
    height: spacing[4],
  },
});
