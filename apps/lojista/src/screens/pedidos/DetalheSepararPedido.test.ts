import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import DetalheSepararPedido from './DetalheSepararPedido';

const state = vi.hoisted(() => ({
  pedido: {
    id: 'pedido-1', numero: 42, status: 'em_preparo', cliente_id: 'cliente-1', hub_id: 'hub-1', criado_em: '2026-10-18T00:00:00.000Z',
    itens: [{
      id: 'item-1', nome_snapshot: 'Hambúrguer', quantidade: 1, separado: false,
      complementos_snapshot: [
        { grupoId: 'tamanho', grupoNome: 'Tamanho', itemId: 'grande', itemNome: 'Grande', precoExtraCentavos: 400 },
        { grupoId: 'adicionais', grupoNome: 'Adicionais', itemId: 'bacon', itemNome: 'Bacon', precoExtraCentavos: 500 },
      ],
    }],
  },
}));

vi.mock('react-native', () => ({
  StyleSheet: { create: (value: unknown) => value }, Text: 'span', View: 'div', Pressable: 'button', ScrollView: ({ children }: { children: unknown }) => children,
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'div' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'i' }));
vi.mock('@keepit/ui-tokens', () => ({
  darkColors: { bg: { primary: '#000', surface: '#111', overlay: '#222', muted: '#333' }, text: { primary: '#fff', secondary: '#ccc', tertiary: '#999', faint: '#666' }, accent: { brand: '#0f0', warning: '#f00' }, border: { default: '#444' } },
  radii: { badge: 1, card: 1, xs: 1 }, spacing: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 8: 8 }, typography: { sizes: { xs: { fontSize: 1 }, base: { fontSize: 1 }, md: { fontSize: 1 }, lg: { fontSize: 1 } }, letterSpacing: { badge: 0 } },
}));
vi.mock('../../components/PrimaryButton', () => ({ PrimaryButton: 'button' }));
vi.mock('../../components/ScreenHeader', () => ({ ScreenHeader: () => null }));
vi.mock('./OrdersContext', () => ({
  useOrdersContext: () => ({ getById: () => state.pedido, nomeHub: () => 'Hub', nomeCliente: () => 'Cliente', markReadyForHub: vi.fn(), setItemSeparado: vi.fn(), solicitacoes: [] }),
}));
vi.mock('./statusMeta', () => ({ getStatusBadge: () => ({ bg: '#000', fg: '#fff', label: 'Em preparo' }), prateleiraFromId: () => 'A', tempoRelativo: () => 'agora' }));

describe('DetalheSepararPedido', () => {
  it('consome o agrupamento histórico e mostra cada grupo no texto de separação', () => {
    const html = renderToStaticMarkup(React.createElement(DetalheSepararPedido, {
      navigation: { goBack: vi.fn(), navigate: vi.fn() } as never,
      route: { params: { pedidoId: 'pedido-1' } } as never,
    }));

    expect(html).toContain('Tamanho: Grande (+R$ 4,00) · por unidade');
    expect(html).toContain('Adicionais: Bacon (+R$ 5,00) · por unidade');
  });
});
