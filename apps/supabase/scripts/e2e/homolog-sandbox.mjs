#!/usr/bin/env node
/**
 * Homologação E2E isolada: nunca aceita outro Supabase nem Asaas fora do sandbox.
 * Execute com `node scripts/e2e/homolog-sandbox.mjs --env-file /projects/keepitnovoapp/.env`.
 */
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const APPROVED_REF = 'jhhbewnmnorhmsdvfppo';
const ASAAS_SANDBOX = 'https://api-sandbox.asaas.com/v3';
const PREFIX = 'e2e-20261016';
const SANDBOX_PIX_TRANSFER_KEYS = [
  'cliente-a00001@pix.bcb.gov.br',
  'cliente-a00002@pix.bcb.gov.br',
  'cliente-a00003@pix.bcb.gov.br',
  'cliente-a00004@pix.bcb.gov.br',
  'cliente-a00005@pix.bcb.gov.br',
];

export function redactId(value) {
  if (!value) return null;
  const text = String(value);
  return text.length <= 14 ? 'redigido' : `${text.slice(0, 8)}…${text.slice(-6)}`;
}

export function assertSafeEnvironment({ supabaseUrl, asaasBaseUrl }) {
  const expectedSupabase = `https://${APPROVED_REF}.supabase.co`;
  if (supabaseUrl !== expectedSupabase) throw new Error('SUPABASE_HOMOLOGACAO_OBRIGATORIO');
  if (asaasBaseUrl !== ASAAS_SANDBOX) throw new Error('ASAAS_SANDBOX_OBRIGATORIO');
}

export function sandboxPixTransferKeys(run) {
  let hash = 0;
  for (const char of run) hash = ((hash * 31) + char.charCodeAt(0)) | 0;
  const start = Math.abs(hash) % SANDBOX_PIX_TRANSFER_KEYS.length;
  return [...SANDBOX_PIX_TRANSFER_KEYS.slice(start), ...SANDBOX_PIX_TRANSFER_KEYS.slice(0, start)];
}

export function isDuplicateSandboxTransferConflict(error) {
  return error instanceof Error && error.message === 'HTTP_409:CHECKOUT_ALREADY_REQUESTED';
}

export async function createSandboxTransferWithDuplicateFallback(run, createTransfer) {
  let lastConflict;
  for (const pixAddressKey of sandboxPixTransferKeys(run)) {
    try {
      return await createTransfer(pixAddressKey);
    } catch (error) {
      if (!isDuplicateSandboxTransferConflict(error)) throw error;
      lastConflict = error;
    }
  }
  throw lastConflict;
}

function parseEnv(text) {
  const parsed = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    parsed[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  }
  return parsed;
}

function required(env, keys) {
  for (const key of keys) if (env[key]?.trim()) return env[key].trim();
  throw new Error(`CONFIGURACAO_AUSENTE:${keys.join('|')}`);
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[A-Za-z0-9_-]{24,}/g, 'redigido').slice(0, 180);
}

