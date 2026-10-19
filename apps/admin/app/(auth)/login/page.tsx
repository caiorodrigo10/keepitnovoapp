'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { useAdminSession } from '../../../src/providers/AdminSessionProvider';

/**
 * Tela de login — Épico 0, Story 0.12 (AC1) + Story 10.1 (AC2, AC3).
 * `signIn` do mock local (`adminAuth.ts`) valida por e-mail (senha
 * ignorada); sucesso define a sessão e navega para `/aprovacoes`, erro
 * mostra mensagem sem navegar. Se já houver sessão ao abrir `/login`,
 * redireciona direto (AC3).
 */
export default function LoginPage() {
  const router = useRouter();
  const { admin, loading, signIn } = useAdminSession();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && admin) {
      router.replace('/aprovacoes');
    }
  }, [loading, admin, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setSubmitting(true);
    try {
      await signIn(email, senha);
      router.push('/aprovacoes');
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="px-1">
        <div className="flex items-center gap-2.5">
          <span className="text-xl font-extrabold tracking-wide text-text-primary">KEEPITHUB</span>
          <span className="h-2.5 w-2.5 rounded-full bg-accent-brand" aria-hidden="true" />
        </div>
        <p className="mt-3 text-smd font-medium text-text-tertiary">Central de operação</p>
      </div>

      <Card className="mt-8 rounded-modal border-border-muted bg-bg-primary p-8 shadow-xl sm:p-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">Entrar no Admin</h1>
          <p className="mt-2 text-md text-text-secondary">Acesse para gerenciar a operação Keepit.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="text-smd font-semibold text-text-primary">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@keepit.com.br"
              className="min-h-12 rounded-md border border-border-muted bg-bg-elevated px-4 text-md text-text-primary placeholder:text-text-placeholder transition-colors focus:border-accent-brand focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-smd font-semibold text-text-primary">Senha</span>
            <input
              type="password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              placeholder="••••••••"
              className="min-h-12 rounded-md border border-border-muted bg-bg-elevated px-4 text-md text-text-primary placeholder:text-text-placeholder transition-colors focus:border-accent-brand focus:outline-none"
            />
          </label>
          {erro ? <p className="rounded-md bg-bg-elevated px-3 py-2 text-smd text-accent-warning">{erro}</p> : null}
          <Button type="submit" disabled={submitting} className="mt-1 min-h-12 w-full text-md">
            {submitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        <p className="mt-7 border-t border-border-subtle pt-5 text-center text-smd text-text-tertiary">
          Ambiente interno Keepit
        </p>
      </Card>
    </div>
  );
}
