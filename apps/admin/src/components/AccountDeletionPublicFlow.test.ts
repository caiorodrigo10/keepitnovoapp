import { act, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { initializeDataClient } from '@keepit/core-data';
import { AccountDeletionPublicFlow } from './AccountDeletionPublicFlow';

const client = vi.hoisted(() => ({
  auth: { signIn: vi.fn(), signOut: vi.fn() },
  accountDeletion: { status: vi.fn(), schedule: vi.fn(), cancel: vi.fn() },
}));
vi.mock('@keepit/core-data', async (original) => ({ ...await original<typeof import('@keepit/core-data')>(), getDataClient: () => client }));
vi.mock('../lib/dataClientBootstrap', () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scheduled = { status: 'scheduled', requestedAt: '2026-10-01T00:00:00.000Z', deleteAt: '2026-10-08T00:00:00.000Z' };
let renderer: ReactTestRenderer | undefined;
const text = () => JSON.stringify(renderer!.toJSON());
const recovery = () => renderer!.root.findAllByType('button').filter((button) => button.children.join('') === 'Recuperar minha conta');
async function identify(record: typeof scheduled | null = scheduled) {
  client.accountDeletion.status.mockResolvedValue(record);
  await act(async () => { renderer = create(createElement(AccountDeletionPublicFlow)); });
  await act(async () => {
    renderer!.root.findByProps({ type: 'email' }).props.onChange({ target: { value: 'pessoa@example.invalid' } });
    renderer!.root.findByProps({ type: 'password' }).props.onChange({ target: { value: 'senha' } });
  });
  await act(async () => { await renderer!.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T23:59:59.000Z'));
  client.auth.signIn.mockResolvedValue({ id: 'pessoa' });
  client.auth.signOut.mockResolvedValue(undefined);
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  vi.useRealTimers();
  vi.resetAllMocks();
});

beforeAll(async () => {
  await initializeDataClient({ source: 'mock' });
});

describe('public account deletion page', () => {
  it('identifies Keepit and welcomes both customer and merchant accounts without the app', () => {
    const html = renderToStaticMarkup(createElement(AccountDeletionPublicFlow));
    expect(html).toContain('Keepit');
    expect(html).toContain('Cliente ou lojista');
    expect(html).toContain('sete dias');
  });

  it('explains retention, supplier boundaries and manual Admin support before sign-in', () => {
    const html = renderToStaticMarkup(createElement(AccountDeletionPublicFlow));
    expect(html).toContain('cinco anos após o encerramento financeiro');
    expect(html).toContain('30 dias da criação');
    expect(html).toContain('não apaga os registros mantidos pelos processadores de pagamento');
    expect(html).toContain('Contas de administrador (Admin) seguem atendimento manual pelo Caio.');
  });
  it('shows the persisted deadline before cancellation', async () => {
    await identify();
    expect(text()).toContain('Você pode cancelar até 8 de outubro de 2026');
    expect(recovery()).toHaveLength(1);
  });
  it.each(['2026-10-08T00:00:00.000Z', '2026-10-09T00:00:00.000Z'])('hides cancellation at or after the deadline (%s)', async (now) => {
    vi.setSystemTime(new Date(now)); await identify();
    expect(recovery()).toHaveLength(0);
    expect(text()).toContain('O prazo para cancelar terminou. Sua solicitação aguarda processamento ou revisão de pendências.');
  });
  it('hides recovery as the persisted deadline elapses on the open page', async () => {
    await identify();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(recovery()).toHaveLength(0);
  });
  it.each(['processing', 'failed'])('shows persistent %s rather than an unavailable generic action', async (status) => {
    await identify({ ...scheduled, status });
    expect(text()).toContain('Sua exclusão está em processamento. Uma falha temporária não cancela a solicitação.');
    expect(recovery()).toHaveLength(0);
    expect(renderer!.root.findAllByType('form')).toHaveLength(0);
  });
  it('shows persisted completion rather than a processing or recovery promise', async () => {
    await identify({ ...scheduled, status: 'completed' });
    expect(text()).toContain('Exclusão concluída');
    expect(text()).not.toContain('aguarda processamento');
    expect(recovery()).toHaveLength(0);
  });
  it('preserves a server refusal despite a future local deadline', async () => {
    client.accountDeletion.cancel.mockResolvedValue({ ...scheduled, status: 'processing' });
    await identify();
    await act(async () => { await recovery()[0]!.props.onClick(); });
    expect(text()).not.toContain('Conta recuperada');
    expect(text()).toContain('não pode mais ser cancelada');
    expect(text()).toContain('Sua exclusão está em processamento. Uma falha temporária não cancela a solicitação.');
  });
  it('never claims recovery if the cancellation transport fails', async () => {
    client.accountDeletion.cancel.mockRejectedValue(new Error('indisponível'));
    await identify();
    await act(async () => { await recovery()[0]!.props.onClick(); });
    expect(text()).not.toContain('Conta recuperada');
    expect(text()).toContain('Não foi possível recuperar a conta agora');
  });
  it('keeps the sign-in form and shows an identification error when credentials are rejected', async () => {
    client.auth.signIn.mockRejectedValue(new Error('Invalid login credentials'));
    await identify();
    expect(renderer!.root.findAllByType('form')).toHaveLength(1);
    expect(text()).toContain('Não foi possível identificar a conta ou consultar a solicitação.');
    expect(text()).not.toContain('Exclusão concluída');
  });
});
