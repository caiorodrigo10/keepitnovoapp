'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '../../../src/components/Badge';
import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { useClientesOps } from '../../../src/hooks/useAdminOps';
import { getAdminDataClient } from '../../../src/lib/adminClient';

/**
 * Lista de clientes + bloquear — Épico 0, Story 0.13 (Task 6, AC1-3), religado
 * para `client.admin.listClientes`/`blockCliente`/`unblockCliente` (Story
 * 1.10, Task 4). Indicador de `bloqueado = true` (espelha
 * `idx_clientes_bloqueado`); "Bloquear"/"Desbloquear" exigem motivo
 * obrigatório (espelha `motivo_bloqueio`) apenas para bloquear.
 */
export default function ClientesPage() {
  const searchParams = useSearchParams();
  const forceEmpty = searchParams.get('vazio') === '1';
  const forceError = searchParams.get('erro') === '1';

  const [busca, setBusca] = useState('');
  const { data: clientes, loading, error, refresh } = useClientesOps({ busca }, { forceEmpty, forceError });

  const [alvoBloqueioId, setAlvoBloqueioId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [motivoTocado, setMotivoTocado] = useState(false);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Error | null>(null);

  function handleBloquear(clienteId: string) {
    setMotivoTocado(true);
    if (motivo.trim().length === 0) {
      return;
    }
    setActionPendingId(clienteId);
    setActionError(null);

    getAdminDataClient()
      .admin.blockCliente(clienteId, motivo.trim())
      .then(() => {
        setActionPendingId(null);
        setAlvoBloqueioId(null);
        setMotivo('');
        setMotivoTocado(false);
        refresh();
      })
      .catch((err: unknown) => {
        setActionPendingId(null);
        setActionError(err instanceof Error ? err : new Error(String(err)));
      });
  }

  function handleDesbloquear(clienteId: string) {
    setActionPendingId(clienteId);
    setActionError(null);

    getAdminDataClient()
      .admin.unblockCliente(clienteId)
      .then(() => {
        setActionPendingId(null);
        refresh();
      })
      .catch((err: unknown) => {
        setActionPendingId(null);
        setActionError(err instanceof Error ? err : new Error(String(err)));
      });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Clientes</h1>
        <p className="text-sm text-text-secondary">Busque por nome ou telefone e bloqueie clientes problemáticos.</p>
      </div>

      <input
        value={busca}
        onChange={(event) => setBusca(event.target.value)}
        placeholder="Buscar por nome ou telefone…"
        className="max-w-sm rounded-sm border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent-brand focus:outline-none"
      />

      {actionError && (
        <Card className="border-accent-warning/40">
          <p className="text-sm text-accent-warning">Falha ao processar ação: {actionError.message}</p>
        </Card>
      )}

      {loading && <p className="text-sm text-text-tertiary">Carregando clientes…</p>}

      {!loading && error && (
        <Card className="border-accent-warning/40">
          <p className="mb-3 text-sm text-accent-warning">Erro ao carregar clientes: {error.message}</p>
          <button
            type="button"
            onClick={refresh}
            className="text-sm font-semibold text-accent-brand underline underline-offset-2"
          >
            Tentar novamente
          </button>
        </Card>
      )}

      {!loading && !error && clientes.length === 0 && (
        <Card>
          <p className="text-sm text-text-secondary">Nenhum cliente encontrado.</p>
        </Card>
      )}

      {!loading && !error && clientes.length > 0 && (
        <div className="flex flex-col gap-3">
          {clientes.map((cliente) => (
            <Card key={cliente.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-base font-semibold text-text-primary">{cliente.nome}</span>
                    {cliente.bloqueado && <Badge variant="danger">Bloqueado</Badge>}
                  </div>
                  <p className="text-sm text-text-secondary">{cliente.telefone}</p>
                  {cliente.bloqueado && cliente.motivo_bloqueio && (
                    <p className="text-xs text-text-tertiary">Motivo: {cliente.motivo_bloqueio}</p>
                  )}
                </div>
                {cliente.bloqueado ? (
                  <Button
                    variant="secondary"
                    onClick={() => handleDesbloquear(cliente.id)}
                    disabled={actionPendingId === cliente.id}
                  >
                    {actionPendingId === cliente.id ? 'Desbloqueando…' : 'Desbloquear'}
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    onClick={() => setAlvoBloqueioId(alvoBloqueioId === cliente.id ? null : cliente.id)}
                    disabled={actionPendingId === cliente.id}
                  >
                    Bloquear
                  </Button>
                )}
              </div>

              {alvoBloqueioId === cliente.id && (
                <div className="flex flex-col gap-2 border-t border-border-default pt-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold uppercase tracking-section text-text-tertiary">
                      Motivo do bloqueio (obrigatório)
                    </span>
                    <textarea
                      value={motivo}
                      onChange={(event) => setMotivo(event.target.value)}
                      onBlur={() => setMotivoTocado(true)}
                      rows={2}
                      placeholder="Explique por que este cliente está sendo bloqueado…"
                      className="rounded-sm border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent-brand focus:outline-none"
                    />
                    {motivoTocado && motivo.trim().length === 0 && (
                      <span className="text-xs text-accent-warning">Motivo é obrigatório para bloquear.</span>
                    )}
                  </label>
                  <div>
                    <Button
                      variant="danger"
                      onClick={() => handleBloquear(cliente.id)}
                      disabled={actionPendingId === cliente.id || motivo.trim().length === 0}
                    >
                      {actionPendingId === cliente.id ? 'Bloqueando…' : 'Confirmar bloqueio'}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
