import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { CatalogoStackParamList } from './types';
import GerenciarCatalogo from '../screens/catalogo/GerenciarCatalogo';
import CadastrarProduto from '../screens/catalogo/CadastrarProduto';
import EditarProduto from '../screens/catalogo/EditarProduto';
import HorariosDisponibilidade from '../screens/catalogo/HorariosDisponibilidade';
import { LojaDisponibilidadeProvider } from '../screens/catalogo/LojaDisponibilidadeContext';
import { ProductCatalogProvider } from '../screens/catalogo/ProductCatalogContext';

const Stack = createNativeStackNavigator<CatalogoStackParamList>();

/**
 * Stack aninhada da tab "Catálogo" — Épico 0, Story 0.3 (AC1, AC3).
 * Inventário de telas alinhado à Story 0.9.
 *
 * Story 0.9 substitui os stubs por conteúdo real e envolve o navigator com
 * `ProductCatalogProvider`/`LojaDisponibilidadeProvider` para compartilhar o
 * estado do catálogo e da disponibilidade da loja entre as 4 telas, mesmo
 * padrão de `PerfilStack`/`LojaPerfilProvider` (Story 0.8).
 */
export function CatalogoStack() {
  return (
    <ProductCatalogProvider>
      <LojaDisponibilidadeProvider>
        <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="GerenciarCatalogo">
          <Stack.Screen name="GerenciarCatalogo" component={GerenciarCatalogo} />
          <Stack.Screen name="CadastrarProduto" component={CadastrarProduto} />
          <Stack.Screen name="EditarProduto" component={EditarProduto} />
          <Stack.Screen name="HorariosDisponibilidade" component={HorariosDisponibilidade} />
        </Stack.Navigator>
      </LojaDisponibilidadeProvider>
    </ProductCatalogProvider>
  );
}
