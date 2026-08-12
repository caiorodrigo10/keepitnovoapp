import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { darkColors, spacing, typography } from '@keepit/ui-tokens';

import { ConfirmModal } from '../../components/ConfirmModal';
import { PrimaryButton } from '../../components/PrimaryButton';
import { isSupabaseDataSource } from '../../lib/dataSource';
import type { CatalogoStackParamList } from '../../navigation/types';
import { useLojaDisponibilidade } from './LojaDisponibilidadeContext';
import { useProductCatalog } from './ProductCatalogContext';
import { ProductForm, type ProductFormValues } from './ProductForm';

type Props = NativeStackScreenProps<CatalogoStackParamList, 'EditarProduto'>;

const MSG_ERRO_ATUALIZAR = 'Não foi possível salvar as alterações agora. Tente novamente.';
const MSG_ERRO_EXCLUIR = 'Não foi possível excluir o produto agora. Tente novamente.';

/**
 * Editar produto — Story 0.9 (Task 3/4), honestidade de sucesso/falha
 * corrigida pela Story 4.5 (AC2)/4.6 (AC2, AC3). Reaproveita `ProductForm`
 * em modo edição, pré-preenchido a partir do catálogo já carregado em
 * `ProductCatalogContext` (`getById`) — ver Dev Notes do contexto sobre por
 * que `ProductPort` não é re-consultado aqui (`getById` da port lê do mock
 * db/Supabase diretamente e poderia divergir do estado local em memória já
 * carregado pela lista).
 *
 * **Story 4.5 (AC2):** `handleSubmit` passou a AGUARDAR `updateProduto`
 * (antes disparava e navegava imediatamente, sem checar sucesso/falha —
 * mesmo bug já corrigido em `CadastrarProduto.tsx` pela Story 4.4, AC6).
 * Falha (rede, RLS, `CHECK preco_reais > 0`) mantém o formulário preenchido
 * com o erro visível, sem navegar.
 *
 * **Story 4.6 (AC2, AC3):** `handleExcluir` também passou a AGUARDAR
 * `deleteProduto` (soft delete real via `excluido_em`) — o modal só fecha e
 * a tela só navega de volta em caso de sucesso real; falha mantém o modal
 * fechado mas exibe o erro na própria tela (produto continua no catálogo).
 *
 * `fotoUploadEnabled={!isSupabaseDataSource()}` — mesmo seam da Story 4.4
 * (`CadastrarProduto.tsx`): sem `expo-image-picker` disponível neste
 * workspace, o campo de foto fica desligado em `DATA_SOURCE=supabase` (CRUD
 * de texto funciona normalmente); `DATA_SOURCE=mock` preserva o placeholder
 * demonstrativo da Story 0.9.
 *
 * "Excluir produto" (Task 4) fica aqui, não na lista — pausar/reativar é a
 * ação rápida do card (`ProductCard`, toggle inline); excluir é destrutivo e
 * segue o mesmo padrão de confirmação já usado por `ConfirmModal`.
 */
export default function EditarProduto({ navigation, route }: Props) {
  const { produtoId } = route.params;
  const { getById, updateProduto, deleteProduto } = useProductCatalog();
  const { estabelecimento } = useLojaDisponibilidade();
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const produto = getById(produtoId);

  if (!produto) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: darkColors.bg.primary }} />;
  }

  const initialValues: ProductFormValues = {
    nome: produto.nome,
    descricao: produto.descricao ?? '',
    precoTexto: produto.preco_reais.toFixed(2).replace('.', ','),
    categoria: produto.categoria_produto,
    fotoLocalUri: produto.foto_url,
    estoqueDisplay: produto.estoqueDisplay,
  };

  async function handleSubmit(values: ProductFormValues) {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await updateProduto(produtoId, {
        nome: values.nome,
        descricao: values.descricao.trim() ? values.descricao : null,
        preco_reais: Number(values.precoTexto.replace(',', '.')),
        categoria_produto: values.categoria,
        foto_url: values.fotoLocalUri,
        estoqueDisplay: values.estoqueDisplay,
      });
      navigation.goBack();
    } catch {
      // Story 4.5 (AC2) — falha honesta: sem navegar, formulário preservado.
      setSubmitError(MSG_ERRO_ATUALIZAR);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExcluir() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteProduto(produtoId);
      setModalVisible(false);
      navigation.goBack();
    } catch {
      // Story 4.6 (AC2) — falha honesta: modal fecha, mas a tela mostra o
      // erro; produto continua no catálogo (nenhuma exclusão fictícia).
      setModalVisible(false);
      setDeleteError(MSG_ERRO_EXCLUIR);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: darkColors.bg.primary }}>
      <ProductForm
        title="Editar produto"
        submitLabel="Salvar alterações"
        initialValues={initialValues}
        isFarmacia={estabelecimento?.categoria === 'farmacia'}
        onSubmit={handleSubmit}
        onBack={() => navigation.goBack()}
        submitting={submitting}
        submitError={submitError}
        fotoUploadEnabled={!isSupabaseDataSource()}
        footerSlot={
          <View style={styles.excluirWrap}>
            {deleteError ? <Text style={[styles.deleteError, { color: darkColors.accent.warning }]}>{deleteError}</Text> : null}
            <PrimaryButton
              label="Excluir produto"
              onPress={() => setModalVisible(true)}
              variant="warning"
              loading={deleting}
            />
          </View>
        }
      />

      <ConfirmModal
        visible={modalVisible}
        title="Excluir produto?"
        message={`Remover "${produto.nome}" do catálogo. Essa ação não pode ser desfeita.`}
        confirmLabel="Sim, excluir"
        onConfirm={handleExcluir}
        onCancel={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  excluirWrap: {
    marginTop: spacing[2],
    gap: spacing[2],
  },
  deleteError: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
  },
});
