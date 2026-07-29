import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Param lists tipados da navegação do App Cliente — Épico 0, Story 0.3.
 *
 * Todas as rotas desta story são stubs (sem conteúdo real), por isso os
 * params ficam `undefined` por enquanto. Params reais (ex.: `produtoId` em
 * `DetalheProduto`) serão adicionados pelas Stories 0.4–0.7 quando o
 * conteúdo/lógica de cada tela for implementado.
 */

export type AuthStackParamList = {
  Onboarding1: undefined;
  Onboarding2: undefined;
  Onboarding3: undefined;
  CriarConta: undefined;
  ConfirmacaoSMS: undefined;
  Login: undefined;
  EsqueciSenha: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  /** `hubId` adicionado pela Story 0.5 (Task 2) — antes rota sem params (stub da 0.3). */
  Hub: { hubId: string };
  /** `estabelecimentoId` adicionado pela Story 0.5 (Task 3). */
  Loja: { estabelecimentoId: string };
  /** `produtoId` adicionado pela Story 0.5 (Task 4). */
  DetalheProduto: { produtoId: string };
  /** `query`/`categoria` opcionais (deep-link a partir de categoria da Home) — Story 0.5 (Task 5). */
  BuscaProduto: { query?: string; categoria?: string } | undefined;
  /** `query`/`categoria` opcionais — Story 0.5 (Task 6). */
  BuscaLoja: { query?: string; categoria?: string } | undefined;
  Carrinho: undefined;
  Checkout: undefined;
  EscolhaRetirada: undefined;
  Pagamento: undefined;
  AdicionarCartao: undefined;
};

/**
 * `ConfirmarRetiradaPin` (inventário da Story 0.7) NÃO é uma rota desta
 * stack — foi mapeada para o modal raiz `ModalConfirmarPin` (ver
 * RootStackParamList) para evitar rota duplicada. Ver Dev Notes da Story
 * 0.3 ("Modal PIN — distinção Cliente x Lojista").
 *
 * Params `pedidoId` adicionados pela Story 0.7 (Task 2-7) — cada tela desta
 * story precisa saber a qual pedido se refere. Onde `pedidoId` é opcional
 * (`ChegueiAoHub`/`Recibo`), a tela cai de volta ao pedido "em andamento"
 * mais recente do cliente (fixture única disponível no mock — ver
 * `usePedidosMine`), mesmo padrão de fallback já usado em `Checkout`
 * (Story 0.6, `DEFAULT_HUB_ID`).
 */
export type PedidosStackParamList = {
  MeusPedidos: undefined;
  ChegueiAoHub: { pedidoId?: string } | undefined;
  Recibo: { pedidoId?: string } | undefined;
  CancelarPedido: { pedidoId?: string } | undefined;
  LojistaNaoVeio: { pedidoId?: string } | undefined;
};

export type PerfilStackParamList = {
  Perfil: undefined;
  Configuracoes: undefined;
  ExcluirConta: undefined;
};

export type MainTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  PedidosTab: NavigatorScreenParams<PedidosStackParamList>;
  PerfilTab: NavigatorScreenParams<PerfilStackParamList>;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  /**
   * `onSubmit` adicionado pela Story 0.6 (Task 4) — callback opcional
   * chamado após o cliente confirmar o CPF, permitindo à tela de origem
   * (Checkout) continuar o fluxo (`navigation.navigate('Pagamento')`) sem
   * acoplar `ModalCPF` a uma rota de destino fixa. Não é serializável
   * (função em `params`) — aceitável no Épico 0 (sem deep link/state
   * persistence para esta rota).
   */
  ModalCPF: { onSubmit?: () => void } | undefined;
  /**
   * `pedidoId` adicionado pela Story 0.7 (Task 2) — "Seu pedido" (AC1),
   * tela que exibe o PIN de 4 dígitos + timeline de status. Opcional: sem
   * `pedidoId`, a tela usa o pedido "em andamento" mais recente do cliente
   * (mesmo fallback de `PedidosStackParamList`).
   */
  ModalConfirmarPin: { pedidoId?: string } | undefined;
  ModalPermissaoPush: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
