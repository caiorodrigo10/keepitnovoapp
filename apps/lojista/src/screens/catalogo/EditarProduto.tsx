import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { darkColors, spacing } from '@keepit/ui-tokens';

import { ConfirmModal } from '../../components/ConfirmModal';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { CatalogoStackParamList } from '../../navigation/types';
import { useLojaDisponibilidade } from './LojaDisponibilidadeContext';
import { useProductCatalog } from './ProductCatalogContext';
import { ProductForm, type ProductFormValues } from './ProductForm';

type Props = NativeStackScreenProps<CatalogoStackParamList, 'EditarProduto'>;

/**
 * Editar produto — Story 0.9 (Task 3/4). Reaproveita `ProductForm` em modo
 * edição, pré-preenchido a partir do catálogo já carregado em
 * `ProductCatalogContext` (`getById`) — ver Dev Notes do contexto sobre por
 * que `ProductPort` não é re-consultado aqui (`getById` da port lê do mock
 * db diretamente e poderia divergir do estado local em memória).
 *
 * "Excluir produto" (Task 4) fica aqui, não na lista — pausar/reativar é a
 * ação rápida do card (`ProductCard`, toggle inline); excluir é destrutivo e
 * segue o mesmo padrão de confirmação de `ExcluirConta.tsx` (Story 0.8).
 */
export default function EditarProduto({ navigation, route }: Props) {
  const { produtoId } = route.params;
  const { getById, updateProduto, deleteProduto } = useProductCatalog();
  const { estabelecimento } = useLojaDisponibilidade();
  const [modalVisible, setModalVisible] = useState(false);

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

  function handleSubmit(values: ProductFormValues) {
    updateProduto(produtoId, {
      nome: values.nome,
      descricao: values.descricao.trim() ? values.descricao : null,
      preco_reais: Number(values.precoTexto.replace(',', '.')),
      categoria_produto: values.categoria,
      foto_url: values.fotoLocalUri,
      estoqueDisplay: values.estoqueDisplay,
    });
    navigation.goBack();
  }

  function handleExcluir() {
    setModalVisible(false);
    deleteProduto(produtoId);
    navigation.goBack();
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
        footerSlot={
          <View style={styles.excluirWrap}>
            <PrimaryButton label="Excluir produto" onPress={() => setModalVisible(true)} variant="warning" />
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
  },
});
