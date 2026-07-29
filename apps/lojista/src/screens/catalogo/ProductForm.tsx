import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { FormField } from '../../components/FormField';
import { NumericStepper } from '../../components/NumericStepper';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { FARMACIA_TARJADO_AVISO } from './currentStore';

export interface ProductFormValues {
  nome: string;
  descricao: string;
  precoTexto: string;
  categoria: string;
  fotoLocalUri: string | null;
  estoqueDisplay: number;
}

export interface ProductFormProps {
  title: string;
  submitLabel: string;
  initialValues: ProductFormValues;
  isFarmacia: boolean;
  onSubmit: (values: ProductFormValues) => void;
  onBack: () => void;
  footerSlot?: ReactNode;
}

/**
 * Formulário de produto (criar/editar) — Story 0.9 (Tasks 2/3).
 *
 * [AUTO-DECISION] Sem painel numerado equivalente no protótipo (P1-P11 do
 * Lojista não incluem "Cadastrar/Editar produto" — é implícito ao botão
 * "Novo" do painel P7). Layout segue os padrões visuais já estabelecidos
 * nas demais telas (cards `bg.surface`, inputs com o mesmo raio/tipografia
 * de `FormField`/`NumericStepper`) em vez de inventar um layout não
 * documentado (ver Dev Notes da story).
 *
 * [AUTO-DECISION] Upload de foto reaproveita o padrão mock já estabelecido
 * em `screens/perfil/PerfilPublico.tsx` (Pressable alternando
 * `null`/`'local-placeholder'`) em vez de introduzir `expo-image-picker`:
 * essa dependência não está instalada em nenhum app do monorepo hoje, e
 * adicioná-la exigiria `pnpm install` — fora do permitido nesta execução
 * (ambiente restrito a `apps/lojista/**`, sem rodar install).
 *
 * [AUTO-DECISION] Campo "Categoria" é texto livre (`FormField`), não
 * `SelectField`, para respeitar a nota de Dev Notes "categorias abertas
 * (sem enum fixo/whitelist restritiva de UI)" — `SelectField` só permite
 * escolher de uma lista fechada via modal, o que contradiria essa regra.
 */
export function ProductForm({
  title,
  submitLabel,
  initialValues,
  isFarmacia,
  onSubmit,
  onBack,
  footerSlot,
}: ProductFormProps) {
  const [nome, setNome] = useState(initialValues.nome);
  const [descricao, setDescricao] = useState(initialValues.descricao);
  const [precoTexto, setPrecoTexto] = useState(initialValues.precoTexto);
  const [categoria, setCategoria] = useState(initialValues.categoria);
  const [fotoLocalUri, setFotoLocalUri] = useState(initialValues.fotoLocalUri);
  const [estoqueDisplay, setEstoqueDisplay] = useState(initialValues.estoqueDisplay);

  const precoNumero = Number(precoTexto.replace(',', '.'));
  const isValid = nome.trim().length > 0 && categoria.trim().length > 0 && precoNumero > 0;

  function handleSubmit() {
    if (!isValid) return;
    onSubmit({
      nome: nome.trim(),
      descricao,
      precoTexto,
      categoria: categoria.trim(),
      fotoLocalUri,
      estoqueDisplay,
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader title={title} onBack={onBack} />

      <Pressable
        style={styles.fotoUpload}
        onPress={() => setFotoLocalUri((current) => (current ? null : 'local-placeholder'))}
      >
        <View style={[styles.fotoBox, { backgroundColor: darkColors.bg.surface, borderColor: darkColors.border.muted }]}>
          <Ionicons name="camera-outline" size={28} color={darkColors.text.secondary} />
          <Text style={[styles.fotoLabel, { color: darkColors.text.primary }]}>Foto do produto</Text>
          <Text style={[styles.fotoAction, { color: darkColors.accent.brand }]}>
            {fotoLocalUri ? 'Imagem adicionada' : 'Adicionar imagem'}
          </Text>
        </View>
      </Pressable>

      <FormField label="Nome do produto" value={nome} onChangeText={setNome} placeholder="Ex.: Protetor solar FPS 50" />

      <FormField
        label="Descrição"
        value={descricao}
        onChangeText={setDescricao}
        placeholder="Detalhes do produto"
        multiline
      />

      <FormField
        label="Preço (R$)"
        value={precoTexto}
        onChangeText={setPrecoTexto}
        placeholder="0,00"
        keyboardType="decimal-pad"
      />

      <View>
        <FormField
          label="Categoria"
          value={categoria}
          onChangeText={setCategoria}
          placeholder="Ex.: cuidados, higiene, alimentos"
        />
        {isFarmacia ? (
          <Text style={[styles.avisoTarjado, { color: darkColors.accent.warning }]}>{FARMACIA_TARJADO_AVISO}</Text>
        ) : null}
      </View>

      <NumericStepper
        label="Estoque"
        value={estoqueDisplay}
        onChange={setEstoqueDisplay}
        min={0}
        max={999}
        step={1}
        unit="un."
      />

      <PrimaryButton label={submitLabel} onPress={handleSubmit} disabled={!isValid} />

      {footerSlot}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[8],
    gap: spacing[5],
  },
  fotoUpload: {
    alignSelf: 'stretch',
  },
  fotoBox: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[6],
    gap: spacing[1],
  },
  fotoLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
  },
  fotoAction: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.base.fontSize,
  },
  avisoTarjado: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
    lineHeight: typography.sizes.sm.lineHeight,
    marginTop: spacing[2],
  },
});
