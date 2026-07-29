'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';

/**
 * Tela de login — Épico 0, Story 0.12 (AC1). Sem Supabase Auth: campos
 * renderizam, "Entrar" apenas navega para `(dashboard)` (guard stub da
 * Story 0.3 sempre deixa passar). Fora de escopo: submit real, validação de
 * credenciais.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push('/aprovacoes');
  }

  return (
    <Card className="w-full max-w-sm">
      <div className="mb-6 flex items-center gap-2">
        <span className="text-xl font-extrabold text-text-primary">keepit</span>
        <span className="h-2 w-2 rounded-full bg-accent-brand" aria-hidden="true" />
      </div>
      <h1 className="mb-1 text-lg font-bold text-text-primary">Admin</h1>
      <p className="mb-6 text-sm text-text-secondary">Entre para gerenciar lojistas e hubs.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-section text-text-tertiary">E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@keepit.com.br"
            className="rounded-sm border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent-brand focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-section text-text-tertiary">Senha</span>
          <input
            type="password"
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
            placeholder="••••••••"
            className="rounded-sm border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent-brand focus:outline-none"
          />
        </label>
        <Button type="submit">Entrar</Button>
      </form>
    </Card>
  );
}
