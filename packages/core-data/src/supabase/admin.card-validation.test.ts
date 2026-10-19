import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@keepit/shared-types';

import { createAdminSupabase } from './admin.supabase';

describe('Admin Supabase — validação de cartão', () => {
  it('invoca somente o reconciliador administrativo e retorna a projeção sem token', async () => {
    const invoke = vi.fn(async () => ({
      data: { ok: true, id: 'operacao-1', estado: 'estorno_pendente', valorCentavos: 137 }, error: null,
    }));
    const client = { functions: { invoke } } as unknown as SupabaseClient<Database>;

    await expect(createAdminSupabase(client).reconciliarValidacaoCartao('operacao-1')).resolves.toEqual({
      id: 'operacao-1', estado: 'estorno_pendente', valorCentavos: 137,
    });
    expect(invoke).toHaveBeenCalledWith('reconcile-card-validation', { body: { operacaoId: 'operacao-1' } });
  });
});
