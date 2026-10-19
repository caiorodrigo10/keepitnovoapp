import { describe, expect, it } from 'vitest';

import { createDataClient } from '../index';

type SavedCardsPortContract = {
  listar(): Promise<Array<{ id: string; bandeira: string; ultimo4: string; principal: boolean }>>;
  definirPrincipal(input: { cartaoId: string; operacaoId: string }): Promise<Array<{ id: string; bandeira: string; ultimo4: string; principal: boolean }>>;
  remover(input: { cartaoId: string; operacaoId: string }): Promise<Array<{ id: string; bandeira: string; ultimo4: string; principal: boolean }>>;
  cadastrar(input: {
    operacaoId: string;
    cartao: { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string };
    titular: { name: string; email: string; cpfCnpj: string; postalCode: string; addressNumber: string; phone: string };
  }): Promise<{ id: string; estado: string; valorCentavos: number }>;
};

describe('saved-cards.mock (contract)', () => {
  it('mantém metadados demonstrativos por sessão, promove principal e não retém formulário', async () => {
    const client = createDataClient({ source: 'mock' });
    await client.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });
    const cards = (client as unknown as { savedCards?: SavedCardsPortContract }).savedCards;
    const cartao = { holderName: 'Pessoa Teste', number: '4111111111111111', expiryMonth: '12', expiryYear: '2028', ccv: '123' };
    const titular = { name: 'Pessoa Teste', email: 'pessoa@example.invalid', cpfCnpj: '24971563792', postalCode: '89223005', addressNumber: '277', phone: '4738010919' };

    expect(cards).toBeDefined();
    await cards!.cadastrar({ operacaoId: 'register-1', cartao, titular });
    await cards!.cadastrar({ operacaoId: 'register-2', cartao, titular });
    const listed = await cards!.listar();
    expect(listed).toHaveLength(2);
    expect(listed[0]).toEqual(expect.objectContaining({ id: expect.stringMatching(/^card_demo_/), principal: true }));
    expect(JSON.stringify(listed)).not.toContain(cartao.number);
    expect(JSON.stringify(listed)).not.toContain(cartao.ccv);

    const promoted = await cards!.definirPrincipal({ cartaoId: listed[1]!.id, operacaoId: 'select-2' });
    expect(promoted[0]!.id).toBe(listed[1]!.id);
    expect(promoted.find((card) => card.id === listed[1]!.id)?.principal).toBe(true);
    const afterRemoval = await cards!.remover({ cartaoId: listed[1]!.id, operacaoId: 'remove-2' });
    expect(afterRemoval).toEqual([expect.objectContaining({ id: listed[0]!.id, principal: true })]);
    await expect(cards!.remover({ cartaoId: listed[1]!.id, operacaoId: 'remove-2' })).resolves.toEqual(afterRemoval);

    await client.auth.signUp({ nome: 'Outra Pessoa', email: 'outra@example.invalid', senha: 'senha-segura', telefone: null }, { delayMs: 0 });
    expect(await cards!.listar()).toEqual([]);
    await client.auth.signIn('ana.souza@example.com', 'keepit123', { delayMs: 0 });
    expect(await cards!.listar()).toEqual(afterRemoval);
  });
});
