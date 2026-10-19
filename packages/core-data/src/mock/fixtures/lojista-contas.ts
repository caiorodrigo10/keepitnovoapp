import type { EstabelecimentoHorario, EstabelecimentoStatus } from '../../ports/store.port';

/**
 * Mesmo shape mock-only de `MockDb['lojistaContas']`/
 * `MockDb['estabelecimentosCadastrados']` (`mock/db.ts`) — tipado
 * localmente (em vez de `import type { MockDb } from '../db'`) para não
 * introduzir um ciclo de import com `db.ts` (que importa este arquivo via
 * `./fixtures`, o barrel). `mock/db.ts` é a fonte de verdade do shape; este
 * tipo replica-o 1:1 e é conferido por `structuredClone(...)` na atribuição
 * de `createMockDb()`.
 */
interface LojistaContaFixture {
  id: string;
  email: string;
  criado_em: string;
  nome_fantasia: string;
  cnpj: string;
  telefone: string;
  responsavel_nome: string;
}

interface EstabelecimentoCadastradoFixture {
  id: string;
  donoUserId: string;
  cnpj: string;
  status: EstabelecimentoStatus;
  motivoRejeicao: string | null;
  nomeFantasia: string;
  categoria: string;
  descricao: string | null;
  fotoFachadaUrl: string | null;
  horarios: EstabelecimentoHorario[];
}

/**
 * Story 10.3 (Gap 1, 🔴 bloqueador) — semeia a credencial de demo do app
 * Lojista, destravando o gate de login em modo mock.
 *
 * Diagnóstico completo em `docs/orchestration/MODO-DEMO-LOJISTA-DESIGN.md`:
 * `db.lojistaContas`/`db.estabelecimentosCadastrados` nasciam `[]`
 * (`createMockDb()`), então nenhum e-mail resolvia em
 * `lojista-auth.mock.ts#signIn`, e `Login.tsx` nunca alcançava
 * `getMeuEstabelecimento() → status === 'ativo'` (único ramo que chama
 * `signInLojista()` e libera `MainTabs`). As telas de `MainTabs` já leem um
 * `CURRENT_ESTABELECIMENTO_ID = 'estab-farmacia-vida'` fixo, de
 * `db.estabelecimentos` (domínio de Descoberta, `StorePort`), rico e ativo
 * (21 pedidos, produtos, extrato) — este arquivo só semeia o array PARALELO
 * do wizard/login (`EstabelecimentoCadastroPort`), sem tocar
 * `fixtures/estabelecimentos.ts`.
 *
 * **Credencial de demo:** `lojista@keepit.com.br` + qualquer senha (o mock
 * nunca valida senha — mesmo padrão de `clientesCredenciaisFixture`/
 * `admin@keepit.com.br`, Story 10.1).
 *
 * Invariantes exigidas por `estabelecimento-cadastro.mock.ts#getMeuEstabelecimento`
 * (AC5 da story, conferidas abaixo por comentário — qualquer alteração
 * futura em um dos dois objetos deve preservar as três):
 * - `lojistaContasFixture[0].id === estabelecimentosCadastradosFixture[0].donoUserId`
 *   (senão o gate devolve `null`/retomada de wizard, nunca `'ativo'`).
 * - `estabelecimentosCadastradosFixture[0].status === 'ativo'` e
 *   `motivoRejeicao === null`.
 * - `estabelecimentosCadastradosFixture[0].id === 'estab-farmacia-vida'` —
 *   mesmo `id` do domínio de Descoberta rico (`db.estabelecimentos`), para
 *   que eventuais leituras futuras via `getMeuEstabelecimentoId()` batam no
 *   dataset rico em vez de um id órfão.
 * - CNPJ idêntico entre os dois objetos, `11.222.333/0001-81` — válido pelo
 *   algoritmo de `apps/lojista/src/lib/cnpj.ts#isCnpjValido` (conferido em
 *   `apps/lojista/src/lib/cnpj.test.ts`). **Atenção:** não confundir com
 *   `11.222.333/0001-44`, usado como placeholder em
 *   `estabelecimento-cadastro.mock.test.ts#baseInput()` — esse valor NÃO é
 *   um CNPJ válido pelo algoritmo (dígito verificador incorreto).
 */
const CNPJ_DEMO = '11.222.333/0001-81';

/**
 * Horário "sempre aberta" (00:00–23:59, 7 dias) — mesmo padrão de
 * `horarioAmplo()` em `fixtures/estabelecimentos.ts` (não exportado de lá;
 * replicado aqui localmente para não acoplar os dois domínios). Coerência
 * de apresentação com o resto do dataset de demo, que já é majoritariamente
 * "Aberta" (Modo Demo, `docs/architecture/09-modo-demo-mock.md` §3.2).
 */
function horarioAmploCadastro(): EstabelecimentoHorario[] {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    aberto: true,
    hora_abre: '00:00',
    hora_fecha: '23:59',
  }));
}

export const lojistaContasFixture: LojistaContaFixture[] = [
  {
    id: 'lojista-demo-farmacia-vida',
    email: 'lojista@keepit.com.br',
    criado_em: '2026-06-01T12:00:00.000Z',
    nome_fantasia: 'Farmácia Vida',
    cnpj: CNPJ_DEMO,
    telefone: '(11) 91234-5678',
    responsavel_nome: 'Marcos Andrade',
  },
];

export const estabelecimentosCadastradosFixture: EstabelecimentoCadastradoFixture[] = [
  {
    id: 'estab-farmacia-vida',
    donoUserId: 'lojista-demo-farmacia-vida',
    cnpj: CNPJ_DEMO,
    status: 'ativo',
    motivoRejeicao: null,
    nomeFantasia: 'Farmácia Vida',
    categoria: 'farmacia',
    descricao: 'Farmácia de bairro com entrega rápida via Hub Keepit.',
    fotoFachadaUrl: null,
    horarios: horarioAmploCadastro(),
  },
];
