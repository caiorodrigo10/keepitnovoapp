import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Param lists tipados da navegação do App Lojista — Épico 0, Story 0.3.
 *
 * Todas as rotas desta story são stubs (sem conteúdo real), por isso os
 * params ficam `undefined` por enquanto. Params reais (ex.: `pedidoId` em
 * `DetalheSepararPedido`) serão adicionados pelas Stories 0.8–0.11 quando o
 * conteúdo/lógica de cada tela for implementado.
 */

export type AuthStackParamList = {
  OnboardingLojista: undefined;
  CadastroPasso1: undefined;
  CadastroPasso2: undefined;
  CadastroPasso3: undefined;
  EmAnalise: undefined;
  Login: undefined;
};

/**
 * `DigitarPin` é tela cheia com teclado (não modal) — distinção deliberada
 * do `ModalConfirmarPin` do Cliente. Ver Dev Notes da Story 0.3 ("Modal PIN
 * — distinção Cliente x Lojista").
 *
 * `pedidoId` adicionado pela Story 0.10 nas rotas que operam sobre um
 * pedido específico — o stub original (Story 0.3) não tinha params reais
 * ainda para nenhuma rota desta stack.
 */
export type PedidosStackParamList = {
  NovosPedidos: undefined;
  AceitarPedido: { pedidoId: string };
  RecusarPedido: { pedidoId: string };
  DetalheSepararPedido: { pedidoId: string };
  SaindoParaHub: { pedidoId: string };
  ChegueiAoHub: { pedidoId: string };
  DigitarPin: { pedidoId: string };
  ConfirmarRetirada: { pedidoId: string };
  Concluidos: undefined;
  ClienteNaoApareceu: { pedidoId: string };
};

export type CatalogoStackParamList = {
  GerenciarCatalogo: undefined;
  CadastrarProduto: undefined;
  /**
   * `produtoId` adicionado pela Story 0.9 — o stub original (Story 0.3) não
   * tinha params reais ainda para esta rota.
   */
  EditarProduto: { produtoId: string };
  HorariosDisponibilidade: undefined;
};

/**
 * `Vendas` adicionada pela Story 0.11 (AC2) — o esqueleto da Story 0.3
 * registrou só 5 stubs sem uma rota dedicada para a tela "Vendas detalhada"
 * (ver Dev Notes/File Locations da 0.11, que já previa `Vendas.tsx`).
 */
export type FinanceiroStackParamList = {
  Dashboard: undefined;
  Vendas: undefined;
  Carteira: undefined;
  SolicitarSaque: undefined;
  ExtratoFinanceiro: undefined;
  FormasRecebimento: undefined;
};

export type PerfilStackParamList = {
  PerfilPublico: undefined;
  Configuracoes: undefined;
  ExcluirConta: undefined;
};

export type MainTabParamList = {
  PedidosTab: NavigatorScreenParams<PedidosStackParamList>;
  CatalogoTab: NavigatorScreenParams<CatalogoStackParamList>;
  FinanceiroTab: NavigatorScreenParams<FinanceiroStackParamList>;
  PerfilTab: NavigatorScreenParams<PerfilStackParamList>;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  ModalPermissaoPush: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
