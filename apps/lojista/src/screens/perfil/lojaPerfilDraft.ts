/**
 * Estado local do "perfil da loja logada" — Story 0.8 (Tasks 9/10).
 *
 * Mesma filosofia de recorte provisório do `cadastroDraft.ts` (AuthStack):
 * sem `packages/core-data` real conectado a `apps/lojista` neste ambiente
 * (dependência não declarada em `apps/lojista/package.json`/`node_modules` —
 * ver Dev Agent Record). Estado local em memória, compartilhado entre
 * `Configuracoes` e `PerfilPublico` via `LojaPerfilContext` para que
 * "Salvar" no perfil público reflita no card-resumo de Configurações.
 *
 * Valores iniciais espelham o exemplo do protótipo
 * (`docs/design-refs/lojista-11-configuracoes.png`, painel P11 — "Farmácia
 * Vida · Farmácia · Hub Centro"), reaproveitando o nome/categoria já usados
 * em `packages/core-data/src/mock/fixtures/estabelecimentos.ts`
 * (`estab-farmacia-vida`).
 */
export interface LojaPerfilDraft {
  nome_fantasia: string;
  categoria: string;
  hubNome: string;
  descricao: string;
  logoLocalUri: string | null;
  foto_fachada_url: string | null;
}

export function createInitialLojaPerfilDraft(): LojaPerfilDraft {
  return {
    nome_fantasia: 'Farmácia Vida',
    categoria: 'Farmácia',
    hubNome: 'Hub Centro',
    descricao: 'Farmácia de bairro com entrega rápida via Hub Centro.',
    logoLocalUri: null,
    foto_fachada_url: null,
  };
}

/** Equipe é UI-only nesta story — sem CRUD real (Task 10). Estático, fiel ao painel P11. */
export interface MembroEquipe {
  id: string;
  nome: string;
  contato: string;
  papel: 'admin' | 'equipe';
}

export const EQUIPE_FIXTURE: MembroEquipe[] = [
  { id: 'membro-ana', nome: 'Ana Martins', contato: 'ana@farmaciavida.com', papel: 'admin' },
  { id: 'membro-joao', nome: 'João Pereira', contato: 'Operador de balcão', papel: 'equipe' },
];
