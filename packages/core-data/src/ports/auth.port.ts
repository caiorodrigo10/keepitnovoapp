import type { AsyncCallOptions } from '../types';

/**
 * Domínio: tabela `clientes` (espelha `auth.users`).
 * [Source: docs/architecture/03-data-models.md#1.1 clientes]
 */
export interface Cliente {
  id: string;
  nome: string;
  telefone: string;
  telefone_confirmado: boolean;
  /** Nullable — só preenchido após o 1º checkout. */
  cpf: string | null;
  bloqueado: boolean;
  motivo_bloqueio: string | null;
  criado_em: string;
}

/**
 * Domínio: tabela `clientes_confirmacao_telefone`.
 * [Source: docs/architecture/03-data-models.md#1.2]
 */
export interface ClienteConfirmacaoTelefone {
  id: string;
  cliente_id: string;
  telefone: string;
  tentativas: number;
  /** Expira 10 min após a criação (`config.timeoutAceiteMin` NÃO se aplica aqui — este é um timeout próprio de SMS). */
  expira_em: string;
  consumido_em: string | null;
}

export interface SignUpInput {
  nome: string;
  telefone: string;
}

/**
 * Port de autenticação/perfil do Cliente.
 *
 * Fluxo do MVP: "Login/Criar conta apenas navega" (Story 0.1) — o mock aqui
 * cria a fundação para a Story 0.4+ conectar telas reais, mas o `signIn`
 * mock não valida senha (não há senha no MVP — é telefone + confirmação SMS).
 */
export interface AuthPort {
  signUp(input: SignUpInput, options?: AsyncCallOptions): Promise<Cliente>;
  signIn(telefone: string, options?: AsyncCallOptions): Promise<Cliente>;
  /** Retorna o cliente autenticado na sessão mock atual, ou `null` se não houver sessão. */
  currentUser(options?: AsyncCallOptions): Promise<Cliente | null>;
  signOut(options?: AsyncCallOptions): Promise<void>;
  /** Simula confirmação de SMS — no mock, qualquer código de 4 dígitos é aceito. */
  confirmPhone(clienteId: string, codigo: string, options?: AsyncCallOptions): Promise<ClienteConfirmacaoTelefone>;
  /**
   * Resolve `Cliente` por id — Story 1.10 (Task 3), promovido de
   * `CLIENTE_NOME_POR_ID`/`nomeClienteDisplay` (hard-coded em
   * `apps/lojista/src/screens/pedidos/lojistaOrders.mock.ts`, Story 0.10).
   * Usado pelo Lojista para exibir nome/telefone do cliente num pedido.
   *
   * O gap 10.4 (modelo de auth do Cliente — telefone/SMS vs. e-mail/senha)
   * NÃO é resolvido aqui: `Cliente` continua modelando apenas `nome` +
   * `telefone`, sem e-mail/senha, até decisão do stakeholder.
   * [Source: docs/PERGUNTAS_REGRAS_NEGOCIO.md, seção 10]
   */
  getById(clienteId: string, options?: AsyncCallOptions): Promise<Cliente | null>;
  /** Coleta de CPF no 1º checkout (Story 0.6) — grava `clientes.cpf`. */
  updateCpf(clienteId: string, cpf: string, options?: AsyncCallOptions): Promise<Cliente>;
}
