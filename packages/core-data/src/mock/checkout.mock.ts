import type { CheckoutPort, Cotacao } from '../ports/checkout.port';
import type { SettingsPort } from '../ports/settings.port';
import type { HubHorario } from '../ports/hub.port';
import { parseCotacao } from '../financial-contract';
import { generateMockId as mockId } from './async-helpers';
import type { MockDb } from './db';

export function createCheckoutMock(db: MockDb, settings: SettingsPort): CheckoutPort {
  const cotacoes = new Map<string, { clienteId: string; cotacao: Cotacao; itens: unknown[] }>();
  return {
    async cotar(input) {
      const cliente = db.clientes.find((c) => c.id === db.sessionClienteId);
      if (!cliente || cliente.bloqueado) throw new Error('ACESSO_NEGADO');
      if (!Array.isArray(input.itens) || !input.itens.length || input.itens.length > 100
        || new Set(input.itens.map((i) => i.produtoId)).size !== input.itens.length
        || input.itens.some((i) => !Number.isInteger(i.quantidade) || i.quantidade < 1 || i.quantidade > 2147483647)) throw new Error('ITENS_INVALIDOS');
      const loja = db.estabelecimentos.find((e) => e.id === input.estabelecimentoId);
      if (!loja || loja.status !== 'ativo' || loja.pausado_manualmente || loja.excluido_em) throw new Error('LOJA_INDISPONIVEL');
      // O catálogo demo compartilha todos os hubs; vínculos reais são validados pela RPC.
      const hub = db.hubs.find((h) => h.id === input.hubId && h.ativo);
      if (!hub) throw new Error('HUB_INDISPONIVEL');
      const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const minutos = agora.getHours() * 60 + agora.getMinutes() + agora.getSeconds() / 60;
      const hora = (h: string) => { const [hh, mm, ss = 0] = h.split(':').map(Number); return hh * 60 + mm + ss / 60; };
      const aberto = (horarios: HubHorario[], margem: number, aceitarLimite: boolean) => {
        const h = horarios.find((h) => h.dia_semana === agora.getDay());
        return !!h?.aberto && !!h.hora_abre && !!h.hora_fecha && minutos >= hora(h.hora_abre) && (aceitarLimite ? minutos + margem <= hora(h.hora_fecha) : minutos + margem < hora(h.hora_fecha));
      };
      if (!aberto(loja.horarios, 0, false) || !aberto(hub.horarios, loja.tempo_medio_entrega_min + 10, true)) throw new Error('HORARIO_INVIAVEL');
      const itens = input.itens.map((item) => {
        const p = db.produtos.find((p) => p.id === item.produtoId && p.estabelecimento_id === loja.id && p.ativo && !p.excluido_em);
        if (!p) throw new Error('PRODUTO_INDISPONIVEL');
        return { ...item, nome: p.nome, precoUnitarioCentavos: Math.round(p.preco_reais * 100) };
      });
      const subtotal = itens.reduce((sum, i) => sum + BigInt(i.precoUnitarioCentavos) * BigInt(i.quantidade), BigInt(0));
      if (subtotal < BigInt(Math.round((loja.ticket_minimo_reais ?? 20) * 100))) throw new Error('MINIMO_NAO_ATINGIDO');
      const taxas = await settings.getTaxas();
      const frete = BigInt(Math.round(loja.taxa_deslocamento_reais * 100));
      const comissao = (subtotal * BigInt(taxas.comissaoBps) + BigInt(5000)) / BigInt(10000);
      const total = subtotal + frete + BigInt(taxas.servicoCentavos);
      if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('VALOR_INVALIDO');
      const cotacao = parseCotacao({ id: mockId('cotacao'), taxas, subtotalCentavos: Number(subtotal), freteCentavos: Number(frete), comissaoCentavos: Number(comissao), totalCentavos: Number(total), liquidoLojistaCentavos: Number(subtotal - comissao + frete) });
      cotacoes.set(cotacao.id, { clienteId: cliente.id, cotacao, itens });
      return { ...cotacao, taxas: { ...taxas } };
    },
    async criar() { throw new Error('CHECKOUT_INDISPONIVEL: criação aguarda a integração de pagamentos.'); },
  };
}
