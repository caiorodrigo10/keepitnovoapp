import { describe, expect, it, vi } from 'vitest';

import * as cards from './account-deletion-cards';

const { purgeAccountCards } = cards;

const input = {
  userId: '13131313-1111-4111-8111-111111111111',
  solicitacaoId: '13131313-aaaa-4111-8111-111111111111',
};

describe('purgeAccountCards', () => {
  it('only accepts the token-free proof returned by the privileged database purge', async () => {
    const rpc = vi.fn(async () => ({ data: { purged: true }, error: null }));

    await expect(purgeAccountCards(input, { rpc })).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('purgar_cartoes_conta', {
      p_user_id: input.userId,
      p_solicitacao_id: input.solicitacaoId,
    });
  });

  it('never lets completion proceed when the purge cannot prove token absence', async () => {
    const rpc = vi.fn(async () => ({ data: { purged: false }, error: null }));

    await expect(purgeAccountCards(input, { rpc })).rejects.toThrow('PURGA_CARTOES_INCOMPLETA');
  });

  it('propagates the database failure without exposing card data', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error('POLITICA_RETENCAO_NAO_APROVADA') }));

    await expect(purgeAccountCards(input, { rpc })).rejects.toThrow('POLITICA_RETENCAO_NAO_APROVADA');
  });
});

describe('purgeClaimedAccountCards', () => {
  const claim = {
    id: input.solicitacaoId,
    userId: input.userId,
    policyVersion: 'test-mvp',
    leaseToken: '13131313-bbbb-4111-8111-111111111111',
    generation: 7,
    phase: 'claimed' as const,
    hasCliente: true,
    hasLojista: false,
  };

  const purgeClaimedAccountCards = (cards as {
    purgeClaimedAccountCards?: (value: typeof claim, client: unknown) => Promise<void>;
  }).purgeClaimedAccountCards;

  it('uses the fenced checkpointing RPC rather than the legacy user-id RPC', async () => {
    expect(purgeClaimedAccountCards).toBeTypeOf('function');
    if (!purgeClaimedAccountCards) return;

    const rpc = vi.fn(async () => ({ data: { purged: true }, error: null }));
    await expect(purgeClaimedAccountCards(claim, { rpc })).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('purge_account_deletion_cards', {
      p_request_id: claim.id,
      p_lease_token: claim.leaseToken,
      p_generation: claim.generation,
    });
  });

  it('refuses a null, error, or false checkpoint proof', async () => {
    expect(purgeClaimedAccountCards).toBeTypeOf('function');
    if (!purgeClaimedAccountCards) return;

    await expect(purgeClaimedAccountCards(claim, {
      rpc: async () => ({ data: null, error: null }),
    })).rejects.toThrow('PURGA_CARTOES_INCOMPLETA');
    await expect(purgeClaimedAccountCards(claim, {
      rpc: async () => ({ data: { purged: false }, error: null }),
    })).rejects.toThrow('PURGA_CARTOES_INCOMPLETA');
    await expect(purgeClaimedAccountCards(claim, {
      rpc: async () => ({ data: null, error: new Error('LEASE_INVALIDA') }),
    })).rejects.toThrow('LEASE_INVALIDA');
  });
});
