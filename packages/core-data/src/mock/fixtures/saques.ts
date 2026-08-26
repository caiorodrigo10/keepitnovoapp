import type { Saque } from '../../ports/wallet.port';

/**
 * Modo Demo (`docs/architecture/09-modo-demo-mock.md` §3.3/§3.4) — `db.saques`
 * nascia vazio (`createMockDb`, `mock/db.ts`), então "Extrato" do Lojista
 * (`apps/lojista/src/screens/financeiro/ExtratoFinanceiro.tsx`) e a fila
 * "Saques" do Admin (`admin.mock.ts#payoutQueue`, que filtra
 * `status === 'solicitado'`) abriam sem nenhum lançamento no demo.
 *
 * [IDS] CREATE — `[IDS] REUSE` do MESMO tipo `Saque` já usado por
 * `wallet.mock.ts#requestWithdrawal` (nenhuma fixture de saques existia
 * antes; este arquivo só semeia o "banco", não muda a lógica de
 * `computeCarteira`). Valores escolhidos para manter
 * `saldo_disponivel_reais` positivo em `estab-farmacia-vida` mesmo após
 * subtrair os 2 saques abaixo (histórico de pedidos `entregue` >7 dias já
 * soma bem mais que isso — ver Dev Notes da fixture de `pedidos.ts`).
 */
export const saquesFixture: Saque[] = [
  {
    id: 'saque-demo-1',
    estabelecimento_id: 'estab-farmacia-vida',
    valor_reais: 220,
    status: 'solicitado',
    solicitado_em: '2026-08-11T14:00:00.000Z',
    processado_em: null,
    concluido_em: null,
  },
  {
    id: 'saque-demo-2',
    estabelecimento_id: 'estab-farmacia-vida',
    valor_reais: 200,
    status: 'concluido',
    solicitado_em: '2026-07-20T09:00:00.000Z',
    processado_em: '2026-07-20T15:00:00.000Z',
    concluido_em: '2026-07-21T10:00:00.000Z',
  },
];
