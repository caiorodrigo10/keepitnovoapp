import type { ChavePixTipoCadastro } from '../../ports/estabelecimento-cadastro.port';

/**
 * Extensão mock-only dos campos administrativos de `estabelecimentos`
 * (Story 3.7, AC2/AC3) — `cnpj`/`telefone`/`responsavel_nome`/`chave_pix`/
 * `chave_pix_tipo`/`dados_receita`/`criado_em`/`aprovado_em`/`aprovado_por`.
 *
 * [IDS] CREATE, [AUTO-DECISION]. Índice paralelo keyed por `id`, NÃO campos
 * adicionados direto em `estabelecimentosFixture`/`Estabelecimento`
 * (`./estabelecimentos.ts`) → (reason: `Estabelecimento` é o tipo de
 * domínio da Descoberta, consumido também pelo Cliente — misturar dados
 * administrativos nas fixtures base replicaria no mock exatamente o
 * vazamento que `EstabelecimentoAdmin` (`ports/admin.port.ts`) foi desenhado
 * para evitar no contrato real. Mesmo padrão já usado por
 * `db.estabelecimentosCadastrados` (Story 3.5, ver JSDoc em `mock/db.ts`) —
 * um índice paralelo mock-only, não uma mutação do tipo base.
 *
 * Cobre TODAS as fixtures de `estabelecimentosFixture` (não só as
 * `em_analise`) para que `pendingStoreDetail` nunca quebre com "dados
 * administrativos ausentes" ao ser chamado para qualquer id existente, hoje
 * ou em Stories futuras (ex.: `/lojistas/[id]`).
 *
 * Valores de exibição (CNPJ/telefone/responsável/data de cadastro) são
 * dados de fixture plausíveis — mesma categoria de "dado inventado para dar
 * vida ao mock" já usada em `estabelecimentosFixture` (endereço, foto,
 * descrição), não uma regra de negócio. `dados_receita: null` e
 * `aprovado_em`/`aprovado_por: null` para os 3 pendentes refletem
 * honestamente o estado real do piloto (nunca inventados como presentes).
 */
export interface EstabelecimentoAdminExtra {
  cnpj: string;
  telefone: string;
  responsavel_nome: string;
  chave_pix: string;
  chave_pix_tipo: ChavePixTipoCadastro;
  dados_receita: Record<string, unknown> | null;
  criado_em: string;
  aprovado_em: string | null;
  aprovado_por: string | null;
}

export const estabelecimentosAdminExtraFixture: Record<string, EstabelecimentoAdminExtra> = {
  'estab-farmacia-vida': {
    cnpj: '11.222.333/0001-81',
    telefone: '(11) 91234-5678',
    responsavel_nome: 'Ana Ribeiro',
    chave_pix: 'financeiro@farmaciavida.com.br',
    chave_pix_tipo: 'email',
    dados_receita: null,
    criado_em: '2026-06-10T13:00:00.000Z',
    aprovado_em: '2026-06-11T09:00:00.000Z',
    aprovado_por: 'admin-keepit',
  },
  'estab-bem-vestir': {
    cnpj: '22.333.444/0001-92',
    telefone: '(11) 92345-6789',
    responsavel_nome: 'Bruno Costa',
    chave_pix: '22.333.444/0001-92',
    chave_pix_tipo: 'cnpj',
    dados_receita: null,
    criado_em: '2026-06-15T13:00:00.000Z',
    aprovado_em: '2026-06-16T09:00:00.000Z',
    aprovado_por: 'admin-keepit',
  },
  'estab-conveniencia-24h': {
    cnpj: '33.444.555/0001-03',
    telefone: '(11) 93456-7890',
    responsavel_nome: 'Carla Nunes',
    chave_pix: '(11) 93456-7890',
    chave_pix_tipo: 'telefone',
    dados_receita: null,
    criado_em: '2026-06-20T13:00:00.000Z',
    aprovado_em: '2026-06-21T09:00:00.000Z',
    aprovado_por: 'admin-keepit',
  },
  'estab-mercadinho-noturno': {
    cnpj: '44.555.666/0001-14',
    telefone: '(11) 94567-8901',
    responsavel_nome: 'Diego Alves',
    chave_pix: 'diego.alves@mercadinho.com.br',
    chave_pix_tipo: 'email',
    dados_receita: null,
    criado_em: '2026-06-25T13:00:00.000Z',
    aprovado_em: '2026-06-26T09:00:00.000Z',
    aprovado_por: 'admin-keepit',
  },
  'estab-em-analise': {
    cnpj: '55.666.777/0001-25',
    telefone: '(11) 95678-9012',
    responsavel_nome: 'Elaine Souza',
    chave_pix: '55.666.777/0001-25',
    chave_pix_tipo: 'cnpj',
    // Sempre `null` no piloto (Story 3.3 é SIMPLE) — nunca inventar.
    dados_receita: null,
    criado_em: '2026-08-10T09:30:00.000Z',
    aprovado_em: null,
    aprovado_por: null,
  },
  'estab-mercado-do-bairro': {
    cnpj: '66.777.888/0001-36',
    telefone: '(11) 96789-0123',
    responsavel_nome: 'Fábio Lima',
    chave_pix: 'fabio.lima@mercadobairro.com.br',
    chave_pix_tipo: 'email',
    dados_receita: null,
    criado_em: '2026-08-11T11:15:00.000Z',
    aprovado_em: null,
    aprovado_por: null,
  },
  'estab-pet-shop-amigo': {
    cnpj: '77.888.999/0001-47',
    telefone: '(11) 97890-1234',
    responsavel_nome: 'Gabriela Martins',
    chave_pix: '(11) 97890-1234',
    chave_pix_tipo: 'telefone',
    dados_receita: null,
    criado_em: '2026-08-12T08:45:00.000Z',
    aprovado_em: null,
    aprovado_por: null,
  },
};
