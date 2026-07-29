import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { darkColors } from '@keepit/ui-tokens';

import type { CatalogoStackParamList } from '../../navigation/types';
import { useLojaDisponibilidade } from './LojaDisponibilidadeContext';
import { useProductCatalog } from './ProductCatalogContext';
import { ProductForm, type ProductFormValues } from './ProductForm';

type Props = NativeStackScreenProps<CatalogoStackParamList, 'CadastrarProduto'>;

const INITIAL_VALUES: ProductFormValues = {
  nome: '',
  descricao: '',
  precoTexto: '',
  categoria: '',
  fotoLocalUri: null,
  estoqueDisplay: 0,
};

/**
 * Cadastrar produto — Story 0.9 (Task 2). Ver `ProductForm.tsx` para as
 * decisões de fidelidade visual (sem painel numerado no protótipo).
 */
export default function CadastrarProduto({ navigation }: Props) {
  const { createProduto } = useProductCatalog();
  const { estabelecimento } = useLojaDisponibilidade();

  function handleSubmit(values: ProductFormValues) {
    createProduto({
      nome: values.nome,
      descricao: values.descricao.trim() ? values.descricao : null,
      preco_reais: Number(values.precoTexto.replace(',', '.')),
      categoria_produto: values.categoria,
      foto_url: values.fotoLocalUri,
      estoqueDisplay: values.estoqueDisplay,
    });
    navigation.goBack();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: darkColors.bg.primary }}>
      <ProductForm
        title="Novo produto"
        submitLabel="Cadastrar produto"
        initialValues={INITIAL_VALUES}
        isFarmacia={estabelecimento?.categoria === 'farmacia'}
        onSubmit={handleSubmit}
        onBack={() => navigation.goBack()}
      />
    </SafeAreaView>
  );
}
