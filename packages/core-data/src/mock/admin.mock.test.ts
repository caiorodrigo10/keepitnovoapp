import { beforeEach, describe, expect, it } from 'vitest';

import type { AdminPort } from '../ports/admin.port';
import { createAdminMock } from './admin.mock';
import { createMockDb, type MockDb } from './db';

describe('admin.mock (contract)', () => {
  let db: MockDb;
  let port: AdminPort;

  beforeEach(() => {
    db = createMockDb();
    port = createAdminMock(db);
  });

  it('pendingStores resolves with only status="em_analise" estabelecimentos', async () => {
    const pendentes = await port.pendingStores({ delayMs: 1 });
    expect(pendentes.length).toBeGreaterThan(0);
    expect(pendentes.every((e) => e.status === 'em_analise')).toBe(true);
  });

  // -------------------------------------------------------------------
  // Story 3.7 (AC2, AC3) — EstabelecimentoAdmin (cnpj/telefone/etc.)
  // -------------------------------------------------------------------

  it('pendingStores expõe os campos administrativos (AC2: cnpj, telefone, criado_em)', async () => {
    const pendentes = await port.pendingStores({ delayMs: 1 });
    const padoca = pendentes.find((e) => e.id === 'estab-em-analise');
    expect(padoca).toBeDefined();
    expect(padoca).toMatchObject({
      cnpj: expect.any(String),
      telefone: expect.any(String),
      responsavel_nome: expect.any(String),
      criado_em: expect.any(String),
      // Sempre null no piloto — Story 3.3 é SIMPLE, nunca inventado.
      dados_receita: null,
      aprovado_em: null,
      aprovado_por: null,
    });
  });

  it('pendingStoreDetail resolve o detalhe completo (AC3) e null para id inexistente', async () => {
    const detalhe = await port.pendingStoreDetail('estab-em-analise', { delayMs: 1 });
    expect(detalhe).toMatchObject({
      id: 'estab-em-analise',
      cnpj: expect.any(String),
      chave_pix: expect.any(String),
      chave_pix_tipo: expect.any(String),
      dados_receita: null,
    });
    expect(detalhe?.foto_fachada_url_assinada).toBe(detalhe?.foto_fachada_url);

    const inexistente = await port.pendingStoreDetail('estab-nao-existe', { delayMs: 1 });
    expect(inexistente).toBeNull();
  });

  it('pendingStoreDetail funciona para estabelecimentos não-pendentes (paridade com getById administrativo)', async () => {
    const detalhe = await port.pendingStoreDetail('estab-farmacia-vida', { delayMs: 1 });
    expect(detalhe?.status).toBe('ativo');
    expect(detalhe?.aprovado_em).not.toBeNull();
  });

  it('approve transitions status to "ativo"', async () => {
    const estabelecimento = await port.approve('estab-em-analise', { delayMs: 1 });
    expect(estabelecimento.status).toBe('ativo');
  });

  it('reject transitions status to "rejeitado" and records motivo_rejeicao', async () => {
    const estabelecimento = await port.reject('estab-em-analise', 'CNPJ inválido', { delayMs: 1 });
    expect(estabelecimento.status).toBe('rejeitado');
    expect(estabelecimento.motivo_rejeicao).toBe('CNPJ inválido');
  });

  it('hubsCrud.create/update/delete manage the in-memory hubs collection', async () => {
    const hub = await port.hubsCrud.create(
      {
        nome: 'Hub Teste',
        endereco: 'Rua Teste, 1',
        lat: 0,
        lng: 0,
        horarios: [],
      },
      { delayMs: 1 },
    );
    expect(hub.nome).toBe('Hub Teste');

    const updated = await port.hubsCrud.update(hub.id, { nome: 'Hub Teste Renomeado' }, { delayMs: 1 });
    expect(updated.nome).toBe('Hub Teste Renomeado');

    await port.hubsCrud.delete(hub.id, { delayMs: 1 });
    expect(db.hubs.find((h) => h.id === hub.id)).toBeUndefined();
  });

  // -------------------------------------------------------------------
  // Story 4.1 (AC1, AC2, AC4) — hubsCrud.list/getById/uploadFoto
  // -------------------------------------------------------------------

  it('hubsCrud.list includes inactive hubs (AC1) — distinct from hub.listNearby, which filters ativo', async () => {
    await port.hubsCrud.update('hub-jardins', { ativo: false }, { delayMs: 1 });

    const todos = await port.hubsCrud.list({ delayMs: 1 });
    expect(todos.some((h) => h.id === 'hub-jardins' && h.ativo === false)).toBe(true);
    expect(todos.length).toBe(db.hubs.length);
  });

  it('hubsCrud.list allows reactivating a hub previously deactivated (AC1, AC4)', async () => {
    await port.hubsCrud.update('hub-jardins', { ativo: false }, { delayMs: 1 });
    const reativado = await port.hubsCrud.update('hub-jardins', { ativo: true }, { delayMs: 1 });
    expect(reativado.ativo).toBe(true);

    const todos = await port.hubsCrud.list({ delayMs: 1 });
    expect(todos.find((h) => h.id === 'hub-jardins')?.ativo).toBe(true);
  });

  it('hubsCrud.getById resolves an existing hub (including inactive) and null for a missing id', async () => {
    await port.hubsCrud.update('hub-jardins', { ativo: false }, { delayMs: 1 });

    const inativo = await port.hubsCrud.getById('hub-jardins', { delayMs: 1 });
    expect(inativo?.ativo).toBe(false);

    const inexistente = await port.hubsCrud.getById('hub-nao-existe', { delayMs: 1 });
    expect(inexistente).toBeNull();
  });

  it('hubsCrud.uploadFoto echoes the received uri (mock has no real Storage) — never a fictitious upload', async () => {
    const url = await port.hubsCrud.uploadFoto({ uri: 'blob:http://localhost/foto-hub', ext: 'jpg' }, { delayMs: 1 });
    expect(url).toBe('blob:http://localhost/foto-hub');
  });

  it('refundQueue.list/process manage reembolsos pendentes', async () => {
    // Story 1.10 (Task 4): `db.reembolsos` agora nasce seedado com fixtures
    // (não mais vazio) — a fila cresce em vez de começar do zero.
    const antes = await port.refundQueue.list({ delayMs: 1 });

    db.reembolsos.push({
      id: 'reembolso-teste',
      pedido_id: 'pedido-2049',
      motivo: 'timeout_aceite',
      valor_a_estornar_reais: 59.7,
      valor_ao_lojista_reais: 0,
      forma_pagamento: 'cartao',
      status: 'pendente_admin',
      criado_em: new Date().toISOString(),
    });

    const fila = await port.refundQueue.list({ delayMs: 1 });
    expect(fila).toHaveLength(antes.length + 1);

    const processado = await port.refundQueue.process('reembolso-teste', 'concluido', undefined, { delayMs: 1 });
    expect(processado.status).toBe('estornado');
  });

  it('refundQueue.process(resultado="erro") marca status erro — nenhum sucesso fictício (Story 8.2 AC2)', async () => {
    db.reembolsos.push({
      id: 'reembolso-teste-erro',
      pedido_id: 'pedido-2050',
      motivo: 'timeout_aceite',
      valor_a_estornar_reais: 10,
      valor_ao_lojista_reais: 0,
      forma_pagamento: 'pix',
      status: 'pendente_admin',
      criado_em: new Date().toISOString(),
    });

    const processado = await port.refundQueue.process('reembolso-teste-erro', 'erro', 'PIX falhou', { delayMs: 1 });
    expect(processado.status).toBe('erro');
  });

  it('payoutQueue.list/process managed saques pendentes (Story 8.9)', async () => {
    db.saques.push({
      id: 'saque-teste',
      estabelecimento_id: 'estab-farmacia-vida',
      valor_reais: 150,
      status: 'solicitado',
      solicitado_em: new Date().toISOString(),
      processado_em: null,
      concluido_em: null,
    });

    const fila = await port.payoutQueue.list({ delayMs: 1 });
    expect(fila.some((s) => s.id === 'saque-teste')).toBe(true);

    const processado = await port.payoutQueue.process('saque-teste', 'concluido', undefined, { delayMs: 1 });
    expect(processado.status).toBe('concluido');
    expect(processado.concluido_em).not.toBeNull();

    const filaDepois = await port.payoutQueue.list({ delayMs: 1 });
    expect(filaDepois.some((s) => s.id === 'saque-teste')).toBe(false);
  });

  it('is genuinely asynchronous — does not resolve on the same tick', () => {
    let resolved = false;
    const promise = port.pendingStores({ delayMs: 0 }).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    return promise;
  });

  it('forceError rejects the Promise', async () => {
    await expect(port.pendingStores({ forceError: true, delayMs: 1 })).rejects.toThrow();
  });

  it('forceEmpty resolves with an empty array', async () => {
    await expect(port.pendingStores({ forceEmpty: true, delayMs: 1 })).resolves.toEqual([]);
  });

  // -------------------------------------------------------------------
  // Admin-ops (Story 1.10, Task 4)
  // -------------------------------------------------------------------

  it('listClientes filters by busca (nome/telefone) and blockCliente/unblockCliente toggle bloqueado', async () => {
    const todos = await port.listClientes(undefined, { delayMs: 1 });
    expect(todos.length).toBeGreaterThan(1);

    const filtrado = await port.listClientes({ busca: 'ana souza' }, { delayMs: 1 });
    expect(filtrado).toHaveLength(1);
    expect(filtrado[0].id).toBe('cliente-ana');

    const bloqueado = await port.blockCliente('cliente-ana', 'Teste de bloqueio', { delayMs: 1 });
    expect(bloqueado.bloqueado).toBe(true);
    expect(bloqueado.motivo_bloqueio).toBe('Teste de bloqueio');

    const desbloqueado = await port.unblockCliente('cliente-ana', { delayMs: 1 });
    expect(desbloqueado.bloqueado).toBe(false);
    expect(desbloqueado.motivo_bloqueio).toBeNull();
  });

  it('listAllEstabelecimentos includes non-ativo estabelecimentos and suspendLojista transitions ativo -> suspenso', async () => {
    const todos = await port.listAllEstabelecimentos({ delayMs: 1 });
    expect(todos.some((e) => e.status === 'suspenso')).toBe(true);

    const suspenso = await port.suspendLojista('estab-farmacia-vida', 'Reincidência de reclamações', { delayMs: 1 });
    expect(suspenso.status).toBe('suspenso');
    expect(suspenso.motivo_suspensao).toBe('Reincidência de reclamações');

    await expect(port.suspendLojista('estab-farmacia-vida', 'motivo', { delayMs: 1 })).rejects.toThrow();
  });

  it('reactivateLojista reverts suspenso -> ativo and clears motivo_suspensao (Story 8.6 AC4)', async () => {
    const suspenso = await port.suspendLojista('estab-farmacia-vida', 'Reincidência de reclamações', {
      delayMs: 1,
    });
    expect(suspenso.status).toBe('suspenso');

    const reativado = await port.reactivateLojista('estab-farmacia-vida', { delayMs: 1 });
    expect(reativado.status).toBe('ativo');
    expect(reativado.motivo_suspensao).toBeNull();

    // Guarda simétrica: não reativa quem já está ativo.
    await expect(port.reactivateLojista('estab-farmacia-vida', { delayMs: 1 })).rejects.toThrow();
  });

  it('lojistaQualityView resolves the falhas seeded for a suspended estabelecimento', async () => {
    const falhas = await port.lojistaQualityView('estab-mercadinho-noturno', { delayMs: 1 });
    expect(falhas.length).toBeGreaterThanOrEqual(2);
  });

  it('lojistaOrderCounts buckets pedidos by entregue/cancelado/no-show (Story 8.8 AC1)', async () => {
    const counts = await port.lojistaOrderCounts('estab-farmacia-vida', { delayMs: 1 });
    expect(counts).toEqual({
      entregues: expect.any(Number),
      cancelados: expect.any(Number),
      noShow: expect.any(Number),
    });
    expect(counts.entregues).toBeGreaterThanOrEqual(0);
  });

  it('lojistaOrderCounts resolves zeros honestos for an estabelecimento with no pedidos', async () => {
    const counts = await port.lojistaOrderCounts('estab-sem-pedidos-inexistente', { delayMs: 1 });
    expect(counts).toEqual({ entregues: 0, cancelados: 0, noShow: 0 });
  });

  it('financialDashboard aggregates gmv/receita/ranking from real pedidos entregues', async () => {
    const dashboard = await port.financialDashboard(400, { delayMs: 1 });
    expect(dashboard.gmvReais).toBeGreaterThan(0);
    expect(dashboard.receitaKeepitReais).toBeGreaterThan(0);
    expect(dashboard.ranking.length).toBeGreaterThan(0);
  });

  it('financialDashboard (Story 8.7 SHOULD) includes counts + taxa de sucesso derived from pedidos, never hardcoded', async () => {
    const dashboard = await port.financialDashboard(400, { delayMs: 1 });
    expect(dashboard.pedidosTotais).toBeGreaterThan(0);
    expect(dashboard.pedidosTotais).toBeGreaterThanOrEqual(
      dashboard.pedidosEntregues + dashboard.pedidosCancelados + dashboard.pedidosNoShow,
    );
    expect(dashboard.taxaSucessoPercent).toBeGreaterThanOrEqual(0);
    expect(dashboard.taxaSucessoPercent).toBeLessThanOrEqual(100);
  });

  it('financialDashboard with a period with zero pedidos resolves honest zeros, never NaN/Infinity', async () => {
    const dashboard = await port.financialDashboard(0, { delayMs: 1 });
    expect(dashboard.taxaSucessoPercent).toBe(0);
    expect(Number.isFinite(dashboard.taxaSucessoPercent)).toBe(true);
  });

  it('listAllOrders filters by status and forceCancelOrder populates a reembolso (motivo: cancelamento_admin)', async () => {
    const aguardandoAceite = await port.listAllOrders({ status: 'aguardando_aceite' }, { delayMs: 1 });
    expect(aguardandoAceite.every((p) => p.status === 'aguardando_aceite')).toBe(true);
    expect(aguardandoAceite.length).toBeGreaterThan(0);

    const cancelado = await port.forceCancelOrder(aguardandoAceite[0].id, 'Suspeita de fraude', { delayMs: 1 });
    expect(cancelado.status).toBe('cancelado_admin');

    const reembolso = db.reembolsos.find((r) => r.pedido_id === cancelado.id);
    expect(reembolso?.motivo).toBe('cancelamento_admin');

    await expect(port.forceCancelOrder(cancelado.id, 'motivo', { delayMs: 1 })).rejects.toThrow(/terminal/i);
  });
});
