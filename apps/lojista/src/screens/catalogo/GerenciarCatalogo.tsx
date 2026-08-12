import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { darkColors, radii, spacing, typography } from '@keepit/ui-tokens';

import { PrimaryButton } from '../../components/PrimaryButton';
import { ProductCard } from '../../components/ProductCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import type { CatalogoStackParamList } from '../../navigation/types';
import { useProductCatalog } from './ProductCatalogContext';

type Props = NativeStackScreenProps<CatalogoStackParamList, 'GerenciarCatalogo'>;

type FiltroTab = 'todos' | 'ativos' | 'pausados';

/**
 * Gerenciar catálogo — Story 0.9 (Task 1). Fiel a
 * `docs/design-refs/lojista-07-catalogo.png` (painel P7).
 *
 * [AUTO-DECISION] Sem seta de "voltar" no header: esta é a rota inicial
 * (root) da `CatalogoStack` dentro da tab "Catálogo" — não há destino de
 * retorno. Mesmo padrão já usado em `Configuracoes.tsx` (root da
 * `PerfilStack`, Story 0.8), que também omite a seta apesar do protótipo
 * mostrar uma no painel correspondente.
 */
export default function GerenciarCatalogo({ navigation }: Props) {
  const { produtos, loading, error, toggleAtivo, reload } = useProductCatalog();
  const [busca, setBusca] = useState('');
  const [tab, setTab] = useState<FiltroTab>('todos');

  /**
   * Story 4.6 (AC1, AC4) — `toggleAtivo` (pausar/reativar) já persiste de
   * verdade via `ProductPort.update`/`pause` (Story 1.10/4.6); esta tela
   * apenas garantia a chamada, sem tratar falha (rede/RLS). O `ToggleSwitch`
   * é 100% controlado por `produto.ativo` — em caso de erro, o card
   * simplesmente não reflete a mudança (nenhum sucesso fictício), mas o
   * erro precisa ser honesto na UI em vez de virar uma rejeição não tratada.
   */
  function handleToggleAtivo(produtoId: string, nextAtivo: boolean) {
    toggleAtivo(produtoId, nextAtivo).catch(() => {
      Alert.alert(
        'Não foi possível atualizar',
        nextAtivo ? 'Não foi possível reativar o produto agora. Tente novamente.' : 'Não foi possível pausar o produto agora. Tente novamente.',
      );
    });
  }

  const ativos = useMemo(() => produtos.filter((produto) => produto.ativo), [produtos]);
  const pausados = useMemo(() => produtos.filter((produto) => !produto.ativo), [produtos]);

  const listaBase = tab === 'ativos' ? ativos : tab === 'pausados' ? pausados : produtos;
  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return listaBase;
    return listaBase.filter((produto) => produto.nome.toLowerCase().includes(termo));
  }, [listaBase, busca]);

  const tabs: Array<{ key: FiltroTab; label: string }> = [
    { key: 'todos', label: `Todos · ${produtos.length}` },
    { key: 'ativos', label: 'Ativos' },
    { key: 'pausados', label: 'Pausados' },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: darkColors.bg.primary }]}>
      <View style={styles.header}>
        <ScreenHeader
          title="Catálogo"
          rightSlot={
            <Pressable
              onPress={() => navigation.navigate('CadastrarProduto')}
              style={[styles.novoButton, { backgroundColor: darkColors.accent.brand }]}
            >
              <Text style={[styles.novoLabel, { color: darkColors.bg.primary }]}>+ Novo</Text>
            </Pressable>
          }
        />

        <TextInput
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar produto"
          placeholderTextColor={darkColors.text.placeholder}
          style={[styles.search, { backgroundColor: darkColors.bg.surface, color: darkColors.text.primary }]}
        />

        <View style={styles.tabs}>
          {tabs.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              style={[
                styles.tab,
                { backgroundColor: tab === item.key ? darkColors.accent.brand : darkColors.bg.surface },
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: tab === item.key ? darkColors.bg.primary : darkColors.text.secondary },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={darkColors.accent.brand} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>
            Não foi possível carregar seu catálogo agora.
          </Text>
          <PrimaryButton label="Tentar novamente" onPress={reload} />
        </View>
      ) : produtos.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>
            Nenhum produto cadastrado ainda.
          </Text>
          <PrimaryButton label="Novo produto" onPress={() => navigation.navigate('CadastrarProduto')} />
        </View>
      ) : listaFiltrada.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: darkColors.text.secondary }]}>Nenhum produto encontrado.</Text>
        </View>
      ) : (
        <FlatList
          data={listaFiltrada}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: darkColors.border.default }]} />
          )}
          renderItem={({ item }) => (
            <ProductCard
              produto={item}
              onPress={() => navigation.navigate('EditarProduto', { produtoId: item.id })}
              onToggleAtivo={(nextAtivo) => handleToggleAtivo(item.id, nextAtivo)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    gap: spacing[4],
  },
  novoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
  },
  novoLabel: {
    fontFamily: 'HankenGrotesk-Bold',
    fontSize: typography.sizes.base.fontSize,
  },
  search: {
    height: 48,
    borderRadius: radii.sm,
    paddingHorizontal: spacing[4],
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
  },
  tabs: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  tab: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
  },
  tabLabel: {
    fontFamily: 'HankenGrotesk-SemiBold',
    fontSize: typography.sizes.base.fontSize,
  },
  listContent: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[8],
  },
  separator: {
    height: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
    paddingHorizontal: spacing[6],
  },
  emptyText: {
    fontFamily: 'HankenGrotesk-Medium',
    fontSize: typography.sizes.md.fontSize,
    textAlign: 'center',
  },
});
