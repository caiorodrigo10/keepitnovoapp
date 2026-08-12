import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, spacing, typography } from '@keepit/ui-tokens';

import { FloatingCartButton } from '../../components/checkout';
import {
  AsyncStateBlock,
  CategoryChips,
  DevStateToggle,
  ProductRow,
  SearchBar,
  StoreCard,
  toAsyncCallOptions,
  type DevSimState,
} from '../../components/discovery';
import { Button, Screen } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useSearchLojas } from '../../hooks/useSearchLojas';
import { useSearchProdutos } from '../../hooks/useSearchProdutos';
import { CATEGORIAS_BUSCA } from '../../lib/discoveryDisplay';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'BuscaProduto'>;

/**
 * Busca por produto (Task 5, AC1-AC4). Fiel a `cliente-11-busca.png`:
 * campo de busca + tabs de categoria + seção "LOJAS" + seção "PRODUTOS" (o
 * protótipo mostra ambas na mesma tela de busca — mantido aqui; `BuscaLoja`
 * cobre a variante focada só em lojas, acessível via "Ver todas" da Home).
 *
 * **Story 5.7 (AC2/AC4)**: ordem das seções corrigida para "LOJAS" antes de
 * "PRODUTOS" (antes era o inverso) — o épico pede cards de loja acima de
 * produto quando o termo bate em ambos.
 *
 * **Story 6.1 (AC1):** `<FloatingCartButton>` adicionado como irmão de
 * `<Screen>` (só no ramo normal — não aparece no guard "escolha um hub").
 */
export default function BuscaProduto({ route, navigation }: Props) {
  const cart = useCart();
  const [devState, setDevState] = useState<DevSimState>('normal');
  const options = toAsyncCallOptions(devState);

  const [query, setQuery] = useState(route.params?.query ?? '');
  const [categoria, setCategoria] = useState(route.params?.categoria ?? 'todos');

  // Story 5.6 (AC5) — busca escopada ao hub REAL do carrinho
  // (`CartContext.hubId`), não mais a um `DEFAULT_HUB_ID` hard-coded.
  // Decisão COMPARTILHADA com a Story 5.7 (mesma correção, ver
  // `BuscaLoja.tsx`) — não duplicar a revisão.
  const hubId = cart.hubId;

  const {
    data: produtos,
    loading: loadingProdutos,
    error: errorProdutos,
  } = useSearchProdutos(hubId ?? '', query, categoria, options);
  const {
    data: lojas,
    loading: loadingLojas,
    error: errorLojas,
  } = useSearchLojas(hubId ?? '', query, categoria, options);

  // [AUTO-DECISION @dev] Guard de hub ausente (AC5) → mensagem clara +
  // CTA "Escolher hub" (navega para `EscolhaRetirada`, que já faz
  // `navigation.goBack()` ao confirmar, mesmo padrão usado por
  // `Checkout.tsx`), em vez de redirecionar automaticamente sem avisar.
  // Reason: a Story deixa a escolha entre "redirecionar" e "desabilitar com
  // mensagem" a critério do @dev; um redirect silencioso esconderia do
  // cliente por que ele saiu da tela de busca sem pedir — a mensagem +
  // botão é mais honesta e reaproveita 100% de componentes já existentes
  // (`AsyncStateBlock`, `Button`), sem criar componente novo.
  if (hubId === null) {
    return (
      <Screen>
        <View style={styles.searchRow}>
          <View style={styles.searchInput} />
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.cancelar}>Cancelar</Text>
          </Pressable>
        </View>

        <AsyncStateBlock kind="empty" emptyLabel="Escolha um hub para buscar produtos e lojas perto de você." />

        <View style={styles.guardButton}>
          <Button title="Escolher hub" onPress={() => navigation.navigate('EscolhaRetirada')} />
        </View>
      </Screen>
    );
  }

  const loading = loadingProdutos || loadingLojas;
  const error = errorProdutos ?? errorLojas;
  const semResultados = !loading && !error && produtos.length === 0 && lojas.length === 0;

  return (
    <View style={styles.flexOne}>
      <Screen>
        <View style={styles.searchRow}>
          <View style={styles.searchInput}>
            <SearchBar value={query} onChangeText={setQuery} placeholder="Buscar produto" autoFocus />
          </View>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.cancelar}>Cancelar</Text>
          </Pressable>
        </View>

        <DevStateToggle value={devState} onChange={setDevState} />

        <CategoryChips categorias={CATEGORIAS_BUSCA} selected={categoria} onSelect={setCategoria} />

        {error ? (
          <AsyncStateBlock kind="error" errorLabel="Não foi possível buscar agora. Tente novamente." />
        ) : loading ? (
          <AsyncStateBlock kind="loading" />
        ) : semResultados ? (
          <AsyncStateBlock kind="empty" emptyLabel={`Nenhum resultado para "${query}".`} />
        ) : (
          <>
            {lojas.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>LOJAS</Text>
                {lojas.map((loja) => (
                  <StoreCard
                    key={loja.id}
                    loja={loja}
                    onPress={() => navigation.navigate('Loja', { estabelecimentoId: loja.id })}
                  />
                ))}
              </View>
            )}

            {produtos.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>PRODUTOS</Text>
                {produtos.map(({ produto, loja }) => (
                  <ProductRow
                    key={produto.id}
                    produto={produto}
                    subtitulo={loja.nome_fantasia}
                    onPress={() => navigation.navigate('DetalheProduto', { produtoId: produto.id })}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </Screen>
      <FloatingCartButton onPress={() => navigation.navigate('Carrinho')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['3'],
    marginBottom: spacing['3'],
  },
  searchInput: {
    flex: 1,
  },
  cancelar: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.md.fontSize,
    color: lightColors.accent.successFg,
  },
  guardButton: {
    marginTop: spacing['4'],
  },
  section: {
    marginTop: spacing['5'],
  },
  sectionTitle: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.sm.fontSize,
    letterSpacing: typography.letterSpacing.section,
    color: lightColors.text.tertiary,
    marginBottom: spacing['2'],
  },
});