async function jsonRequest(url, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: { accept: 'application/json', ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const content = await response.text();
  let data = null;
  try { data = content ? JSON.parse(content) : null; } catch { /* sanitized below */ }
  if (!response.ok) {
    const code = data?.code ?? data?.errors?.[0]?.code ?? `HTTP_${response.status}`;
    throw new Error(`HTTP_${response.status}:${String(code).toUpperCase().replace(/[^A-Z0-9_:-]/g, '_')}`);
  }
  return data;
}

function monday(date) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

function phase(result, name) {
  const entry = { fluxo: name, status: 'falhou', evidencias: [] };
  result.fluxos.push(entry);
  return entry;
}

async function main() {
  const envFileIndex = process.argv.indexOf('--env-file');
  const envFile = envFileIndex >= 0 ? process.argv[envFileIndex + 1] : undefined;
  if (!envFile) throw new Error('USO:--env-file');
  const env = { ...process.env, ...parseEnv(await readFile(envFile, 'utf8')) };
  const configuredTimeout = Number(env.E2E_TIMEOUT_MS ?? 45_000);
  const pollingTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 1_000 && configuredTimeout <= 45_000
    ? configuredTimeout : 45_000;
  const config = {
    supabaseUrl: required(env, ['SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL']),
    anonKey: required(env, ['SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']),
    serviceKey: required(env, ['SUPABASE_SERVICE_ROLE_KEY']),
    asaasKey: required(env, ['ASAAS_API_KEY']),
    asaasBaseUrl: (env.ASAAS_BASE_URL ?? ASAAS_SANDBOX).replace(/\/+$/, ''),
  };
  assertSafeEnvironment(config);
  if (env.CARD_TOKENIZATION_ENABLED === 'true' || env.ACCOUNT_DELETION_ENABLED === 'true') {
    throw new Error('FLAG_PROIBIDA_ATIVA');
  }

  const run = `${PREFIX}-${randomUUID().slice(0, 8)}`;
  const result = { prefixo: PREFIX, execucao: run, ambiente: 'homolog-sandbox', fluxos: [], limpeza: 'pendente' };
  const rest = `${config.supabaseUrl}/rest/v1`;
  const functions = `${config.supabaseUrl}/functions/v1`;
  const serviceHeaders = { apikey: config.serviceKey, authorization: `Bearer ${config.serviceKey}`, prefer: 'return=representation,resolution=merge-duplicates' };
  const asaasHeaders = { access_token: config.asaasKey, 'user-agent': 'keepit-e2e-homolog/1.0' };
  const created = {};

  const db = (path, options = {}) => jsonRequest(`${rest}/${path}`, { ...options, headers: { ...serviceHeaders, ...(options.headers ?? {}) } });
  const rpc = (token, name, body) => jsonRequest(`${rest}/rpc/${name}`, { method: 'POST', headers: { apikey: config.anonKey, authorization: `Bearer ${token}` }, body });
  const serviceRpc = (name, body) => jsonRequest(`${rest}/rpc/${name}`, { method: 'POST', headers: serviceHeaders, body });
  const waitFor = async (description, check, timeoutMs = 45_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await check();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error(`TIMEOUT:${description}`);
  };
  const createUser = async (role) => {
    const password = `${randomUUID()}Aa1!`;
    const data = await jsonRequest(`${config.supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST', headers: serviceHeaders,
      body: { email: `${run}-${role}@example.test`, password, email_confirm: true, user_metadata: { nome: `${run} ${role}` } },
    });
    const session = await jsonRequest(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: config.anonKey }, body: { email: `${run}-${role}@example.test`, password },
    });
    return { id: data.id, token: session.access_token };
  };
  const fetchOrder = async (id) => {
    const rows = await db(`pedidos?id=eq.${encodeURIComponent(id)}&select=id,status,pago_em,total_pago_reais,asaas_payment_id,entregue_em`);
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('PEDIDO_NAO_ENCONTRADO');
    return rows[0];
  };
  const createOrder = async (customer, fixture) => {
    const quote = await rpc(customer.token, 'cotar_pedido', {
      p_estabelecimento_id: fixture.storeId, p_hub_id: fixture.hubId,
      p_itens: [{ produtoId: fixture.productId, quantidade: 1 }],
    });
    const createdOrder = await rpc(customer.token, 'criar_pedido_cotado', {
      p_cotacao_id: quote.id, p_forma: 'pix', p_nf_solicitada: false, p_operacao_id: randomUUID(),
    });
    return createdOrder.pedidoId;
  };
  const payOrder = async (customer, orderId) => {
    const charge = await jsonRequest(`${functions}/create-pix-payment`, {
      method: 'POST', headers: { apikey: config.anonKey, authorization: `Bearer ${customer.token}` },
      body: { pedido_id: orderId, operacao_id: randomUUID() },
    });
    const paymentId = charge.asaas_payment_id;
    if (!paymentId || !charge.tentativa?.id) throw new Error('COBRANCA_PIX_INVALIDA');
    await jsonRequest(`${ASAAS_SANDBOX}/sandbox/payment/${encodeURIComponent(paymentId)}/confirm`, { method: 'POST', headers: asaasHeaders, body: {} });
    const order = await fetchOrder(orderId);
    const confirmed = await waitFor('WEBHOOK_NAO_CONFIRMOU_PEDIDO', async () => {
      const candidate = await fetchOrder(orderId);
      return candidate.status === 'aguardando_aceite' && candidate.pago_em ? candidate : null;
    });
    const event = await waitFor('EVENTO_ASAAS_NAO_PERSISTIDO', async () => {
      const rows = await db(`eventos_pagamento?cobranca_id=eq.${encodeURIComponent(paymentId)}&select=evento_externo_id,tipo,referencia,valor_centavos,metodo&order=recebido_em.desc&limit=1`);
      return rows[0] ?? null;
    });
    // Reentrega do mesmo evento persistido: mesma identidade e mesmos campos do webhook.
    const replay = await serviceRpc('processar_evento_pagamento', {
      p_evento_id: event.evento_externo_id, p_evento: event.tipo, p_cobranca_id: paymentId,
      p_referencia: event.referencia, p_valor_centavos: event.valor_centavos, p_metodo: event.metodo,
    });
    if (!confirmed) throw new Error('WEBHOOK_NAO_CONFIRMOU_PEDIDO');
    return { paymentId, webhookId: event.evento_externo_id, replay: Array.isArray(replay) ? replay[0]?.resultado : replay?.resultado };
  };
  const prepareFixture = async () => {
    const admin = await createUser('admin');
    const merchant = await createUser('lojista');
    const customer = await createUser('cliente');
    created.adminId = admin.id; created.merchantId = merchant.id; created.customerId = customer.id;
    await db('admin_users', { method: 'POST', body: { id: admin.id, nome: `${run} admin` } });
    await db(`clientes?id=eq.${customer.id}`, { method: 'PATCH', body: { cpf: '12345678909', nome: `${run} cliente` } });
    const hubRows = await db('hubs', { method: 'POST', body: { nome: `${run} hub`, endereco: `${run} endereco`, lat: -23.5505, lng: -46.6333, ativo: true } });
    const hubId = hubRows[0]?.id; created.hubId = hubId;
    const cnpj = `99${Date.now().toString().slice(-12)}`;
    const storeRows = await db('estabelecimentos', { method: 'POST', body: {
      dono_user_id: merchant.id, nome_fantasia: `${run} loja`, cnpj, responsavel_nome: `${run} responsavel`, telefone: '11999999999',
      categoria: 'e2e', endereco: `${run} endereco`, tempo_medio_entrega_min: 5, taxa_deslocamento_reais: 0,
      ticket_minimo_reais: 20, chave_pix: '99991111140', chave_pix_tipo: 'cpf', status: 'ativo', pausado_manualmente: false,
    } });
    const storeId = storeRows[0]?.id; created.storeId = storeId;
    await db('estabelecimentos_hubs', { method: 'POST', body: { estabelecimento_id: storeId, hub_id: hubId } });
    const productRows = await db('produtos', { method: 'POST', body: { estabelecimento_id: storeId, nome: `${run} produto`, preco_reais: 25, categoria_produto: 'e2e', ativo: true } });
    const productId = productRows[0]?.id; created.productId = productId;
    const days = Array.from({ length: 7 }, (_, dia_semana) => ({ dia_semana, aberto: true, hora_abre: '00:00', hora_fecha: '23:59' }));
    await db('hubs_horarios?on_conflict=hub_id,dia_semana', { method: 'POST', body: days.map((item) => ({ ...item, hub_id: hubId })) });
    await db('estabelecimentos_horarios?on_conflict=estabelecimento_id,dia_semana', { method: 'POST', body: days.map((item) => ({ ...item, estabelecimento_id: storeId })) });
    return { admin, merchant, customer, hubId, storeId, productId };
  };
  const cleanup = async () => {
    if (created.storeId) await db(`estabelecimentos?id=eq.${created.storeId}`, { method: 'PATCH', body: { pausado_manualmente: true, status: 'suspenso' } });
    if (created.productId) await db(`produtos?id=eq.${created.productId}`, { method: 'PATCH', body: { ativo: false } });
    if (created.hubId) await db(`hubs?id=eq.${created.hubId}`, { method: 'PATCH', body: { ativo: false } });
    result.limpeza = 'dados sintéticos preservados e desativados; todos vinculados ao prefixo';
  };

  try {
    const fixture = await prepareFixture();

    const paymentPhase = phase(result, '1. pedido + Pix sandbox + webhook idempotente');
    try {
      const orderId = await createOrder(fixture.customer, fixture);
      const paid = await payOrder(fixture.customer, orderId);
      const charges = await db(`lancamentos_financeiros?pedido_id=eq.${orderId}&tipo=eq.charge&select=id`);
      if (charges.length !== 1) throw new Error('LANCAMENTO_DUPLICADO');
      paymentPhase.status = 'passou';
      paymentPhase.evidencias.push(`pedido ${redactId(orderId)}`, `cobranca ${redactId(paid.paymentId)}`, `evento ${redactId(paid.webhookId)}`, `reentrega idempotente: ${paid.replay}`, '1 lançamento charge após reentrega');
    } catch (error) { paymentPhase.erro = safeError(error); }

    const pinPhase = phase(result, '2. PIN de retirada conclui pedido');
    try {
      const orderId = await createOrder(fixture.customer, fixture);
      await payOrder(fixture.customer, orderId);
      await rpc(fixture.merchant.token, 'aceitar_pedido', { p_pedido_id: orderId, p_tempo_estimado_min: 5 });
      await rpc(fixture.merchant.token, 'avancar_estado_pedido', { p_pedido_id: orderId, p_novo_status: 'saindo_hub' });
      await rpc(fixture.merchant.token, 'avancar_estado_pedido', { p_pedido_id: orderId, p_novo_status: 'no_hub' });
      const pin = await rpc(fixture.customer.token, 'obter_pin_cliente', { p_pedido_id: orderId });
      const outcome = await rpc(fixture.merchant.token, 'confirmar_pin_pedido', { p_pedido_id: orderId, p_pin: pin });
      const credits = await db(`lancamentos_financeiros?pedido_id=eq.${orderId}&tipo=eq.merchant_credit&select=id`);
      if (outcome?.[0]?.resultado !== 'entregue' || credits.length !== 1) throw new Error('PIN_NAO_CONCLUIU_PEDIDO');
      pinPhase.status = 'passou'; pinPhase.evidencias.push(`pedido ${redactId(orderId)}`, 'status entregue', '1 crédito de lojista');
    } catch (error) { pinPhase.erro = safeError(error); }

    const cancelPhase = phase(result, '3. cancelamento antes do pagamento');
    try {
      const orderId = await createOrder(fixture.customer, fixture);
      const cancellation = await rpc(fixture.admin.token, 'forcar_cancelamento_pedido', { p_pedido_id: orderId, p_motivo: `${run} cancelamento pré-pagamento` });
      const row = Array.isArray(cancellation) ? cancellation[0] : cancellation;
      if (row?.status !== 'cancelado_admin' || row?.refund_id !== null) throw new Error('CANCELAMENTO_PRE_PAGAMENTO_INVALIDO');
      cancelPhase.status = 'passou'; cancelPhase.evidencias.push(`pedido ${redactId(orderId)}`, 'cancelado_admin sem reembolso');
    } catch (error) { cancelPhase.erro = safeError(error); }

    const refundPhase = phase(result, '4. reembolso de pedido pago');
    try {
      const orderId = await createOrder(fixture.customer, fixture);
      const paid = await payOrder(fixture.customer, orderId);
      const cancellation = await rpc(fixture.admin.token, 'forcar_cancelamento_pedido', { p_pedido_id: orderId, p_motivo: `${run} reembolso` });
      const cancelled = Array.isArray(cancellation) ? cancellation[0] : cancellation;
      await jsonRequest(`${ASAAS_SANDBOX}/payments/${encodeURIComponent(paid.paymentId)}/refund`, { method: 'POST', headers: asaasHeaders, body: {} });
      const gatewayRefund = await waitFor('ASAAS_REEMBOLSO_NAO_CONCLUIDO', async () => {
        const listed = await jsonRequest(`${ASAAS_SANDBOX}/payments/${encodeURIComponent(paid.paymentId)}/refunds`, { headers: asaasHeaders });
        return listed.data?.find((item) => item.status === 'DONE') ?? null;
      }, pollingTimeoutMs);
      if (!gatewayRefund?.id) throw new Error('ASAAS_REFUND_ID_AUSENTE');
      refundPhase.evidencias.push(`pedido ${redactId(orderId)}`, `reembolso ${redactId(gatewayRefund.id)}`, 'Asaas status DONE');
      const refunds = await waitFor('WEBHOOK_REEMBOLSO_NAO_CONCILIOU', async () => {
        const rows = await db(`lancamentos_financeiros?id=eq.${cancelled.refund_id}&select=id,status,asaas_id_externo`);
        return rows[0]?.status === 'concluido' ? rows : null;
      }, pollingTimeoutMs);
      if (refunds[0]?.status !== 'concluido') throw new Error('REEMBOLSO_NAO_CONCILIADO');
      refundPhase.status = 'passou'; refundPhase.evidencias.push('ledger concluído');
    } catch (error) { refundPhase.erro = safeError(error); }

    const payoutPhase = phase(result, '5. repasse ao lojista');
    try {
      const orderId = await createOrder(fixture.customer, fixture);
      await payOrder(fixture.customer, orderId);
      await rpc(fixture.merchant.token, 'aceitar_pedido', { p_pedido_id: orderId, p_tempo_estimado_min: 5 });
      await rpc(fixture.merchant.token, 'avancar_estado_pedido', { p_pedido_id: orderId, p_novo_status: 'saindo_hub' });
      await rpc(fixture.merchant.token, 'avancar_estado_pedido', { p_pedido_id: orderId, p_novo_status: 'no_hub' });
      const pin = await rpc(fixture.customer.token, 'obter_pin_cliente', { p_pedido_id: orderId });
      await rpc(fixture.merchant.token, 'confirmar_pin_pedido', { p_pedido_id: orderId, p_pin: pin });
      const prepared = await rpc(fixture.admin.token, 'preparar_repasses_semanais', { p_semana_inicio: monday(new Date()), p_operacao_id: randomUUID() });
      const repasse = (Array.isArray(prepared) ? prepared : []).find((item) => item.estabelecimento_id === fixture.storeId);
      if (!repasse?.id || repasse.valor_centavos <= 0) throw new Error('REPASSE_NAO_PREPARADO');
      payoutPhase.evidencias.push(`pedido ${redactId(orderId)}`, `repasse ${redactId(repasse.id)}`, 'repasse preparado');
      const transfer = await createSandboxTransferWithDuplicateFallback(run, (pixAddressKey) => jsonRequest(`${ASAAS_SANDBOX}/transfers`, {
        method: 'POST', headers: asaasHeaders, body: {
          value: repasse.valor_centavos / 100, pixAddressKey, pixAddressKeyType: 'EMAIL', externalReference: `${run}-repasse`, description: `${run} repasse sandbox`,
        },
      }));
      if (!transfer.id) throw new Error('TRANSFERENCIA_SEM_ID');
      payoutPhase.evidencias.push(`transferência ${redactId(transfer.id)} criada`);
      const settledTransfer = await waitFor('TRANSFERENCIA_NAO_CONCLUIDA', async () => {
        const current = await jsonRequest(`${ASAAS_SANDBOX}/transfers/${encodeURIComponent(transfer.id)}`, { headers: asaasHeaders });
        return current.status === 'DONE' ? current : null;
      }, pollingTimeoutMs);
      const confirmed = await rpc(fixture.admin.token, 'confirmar_repasse', {
        p_repasse_id: repasse.id, p_referencia: settledTransfer.id, p_comprovante_identificador: `${run}-comprovante`, p_operacao_id: randomUUID(),
      });
      const paidRepasse = Array.isArray(confirmed) ? confirmed[0] : confirmed;
      if (paidRepasse?.estado !== 'pago') throw new Error('REPASSE_NAO_CONFIRMADO');
      payoutPhase.status = 'passou'; payoutPhase.evidencias.push(`pedido ${redactId(orderId)}`, `repasse ${redactId(repasse.id)}`, `transferência ${redactId(settledTransfer.id)}`, 'estado pago');
    } catch (error) { payoutPhase.erro = safeError(error); }
  } finally {
    await cleanup();
  }

  console.log(JSON.stringify(result, null, 2));
  if (result.fluxos.some((item) => item.status !== 'passou')) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(JSON.stringify({ prefixo: PREFIX, erro: safeError(error) }));
    process.exitCode = 1;
  });
}
