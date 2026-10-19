import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';
import { CATEGORIA_PRODUTO_OPTIONS } from '@keepit/config';
import type { ComplementoGrupo } from '@keepit/core-data';

import { FormField } from '../../components/FormField';
import { NumericStepper } from '../../components/NumericStepper';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SelectField } from '../../components/SelectField';
import { FARMACIA_TARJADO_AVISO } from './currentStore';
import { formatProductPriceInput, parseProductPrice } from './productPrice';

export interface ProductFormValues {
  nome: string;
  descricao: string;
  precoTexto: string;
  categoria: string;
  fotoLocalUri: string | null;
  estoqueDisplay: number;
  gruposComplementos?: ComplementoGrupo[];
}

export interface ProductFormProps {
  title: string;
  submitLabel: string;
  initialValues: ProductFormValues;
  isFarmacia: boolean;
  onSubmit: (values: ProductFormValues) => void;
  onBack: () => void;
  footerSlot?: ReactNode;
  /**
   * Story 4.4 (AC6) — estado de submissão/erro controlado pelo chamador
   * (`CadastrarProduto.tsx`), que é quem sabe se a chamada real terminou com
   * sucesso ou falha. Default `false`/`null` preserva o comportamento
   * anterior (sem chamador ciente de estado assíncrono, ex.: `EditarProduto.tsx`
   * nesta Story, que segue 100% mock/local, fora de escopo — Story 4.5).
   */
  submitting?: boolean;
  submitError?: string | null;
  /**
   * Story 4.4 (AC1, AC4, AC5) — `false` desliga a interação de "Adicionar
   * imagem" (nenhum `expo-image-picker` disponível neste workspace — ver Dev
   * Notes da Story) e mostra um estado honesto em vez do placeholder
   * `'local-placeholder'`, que NUNCA deve ser enviado a um `create` real
   * (corromperia `produtos.foto_url` com uma string que não é um path de
   * Storage válido — mesmo precedente de `AtualizarMeuPerfilInput`, Story
   * 3.11). Default `true` preserva o comportamento mock (Story 0.9).
   */
  fotoUploadEnabled?: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function integerOr(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

export function normalizarGrupoComplemento(grupo: ComplementoGrupo): ComplementoGrupo {
  if (grupo.tipo === 'unica') {
    return {
      ...grupo,
      min_selecoes: clamp(integerOr(grupo.min_selecoes, 0), 0, 1),
      max_selecoes: 1,
    };
  }

  const limiteDeItens = Math.max(1, grupo.itens.length);
  const maxSelecoes = clamp(integerOr(grupo.max_selecoes, 1), 1, limiteDeItens);

  return {
    ...grupo,
    min_selecoes: clamp(integerOr(grupo.min_selecoes, 0), 0, maxSelecoes),
    max_selecoes: maxSelecoes,
  };
}

export function definirObrigatoriedadeGrupo(grupo: ComplementoGrupo, obrigatorio: boolean) {
  return normalizarGrupoComplemento({ ...grupo, min_selecoes: obrigatorio ? 1 : 0 });
}

export function definirTipoGrupo(grupo: ComplementoGrupo, tipo: ComplementoGrupo['tipo']) {
  return normalizarGrupoComplemento({ ...grupo, tipo });
}

export function isValidComplementoGrupo(grupo: ComplementoGrupo) {
  if (!grupo.nome.trim() || grupo.itens.length === 0 || grupo.itens.some((item) => !item.nome.trim())) return false;
  if (!Number.isInteger(grupo.min_selecoes) || !Number.isInteger(grupo.max_selecoes)) return false;

  if (grupo.tipo === 'unica') {
    return grupo.max_selecoes === 1 && grupo.min_selecoes >= 0 && grupo.min_selecoes <= 1;
  }

  return grupo.min_selecoes >= 0
    && grupo.min_selecoes <= grupo.max_selecoes
    && grupo.max_selecoes >= 1
    && grupo.max_selecoes <= grupo.itens.length;
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
 * (ambiente restrito a `apps/lojista/**`, sem rodar install). Story 4.4
 * (`fotoUploadEnabled`): quando `false`, essa interação fica desligada e um
 * estado honesto é exibido no lugar (nenhum picker real disponível ainda).
 *
 * [AUTO-DECISION] Story 4.4 (AC1) — "Categoria" passou de texto livre
 * (`FormField`) para `SelectField` alimentado por `CATEGORIA_PRODUTO_OPTIONS`
 * (`@keepit/config`, Dependencies item 3) — requisito explícito do AC1 desta
 * Story ("dropdown alimentado por CATEGORIA_PRODUTO_OPTIONS"), substituindo
 * a decisão de texto livre da Story 0.9. A lista permanece "aberta" no
 * sentido de banco (`categoria_produto` é `text` sem `CHECK`), mas a UI
 * agora oferece as opções conhecidas em vez de digitação livre — mesmo
 * padrão já usado por "Categoria" da loja em `PerfilPublico.tsx`.
 */
export function ProductForm({
  title,
  submitLabel,
  initialValues,
  isFarmacia,
  onSubmit,
  onBack,
  footerSlot,
  submitting = false,
  submitError = null,
  fotoUploadEnabled = true,
}: ProductFormProps) {
  const [nome, setNome] = useState(initialValues.nome);
  const [descricao, setDescricao] = useState(initialValues.descricao);
  const [precoTexto, setPrecoTexto] = useState(() => formatProductPriceInput(initialValues.precoTexto));
  const [categoria, setCategoria] = useState<string | null>(initialValues.categoria || null);
  const [fotoLocalUri, setFotoLocalUri] = useState(initialValues.fotoLocalUri);
  const [estoqueDisplay, setEstoqueDisplay] = useState(initialValues.estoqueDisplay);
  const [gruposComplementos, setGruposComplementos] = useState(initialValues.gruposComplementos ?? []);

  const precoNumero = parseProductPrice(precoTexto);
  const isValid = nome.trim().length > 0
    && !!categoria
    && precoNumero > 0
    && gruposComplementos.every(isValidComplementoGrupo);

  function updateGroup(groupIndex: number, update: (grupo: ComplementoGrupo) => ComplementoGrupo) {
    setGruposComplementos((all) => all.map((grupo, index) => index === groupIndex ? update(grupo) : grupo));
  }

  function setGrupoObrigatorio(groupIndex: number, obrigatorio: boolean) {
    updateGroup(groupIndex, (grupo) => definirObrigatoriedadeGrupo(grupo, obrigatorio));
  }

  function setGrupoTipo(groupIndex: number, tipo: ComplementoGrupo['tipo']) {
    updateGroup(groupIndex, (grupo) => definirTipoGrupo(grupo, tipo));
  }

  function setGrupoLimite(groupIndex: number, limite: 'min_selecoes' | 'max_selecoes', value: number) {
    updateGroup(groupIndex, (grupo) => normalizarGrupoComplemento({ ...grupo, [limite]: value }));
  }

  function handleSubmit() {
    if (!isValid || submitting) return;
    onSubmit({
      nome: nome.trim(),
      descricao,
      precoTexto,
      categoria: categoria ?? '',
      fotoLocalUri,
      estoqueDisplay,
      gruposComplementos,
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader title={title} onBack={onBack} />

      {fotoUploadEnabled ? (
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
      ) : (
        // Story 4.4 (AC1, AC5) — sem expo-image-picker disponível neste modo,
        // estado honesto (nunca um placeholder de "Adicionar imagem"
        // enganoso, mesmo precedente de `PerfilPublico.tsx` para a fachada).
        <View style={styles.fotoUpload}>
          <View style={[styles.fotoBox, { backgroundColor: darkColors.bg.surface, borderColor: darkColors.border.muted }]}>
            <Ionicons name="image-outline" size={28} color={darkColors.text.tertiary} />
            <Text style={[styles.fotoLabel, { color: darkColors.text.primary }]}>Foto do produto</Text>
            <Text style={[styles.fotoAction, { color: darkColors.text.tertiary }]}>
              Upload de foto disponível em breve
            </Text>
          </View>
        </View>
      )}

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
        onChangeText={(value) => setPrecoTexto(formatProductPriceInput(value))}
        placeholder="0,00"
        keyboardType="decimal-pad"
      />

      <View>
        <SelectField
          label="Categoria"
          value={categoria}
          options={[...CATEGORIA_PRODUTO_OPTIONS]}
          onChange={setCategoria}
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

      <View style={styles.complementosSection}>
        <Text style={[styles.complementosTitle, { color: darkColors.text.primary }]}>Complementos</Text>
        {gruposComplementos.map((grupo, groupIndex) => (
          <View key={grupo.id ?? `novo-${groupIndex}`} style={[styles.complementoGroup, { borderColor: darkColors.border.muted }]}>
            <FormField label="Nome do grupo" value={grupo.nome} onChangeText={(nome) => setGruposComplementos((all) => all.map((value, index) => index === groupIndex ? { ...value, nome } : value))} placeholder="Ex.: Escolha o molho" />
            <View style={styles.complementoOptions}>
              <Pressable onPress={() => setGrupoObrigatorio(groupIndex, true)}>
                <Text style={{ color: grupo.min_selecoes > 0 ? darkColors.accent.brand : darkColors.text.secondary }}>Obrigatório</Text>
              </Pressable>
              <Pressable onPress={() => setGrupoObrigatorio(groupIndex, false)}>
                <Text style={{ color: grupo.min_selecoes === 0 ? darkColors.accent.brand : darkColors.text.secondary }}>Opcional</Text>
              </Pressable>
            </View>
            <View style={styles.complementoOptions}>
              <Pressable onPress={() => setGrupoTipo(groupIndex, 'unica')}>
                <Text style={{ color: grupo.tipo === 'unica' ? darkColors.accent.brand : darkColors.text.secondary }}>Única escolha</Text>
              </Pressable>
              <Pressable onPress={() => setGrupoTipo(groupIndex, 'multipla')}>
                <Text style={{ color: grupo.tipo === 'multipla' ? darkColors.accent.brand : darkColors.text.secondary }}>Múltipla escolha</Text>
              </Pressable>
            </View>
            {grupo.tipo === 'multipla' ? (
              <View style={styles.complementoLimits}>
                <NumericStepper
                  label="Mínimo de seleções"
                  value={grupo.min_selecoes}
                  onChange={(value) => setGrupoLimite(groupIndex, 'min_selecoes', value)}
                  min={0}
                  max={grupo.max_selecoes}
                  step={1}
                  unit=""
                />
                <NumericStepper
                  label="Máximo de seleções"
                  value={grupo.max_selecoes}
                  onChange={(value) => setGrupoLimite(groupIndex, 'max_selecoes', value)}
                  min={Math.max(1, grupo.min_selecoes)}
                  max={grupo.itens.length}
                  step={1}
                  unit=""
                />
              </View>
            ) : null}
            {grupo.itens.map((item, itemIndex) => <View key={item.id ?? `novo-item-${itemIndex}`}><FormField label="Item" value={item.nome} onChangeText={(nome) => setGruposComplementos((all) => all.map((value, index) => index === groupIndex ? { ...value, itens: value.itens.map((entry, current) => current === itemIndex ? { ...entry, nome } : entry) } : value))} placeholder="Ex.: Queijo" /><FormField label="Preço extra (R$)" value={String(item.preco_extra_reais).replace('.', ',')} onChangeText={(text) => setGruposComplementos((all) => all.map((value, index) => index === groupIndex ? { ...value, itens: value.itens.map((entry, current) => current === itemIndex ? { ...entry, preco_extra_reais: Number(text.replace(',', '.')) || 0 } : entry) } : value))} keyboardType="decimal-pad" /></View>)}
            <Pressable onPress={() => setGruposComplementos((all) => all.map((value, index) => index === groupIndex ? { ...value, itens: [...value.itens, { nome: '', preco_extra_reais: 0, ordem: value.itens.length }] } : value))}><Text style={{ color: darkColors.accent.brand }}>Adicionar item</Text></Pressable>
            <Pressable onPress={() => setGruposComplementos((all) => all.filter((_, index) => index !== groupIndex))}><Text style={{ color: darkColors.accent.warning }}>Remover grupo</Text></Pressable>
          </View>
        ))}
        <Pressable onPress={() => setGruposComplementos((all) => [...all, { nome: '', tipo: 'unica', min_selecoes: 0, max_selecoes: 1, ordem: all.length, itens: [{ nome: '', preco_extra_reais: 0, ordem: 0 }] }])}><Text style={{ color: darkColors.accent.brand }}>Adicionar grupo</Text></Pressable>
      </View>

      {submitError ? <Text style={[styles.submitError, { color: darkColors.accent.warning }]}>{submitError}</Text> : null}

      <PrimaryButton label={submitLabel} onPress={handleSubmit} disabled={!isValid} loading={submitting} />

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
  submitError: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
  },
  complementosSection: { gap: spacing[2] },
  complementosTitle: { fontFamily: 'HankenGrotesk-Bold', fontSize: typography.sizes.lg.fontSize },
  complementoGroup: { borderWidth: 1, borderRadius: radii.md, padding: spacing[3], gap: spacing[2] },
  complementoOptions: { flexDirection: 'row', gap: spacing[3] },
  complementoLimits: { gap: spacing[2] },
});
