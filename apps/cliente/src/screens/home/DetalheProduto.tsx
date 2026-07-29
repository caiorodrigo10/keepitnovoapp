import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { AsyncStateBlock, DevStateToggle, RatingLabel, toAsyncCallOptions, type DevSimState } from '../../components/discovery';
import { ImagePlaceholder } from '../../components/discovery/ImagePlaceholder';
import { Screen } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useProductDetail } from '../../hooks/useProductDetail';
import { useStoreDetail } from '../../hooks/useStoreDetail';
import { getRatingPlaceholder } from '../../lib/discoveryDisplay';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'DetalheProduto'>;

function formatPreco(preco: number): string {
  return preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Detalhe do produto (Task 4, AC1-AC4). Fiel a `cliente-12-detalhe-produto.png`:
 * foto, nome/preço, rating + "Em estoque" (não há controle de estoque real
 * no schema — "Em estoque" é um rótulo fixo derivado de `produto.ativo`),
 * descrição, seletor de quantidade (estado local).
 *
 * **Atualizado pela Story 0.6:** o botão "Adicionar ao carrinho" (antes
 * stub/`disabled` na Story 0.5) agora chama `useCart().addItem(...)` e
 * navega para `Carrinho` — é o ponto de entrada real do fluxo de checkout
 * desta story.
 */
export default function DetalheProduto({ route, navigation }: Props) {
  const { produtoId } = route.params;
  const [devState, setDevState] = useState<DevSimState>('normal');
  const options = toAsyncCallOptions(devState);
  const [quantidade, setQuantidade] = useState(1);
  const cart = useCart();

  const { data: produto, loading: loadingProduto, error: errorProduto } = useProductDetail(produtoId, options);
  const { data: loja } = useStoreDetail(produto?.estabelecimento_id ?? '', {});

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.roundButton}>
          <Text style={styles.roundButtonIcon}>‹</Text>
        </Pressable>
        <View style={styles.roundButton}>
          <Text style={styles.roundButtonIcon}>♡</Text>
        </View>
      </View>

      <DevStateToggle value={devState} onChange={setDevState} />

      {errorProduto ? (
        <AsyncStateBlock kind="error" errorLabel="Não foi possível carregar este produto. Tente novamente." />
      ) : loadingProduto ? (
        <AsyncStateBlock kind="loading" />
      ) : !produto ? (
        <AsyncStateBlock kind="empty" emptyLabel="Produto não encontrado." />
      ) : (
        <>
          <ImagePlaceholder uri={produto.foto_url} style={styles.foto} borderRadius={radii.card} />

          <View style={styles.headerRow}>
            <Text style={styles.nome}>{produto.nome}</Text>
            <Text style={styles.preco}>{formatPreco(produto.preco_reais)}</Text>
          </View>
          <Text style={styles.lojaNome}>
            {loja?.nome_fantasia ?? '...'} · {produto.categoria_produto}
          </Text>

          <View style={styles.metaRow}>
            <RatingLabel value={getRatingPlaceholder(produto.estabelecimento_id)} reviewCount={213} />
            {produto.ativo && (
              <View style={styles.estoqueBadge}>
                <Text style={styles.estoqueBadgeLabel}>Em estoque</Text>
              </View>
            )}
          </View>

          {produto.descricao && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Descrição</Text>
              <Text style={styles.descricao}>{produto.descricao}</Text>
            </View>
          )}

          <View style={styles.quantidadeRow}>
            <Text style={styles.sectionTitle}>Quantidade</Text>
            <View style={styles.stepper}>
              <Pressable
                style={styles.stepperButton}
                onPress={() => setQuantidade((q) => Math.max(1, q - 1))}
                hitSlop={8}
              >
                <Text style={styles.stepperButtonLabel}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>{quantidade}</Text>
              <Pressable style={styles.stepperButton} onPress={() => setQuantidade((q) => q + 1)} hitSlop={8}>
                <Text style={styles.stepperButtonLabel}>+</Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            style={styles.addButton}
            onPress={() => {
              cart.addItem({
                estabelecimentoId: produto.estabelecimento_id,
                produtoId: produto.id,
                nome: produto.nome,
                precoReais: produto.preco_reais,
                quantidade,
              });
              navigation.navigate('Carrinho');
            }}
          >
            <Text style={styles.addButtonLabel}>Adicionar ao carrinho</Text>
            <Text style={styles.addButtonPreco}>{formatPreco(produto.preco_reais * quantidade)}</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing['4'],
  },
  roundButton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonIcon: {
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  foto: {
    width: '100%',
    height: 180,
    marginBottom: spacing['4'],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing['2'],
  },
  nome: {
    flex: 1,
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    color: lightColors.text.primary,
  },
  preco: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.xl.fontSize,
    color: lightColors.text.primary,
  },
  lojaNome: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.text.secondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
    marginTop: spacing['3'],
  },
  estoqueBadge: {
    backgroundColor: lightColors.accent.successBg,
    borderRadius: radii.badge,
    paddingHorizontal: spacing['3'],
    paddingVertical: spacing['1'],
  },
  estoqueBadgeLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    color: lightColors.accent.successFg,
  },
  section: {
    marginTop: spacing['5'],
  },
  sectionTitle: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.text.primary,
    marginBottom: spacing['1'],
  },
  descricao: {
    fontFamily: 'HankenGrotesk-Regular',
    fontSize: typography.sizes.md.fontSize,
    lineHeight: typography.sizes.md.lineHeight * 1.3,
    color: lightColors.text.secondary,
  },
  quantidadeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing['5'],
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: lightColors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonLabel: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  stepperValue: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
    minWidth: 20,
    textAlign: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: lightColors.accent.brand,
    borderRadius: radii.sm,
    paddingHorizontal: spacing['5'],
    height: 56,
    marginTop: spacing['6'],
  },
  addButtonLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
  addButtonPreco: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.lg.fontSize,
    color: lightColors.text.primary,
  },
});
