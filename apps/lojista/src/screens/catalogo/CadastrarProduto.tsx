import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { darkColors } from '@keepit/ui-tokens';

import { isSupabaseDataSource } from '../../lib/dataSource';
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

const MSG_ERRO_CADASTRO = 'Não foi possível cadastrar o produto agora. Tente novamente.';

/**
 * Cadastrar produto — Story 0.9 (Task 2). Ver `ProductForm.tsx` para as
 * decisões de fidelidade visual (sem painel numerado no protótipo).
 *
 * Story 4.4 (AC6) — `handleSubmit` passou a AGUARDAR `createProduto` (antes
 * disparava e navegava imediatamente, sem checar sucesso/falha — bug sob
 * dados reais: uma falha de rede/RLS/`CHECK preco_reais > 0` navegaria como
 * se o produto tivesse sido criado). Agora só navega em caso de sucesso
 * real; falha exibe mensagem e mantém os dados preenchidos no formulário
 * para nova tentativa.
 *
 * `fotoUploadEnabled={!isSupabaseDataSource()}` (AC1, AC5) — sem
 * `expo-image-picker` disponível neste workspace, o campo de foto some em
 * `DATA_SOURCE=supabase` (nenhuma foto poderia ser enviada de verdade);
 * `DATA_SOURCE=mock` preserva o placeholder demonstrativo da Story 0.9.
 */
export default function CadastrarProduto({ navigation }: Props) {
  const { createProduto } = useProductCatalog();
  const { estabelecimento } = useLojaDisponibilidade();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(values: ProductFormValues) {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await createProduto({
        nome: values.nome,
        descricao: values.descricao.trim() ? values.descricao : null,
        preco_reais: Number(values.precoTexto.replace(',', '.')),
        categoria_produto: values.categoria,
        foto_url: values.fotoLocalUri,
        estoqueDisplay: values.estoqueDisplay,
      });
      navigation.goBack();
    } catch {
      // AC6 — falha honesta: sem navegar, dados preservados no formulário.
      setSubmitError(MSG_ERRO_CADASTRO);
    } finally {
      setSubmitting(false);
    }
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
        submitting={submitting}
        submitError={submitError}
        fotoUploadEnabled={!isSupabaseDataSource()}
      />
    </SafeAreaView>
  );
}
