/**
 * Loja "logada" mock desta sessão — Story 0.9.
 *
 * Sem autenticação real conectada ainda (`navigation/authGuard.ts` é um
 * guard estático, Story 0.3/0.8) — o app assume sempre a mesma loja fixture
 * de `packages/core-data` (Farmácia Vida) como a loja do lojista logado,
 * mesma decisão já usada por `screens/perfil/lojaPerfilDraft.ts` (Story 0.8).
 */
export const CURRENT_ESTABELECIMENTO_ID = 'estab-farmacia-vida';

/**
 * Hub "logado" mock desta sessão — Story 1.10 (Task 1), promovido de
 * `CURRENT_HUB` (`apps/lojista/src/screens/pedidos/lojistaOrders.mock.ts`,
 * Story 0.10). Mesmo id real de `packages/core-data` (`hubsFixture`).
 */
export const CURRENT_HUB_ID = 'hub-centro';

/**
 * Regra de negócio já decidida (Rodada 2/5, ver
 * `docs/PERGUNTAS_REGRAS_NEGOCIO.md` linha 357): farmácia não pode vender
 * medicamento tarjado no MVP. Nesta story é só rótulo/aviso visual — sem
 * bloqueio real de submissão (ver Dev Notes/Task 7 da story).
 */
export const FARMACIA_TARJADO_AVISO =
  'Proibido vender medicamento tarjado no MVP — apenas OTC, cosméticos, higiene e perfumaria (regra em Termos de Uso).';
