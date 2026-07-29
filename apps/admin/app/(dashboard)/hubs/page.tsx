'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '../../../src/components/Badge';
import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { useAdminHubs } from '../../../src/hooks/useAdminHubs';
import { getAdminDataClient } from '../../../src/lib/adminClient';

/**
 * CRUD de Hubs — listagem. Épico 0, Story 0.12 (AC1, AC2).
 *
 * `?vazio=1` / `?erro=1` forçam os estados vazio/erro de carregamento (AC4
 * da Story 0.2), sem depender de backend real.
 */
export default function HubsPage() {
  const searchParams = useSearchParams();
  const forceEmpty = searchParams.get('vazio') === '1';
  const forceError = searchParams.get('erro') === '1';

  const { data: hubs, loading, error, refresh } = useAdminHubs({ forceEmpty, forceError });
  const [desativandoId, setDesativandoId] = useState<string | null>(null);

  function handleDesativar(id: string) {
    setDesativandoId(id);
    // [AUTO-DECISION] "Excluir" hub = soft-deactivate (hubsCrud.update com
    // ativo=false), NÃO hubsCrud.delete — hubs são referenciados por
    // pedidos.hub_id, remover a linha quebraria histórico (ver Dev Notes da
    // Story 0.12, Task 4).
    getAdminDataClient()
      .admin.hubsCrud.update(id, { ativo: false })
      .then(() => {
        setDesativandoId(null);
        refresh();
      })
      .catch(() => {
        setDesativandoId(null);
      });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Hubs</h1>
          <p className="text-sm text-text-secondary">Pontos de retirada cadastrados.</p>
        </div>
        <Link
          href="/hubs/novo"
          className="shrink-0 rounded-sm bg-accent-brand px-4 py-2 text-sm font-semibold text-bg-shell hover:opacity-90"
        >
          + Novo Hub
        </Link>
      </div>

      {loading && <p className="text-sm text-text-tertiary">Carregando hubs…</p>}

      {!loading && error && (
        <Card className="border-accent-warning/40">
          <p className="mb-3 text-sm text-accent-warning">Erro ao carregar hubs: {error.message}</p>
          <button
            type="button"
            onClick={refresh}
            className="text-sm font-semibold text-accent-brand underline underline-offset-2"
          >
            Tentar novamente
          </button>
        </Card>
      )}

      {!loading && !error && hubs.length === 0 && (
        <Card>
          <p className="text-sm text-text-secondary">Nenhum hub cadastrado — MVP espera 4-5 hubs.</p>
        </Card>
      )}

      {!loading && !error && hubs.length > 0 && (
        <div className="flex flex-col gap-3">
          {hubs.map((hub) => (
            <Card key={hub.id} className="flex items-center justify-between gap-4">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-base font-semibold text-text-primary">{hub.nome}</span>
                  <Badge variant={hub.ativo ? 'success' : 'neutral'}>{hub.ativo ? 'Ativo' : 'Inativo'}</Badge>
                </div>
                <p className="text-sm text-text-secondary">{hub.endereco}</p>
                {hub.ponto_referencia && (
                  <p className="text-xs text-text-tertiary">Ref.: {hub.ponto_referencia}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/hubs/${hub.id}`}
                  className="rounded-sm bg-bg-elevated px-4 py-2 text-sm font-semibold text-text-primary hover:bg-bg-overlay"
                >
                  Editar
                </Link>
                <Button variant="danger" onClick={() => handleDesativar(hub.id)} disabled={desativandoId === hub.id}>
                  {desativandoId === hub.id ? 'Excluindo…' : 'Excluir'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
