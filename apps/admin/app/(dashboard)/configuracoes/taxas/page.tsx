'use client';

import { useEffect, useRef, useState } from 'react';
import type { AlterarTaxasInput, HistoricoTaxas, Taxas } from '@keepit/core-data';
import { Button } from '../../../../src/components/Button';
import { getAdminDataClient } from '../../../../src/lib/adminClient';
import { parseTaxasForm } from '../../../../src/lib/taxasForm';

const money = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = (bps: number) => `${(bps / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
function message(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Não foi possível acessar as taxas.';
}

export default function TaxasPage() {
  const [taxas, setTaxas] = useState<Taxas | null>(null);
  const [historico, setHistorico] = useState<HistoricoTaxas[]>([]);
  const [comissao, setComissao] = useState('');
  const [servico, setServico] = useState('');
  const [motivo, setMotivo] = useState('');
  const [revisao, setRevisao] = useState<AlterarTaxasInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conflito, setConflito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const lock = useRef(false);

  async function carregar() {
    setLoading(true); setErro(null);
    try {
      const settings = getAdminDataClient().settings;
      const [atual, history] = await Promise.all([settings.getTaxas(), settings.listHistoricoTaxas()]);
      setTaxas(atual); setHistorico(history);
      setComissao((atual.comissaoBps / 100).toFixed(2)); setServico((atual.servicoCentavos / 100).toFixed(2));
      setMotivo(''); setRevisao(null); setConflito(false);
    } catch (error) { setErro(message(error)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void carregar(); }, []);

  function revisar() {
    if (!taxas || conflito) return;
    setErro(null); setSucesso(false);
    try {
      if (!motivo.trim()) throw new Error('Informe o motivo da alteração.');
      setRevisao({ ...parseTaxasForm(comissao, servico), versaoEsperada: taxas.versao, motivo: motivo.trim(), operacaoId: crypto.randomUUID() });
    } catch (error) { setErro(message(error)); }
  }
  async function salvar() {
    if (!revisao || conflito || lock.current) return;
    lock.current = true; setSaving(true); setErro(null);
    try {
      const atual = await getAdminDataClient().settings.updateTaxas(revisao);
      setTaxas(atual); setRevisao(null); setSucesso(true);
      await carregar();
    } catch (error) {
      if (message(error).includes('VERSAO_CONFLITANTE')) {
        setConflito(true);
        setErro('Outro administrador alterou as taxas. Recarregue os valores e revise a alteração novamente.');
      } else setErro(message(error));
      // Mantém a mesma operação no retry de uma resposta perdida.
    } finally { lock.current = false; setSaving(false); }
  }

  const disabled = loading || saving || conflito || !taxas;
  const inputClass = 'mt-1 block w-full rounded-md border border-border-subtle bg-bg-primary px-3 py-2 text-text-primary';
  return (
    <section className="space-y-6 text-text-primary">
      <h1 className="text-2xl font-bold">Taxas</h1>
      <p className="text-text-secondary">A comissão incide sobre os produtos e é descontada do lojista. O cliente paga produtos, frete e taxa de serviço. Pedidos existentes mantêm suas taxas.</p>
      {loading && <p role="status">Carregando taxas…</p>}
      {erro && <p role="alert" className="text-accent-warning">{erro}</p>}
      {sucesso && <p role="status">Taxas atualizadas e registradas no histórico.</p>}
      {taxas && <p>Taxas atuais: comissão {percent(taxas.comissaoBps)} · serviço {money(taxas.servicoCentavos)}</p>}
      <form className="max-w-xl space-y-4" onSubmit={(event) => { event.preventDefault(); revisar(); }}>
        <fieldset disabled={disabled || !!revisao} className="space-y-4 disabled:opacity-60">
          <label className="block">Comissão (%)<input className={inputClass} inputMode="decimal" value={comissao} onChange={(e) => setComissao(e.target.value)} required /></label>
          <label className="block">Taxa de serviço (R$)<input className={inputClass} inputMode="decimal" value={servico} onChange={(e) => setServico(e.target.value)} required /></label>
          <label className="block">Motivo da alteração<textarea className={inputClass} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} required /></label>
        </fieldset>
        {!revisao && <Button type="submit" disabled={disabled}>Revisar alteração</Button>}
      </form>
      {revisao && <div className="max-w-xl space-y-3 rounded-md border border-border-subtle p-4">
        <h2 className="font-bold">Confira antes de salvar</h2>
        <p>Comissão: {percent(taxas!.comissaoBps)} → {percent(revisao.comissaoBps)}</p>
        <p>Taxa de serviço: {money(taxas!.servicoCentavos)} → {money(revisao.servicoCentavos)}</p>
        <p>Motivo: {revisao.motivo}</p>
        <div className="flex gap-3">
          <Button onClick={() => void salvar()} disabled={disabled}>{saving ? 'Salvando…' : 'Confirmar e salvar'}</Button>
          <Button variant="secondary" onClick={() => setRevisao(null)} disabled={saving}>Editar</Button>
        </div>
      </div>}
      <Button variant="secondary" onClick={() => void carregar()} disabled={loading || saving}>Recarregar taxas e histórico</Button>
      <h2 className="text-xl font-bold">Histórico de alterações</h2>
      {!loading && !historico.length && <p>Nenhuma alteração registrada.</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr>{['Data', 'Administrador', 'Comissão', 'Serviço', 'Motivo'].map((heading) => <th key={heading} className="p-2">{heading}</th>)}</tr></thead>
        <tbody>{historico.map((h) => <tr key={h.operacaoId} className="border-t border-border-subtle">
          <td className="p-2">{new Date(h.criadoEm).toLocaleString('pt-BR')}</td><td className="p-2">{h.atorId}</td>
          <td className="p-2">{percent(h.antes.comissaoBps)} → {percent(h.depois.comissaoBps)}</td>
          <td className="p-2">{money(h.antes.servicoCentavos)} → {money(h.depois.servicoCentavos)}</td><td className="p-2">{h.motivo}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  );
}
