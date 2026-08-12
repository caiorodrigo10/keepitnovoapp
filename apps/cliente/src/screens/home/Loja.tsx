import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import {
  AsyncStateBlock,
  DevStateToggle,
  ProductRow,
  RatingLabel,
  toAsyncCallOptions,
  type DevSimState,
} from '../../components/discovery';
import { ImagePlaceholder } from '../../components/discovery/ImagePlaceholder';
import { LojaEstadoBadge } from '../../components/discovery/LojaEstadoBadge';
import { Screen } from '../../components/ui';
import { useCatalogo } from '../../hooks/useCatalogo';
import { useLojaEstado } from '../../hooks/useLojaEstado';
import { useStoreDetail } from '../../hooks/useStoreDetail';
import { formatReais } from '../../lib/format';
import { getRatingPlaceholder, resolveTicketMinimoReais } from '../../lib/discoveryDisplay';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Loja'>;

const CATEGORIA_PRODUTO_LABEL: Record<string, string> = {
  medicamentos: 'Medicamentos',
  cuidados: 'Cuidados',
  suplementos: 'Suplementos',
  vestuario: 'Roupas',
  bebidas: 'Bebidas',
  snacks: 'Snacks',
};

/**
 * Loja + catálogo (Task 3, AC1-AC4). Fiel a `cliente-03-loja-catalogo.png`:
 * cabeçalho (nome, categoria, distância, badge de estado, rating), tabs por
 * categoria de produto, lista de produtos, footer "Ver carrinho" (stub —
 * carrinho é Story 0.6). Os 3 estados de loja (AC1) desabilitam o catálogo
 * com overlay quando `fechada`/`pausada`.
 *
 * **Story 5.4 (AC4, AC5):** "Pedido mínimo: R$ X" (`resolveTicketMinimoReais`,
 * COALESCE com `businessConfig.ticketMinimoReais` quando a loja não define o
 * próprio) e a taxa de deslocamento (`Estabelecimento.taxa_deslocamento_reais`,
 * já real) — dado já presente no domínio, sem porta/adapter novo. AC3 (botão
 * "Falar com o lojista"/WhatsApp) permanece FORA — requer expor `telefone`
 * publicamente, decisão de privacidade pendente (`docs/PERGUNTAS_REGRAS_NEGOCIO.md
 * §4.5`).
 */
export default function Loja({ route, navigation }: Props) {
  const { estabelecimentoId } = route.params;
  const [devState, setDevState] = useState<DevSimState>('normal');
  const options = toAsyncCallOptions(devState);
  const [categoriaAtiva, setCategoriaAtiva] = useState('todos');

  const { data: loja, loading: loadingLoja, error: errorLoja } = useStoreDetail(estabelecimentoId, options);
  const { data: estado, loading: loadingEstado } = useLojaEstado(estabelecimentoId, options);
  const { data: produtos, loading: loadingProdutos, error: errorProdutos } = useCatalogo(estabelecimentoId, options);

  const categoriasProduto = useMemo(() => {
    const categorias = new Set(produtos.map((p) => p.categoria_produto));
    return ['todos', ...categorias];
  }, [produtos]);

  const produtosFiltrados = useMemo(
    () => (categoriaAtiva === 'todos' ? produtos : produtos.filter((p) => p.categoria_produto === categoriaAtiva)),
    [produtos, categoriaAtiva],
  );

  const loading = loadingLoja || loadingProdutos || loadingEstado;
  const error = errorLoja ?? errorProdutos;
  const catalogoDesabilitado = estado === 'fechada' || estado === 'pausada';

  return (
    <Screen>
      <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
        <Text style={styles.backIcon}>‹</Text>
      </Pressable>

      <DevStateToggle value={devState} onChange={setDevState} />

      {error ? (
        <AsyncStateBlock kind="error" errorLabel="Não foi possível carregar esta loja. Tente novamente." />
      ) : loading ? (
        <AsyncStateBlock kind="loading" />
      ) : !loja ? (
        <AsyncStateBlock kind="empty" emptyLabel="Loja não encontrada." />
      ) : (
        <>
          <View style={styles.header}>
            <ImagePlaceholder uri={loja.foto_fachada_url} style={styles.foto} />
            <View style={styles.headerInfo}>
              <View style={styles.headerTop}>
                <View style={styles.headerTexts}>
                  <Text style={styles.nome}>{loja.nome_fantasia}</Text>
                  <Text style={styles.meta}>{loja.categoria}</Text>
                </View>
                {estado && <LojaEstadoBadge estado={estado} />}
              </View>
              <RatingLabel value={getRatingPlaceholder(loja.id)} />
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoRowText}>Pedido mínimo: {formatReais(resolveTicketMinimoReais(loja))}</Text>
            <Text style={styles.infoRowText}>Taxa de deslocamento: {formatReais(loja.taxa_deslocamento_reais)}</Text>
          </View>

          {catalogoDesabilitado && (
            <View style={styles.avisoFechada}>
              <Text style={styles.avisoFechadaTexto}>
                {estado === 'pausada'
                  ? 'Esta loja está pausada no momento. Não é possível fazer pedidos.'
                  : 'Esta loja está fechada agora. Não é possível fazer pedidos.'}
              </Text>
            </View>
          )}

          <View style={styles.tabsRow}>
            {categoriasProduto.map((categoriaId) => {
              const active = categoriaId === categoriaAtiva;
              return (
                <Pressable
                  key={categoriaId}
                  style={[styles.tab, active && styles.tabActive]}
                  onPress={() => setCategoriaAtiva(categoriaId)}
                >
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                    {categoriaId === 'todos' ? 'Todos' : (CATEGORIA_PRODUTO_LABEL[categoriaId] ?? categoriaId)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.catalogo, catalogoDesabilitado && styles.catalogoDesabilitado]} pointerEvents={catalogoDesabilitado ? 'none' : 'auto'}>
            {produtosFiltrados.length === 0 ? (
              <AsyncStateBlock kind="empty" emptyLabel="Esta loja ainda não cadastrou produtos." />
            ) : (
              produtosFiltrados.map((produto) => (
                <ProductRow
                  key={produto.id}
                  produto={produto}
                  onPress={() => navigation.navigate('DetalheProduto', { produtoId: produto.id })}
                />
              ))
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['4'],
  },
  backIcon: {
    fontSize: typography.sizes.xl.fontSize,
    color: lightColors.text.primary,
  },
  header: {
    flexDirection: 'row',
    gap: spacing['3'],
    marginBottom: spacing['4'],
  },
  foto: {
    width: 72,
    height: 72,
  },
  headerInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing['2'],
  },
  headerTexts: {
    flex: 1,
  },
  nome: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    color: lightColors.text.primary,
  },
  meta: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing['3'],
    marginBottom: spacing['4'],
  },
  infoRowText: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
  },
  avisoFechada: {
    backgroundColor: lightColors.bg.surface,
    borderRadius: radii.md,
    padding: spacing['3'],
    marginBottom: spacing['4'],
  },
  avisoFechadaTexto: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
  },
  tabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing['2'],
    marginBottom: spacing['3'],
  },
  tab: {
    paddingHorizontal: spacing['4'],
    height: 36,
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: lightColors.text.primary,
  },
  tabLabel: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.secondary,
  },
  tabLabelActive: {
    color: lightColors.bg.primary,
  },
  catalogo: {},
  catalogoDesabilitado: {
    opacity: 0.4,
  },
});
