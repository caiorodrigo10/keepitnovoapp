'use client';

import { useState } from 'react';

import { getDataClient, type AccountDeletionRecord } from '@keepit/core-data';

import '../lib/dataClientBootstrap';
import { Button } from './Button';
import { Card } from './Card';

type PendingAction = 'identify' | 'schedule' | 'cancel' | 'signout' | null;
type CompletedAction = 'scheduled' | 'cancelled' | null;

function formatDeadline(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AccountDeletionPublicFlow() {
  const client = getDataClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [record, setRecord] = useState<AccountDeletionRecord | null>(null);
  const [completedAction, setCompletedAction] = useState<CompletedAction>(null);
  const [pendingCompletion, setPendingCompletion] = useState<CompletedAction>(null);
  const [sessionMustClose, setSessionMustClose] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  async function closeSession(): Promise<boolean> {
    try {
      await client.auth.signOut();
      setAuthenticated(false);
      setSessionMustClose(false);
      return true;
    } catch {
      setSessionMustClose(true);
      setError('Não foi possível encerrar a sessão. Tente sair novamente.');
      return false;
    }
  }

  async function handleIdentify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password || pending) return;

    setPending('identify');
    setError(null);
    setCompletedAction(null);
    let signedIn = false;
    try {
      await client.auth.signIn(email.trim(), password);
      signedIn = true;
      setAuthenticated(true);
      const deletion = await client.accountDeletion.status();
      setRecord(deletion);
      setPassword('');
    } catch {
      setRecord(null);
      if (signedIn) {
        const closed = await closeSession();
        if (closed) {
          setError('Não foi possível consultar a solicitação. Entre novamente e tente outra vez.');
        }
      } else {
        setAuthenticated(false);
        setError('Não foi possível identificar a conta ou consultar a solicitação.');
      }
    } finally {
      setPending(null);
    }
  }

  async function handleSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentPassword || pending) return;

    setPending('schedule');
    setError(null);
    try {
      const deletion = await client.accountDeletion.schedule(currentPassword);
      setCurrentPassword('');
      setRecord(deletion);
      setPendingCompletion('scheduled');
      if (await closeSession()) {
        setCompletedAction('scheduled');
        setPendingCompletion(null);
      }
    } catch {
      setError('Não foi possível agendar a exclusão. Confira sua senha e tente novamente.');
    } finally {
      setPending(null);
    }
  }

  async function handleCancel() {
    if (pending) return;

    setPending('cancel');
    setError(null);
    try {
      const deletion = await client.accountDeletion.cancel();
      setRecord(deletion);
      const cancelled = deletion === null || deletion.status === 'cancelled';
      if (cancelled) setPendingCompletion('cancelled');
      const closed = await closeSession();
      if (closed && cancelled) {
        setCompletedAction('cancelled');
        setPendingCompletion(null);
      } else if (closed && !cancelled) {
        setError('O prazo de recuperação terminou e a solicitação não pode mais ser cancelada.');
      }
    } catch {
      setError('Não foi possível recuperar a conta agora. Tente novamente.');
    } finally {
      setPending(null);
    }
  }

  async function handleSignOut() {
    if (pending) return;
    setPending('signout');
    setError(null);
    const completed = pendingCompletion;
    if (await closeSession()) {
      if (completed) setCompletedAction(completed);
      setPendingCompletion(null);
    }
    setPending(null);
  }

  function restart() {
    setEmail('');
    setPassword('');
    setCurrentPassword('');
    setRecord(null);
    setCompletedAction(null);
    setPendingCompletion(null);
    setSessionMustClose(false);
    setError(null);
  }

  const canSchedule = authenticated && (record === null || record.status === 'cancelled');
  const canCancel = authenticated && record?.status === 'scheduled';

  return (
    <div className="w-full max-w-lg">
      <div className="px-1">
        <div className="flex items-center gap-2.5">
          <span className="text-xl font-extrabold tracking-wide text-text-primary">KEEPITHUB</span>
          <span className="h-2.5 w-2.5 rounded-full bg-accent-brand" aria-hidden="true" />
        </div>
        <p className="mt-3 text-smd font-medium text-text-tertiary">Conta do cliente</p>
      </div>

      <Card className="mt-8 rounded-modal border-border-muted bg-bg-primary p-8 shadow-xl sm:p-10">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Exclusão de conta</h1>
        <p className="mt-2 text-md text-text-secondary">
          Consulte, agende ou recupere sua conta usando as próprias credenciais.
        </p>

        {completedAction ? (
          <div className="mt-8" aria-live="polite">
            <h2 className="text-xl font-bold text-text-primary">
              {completedAction === 'scheduled' ? 'Exclusão agendada' : 'Conta recuperada'}
            </h2>
            <p className="mt-2 text-md text-text-secondary">
              {completedAction === 'scheduled'
                ? record
                  ? `Você pode recuperar a conta até ${formatDeadline(record.deleteAt)}.`
                  : 'A solicitação foi registrada e a sessão foi encerrada com segurança.'
                : 'A solicitação foi cancelada. Sua sessão foi encerrada com segurança.'}
            </p>
            <Button className="mt-6 w-full" onClick={restart} variant="secondary">
              Fazer outra consulta
            </Button>
          </div>
        ) : sessionMustClose ? (
          <div className="mt-8" aria-live="polite">
            <h2 className="text-xl font-bold text-text-primary">
              {pendingCompletion ? 'A ação foi registrada' : 'Consulta indisponível'}
            </h2>
            <p className="mt-2 text-md text-text-secondary">
              Encerre esta sessão antes de continuar.
            </p>
            <Button
              className="mt-6 w-full"
              disabled={pending !== null}
              onClick={() => void handleSignOut()}
              variant="secondary"
            >
              {pending === 'signout' ? 'Saindo…' : 'Sair'}
            </Button>
          </div>
        ) : !authenticated ? (
          <form onSubmit={handleIdentify} className="mt-8 flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-smd font-semibold text-text-primary">E-mail</span>
              <input
                autoComplete="email"
                className="min-h-12 rounded-md border border-border-muted bg-bg-elevated px-4 text-md text-text-primary placeholder:text-text-placeholder focus:border-accent-brand focus:outline-none"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@exemplo.com"
                type="email"
                value={email}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-smd font-semibold text-text-primary">Senha</span>
              <input
                autoComplete="current-password"
                className="min-h-12 rounded-md border border-border-muted bg-bg-elevated px-4 text-md text-text-primary placeholder:text-text-placeholder focus:border-accent-brand focus:outline-none"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                type="password"
                value={password}
              />
            </label>
            <Button className="min-h-12 w-full text-md" disabled={pending !== null} type="submit">
              {pending === 'identify' ? 'Consultando…' : 'Continuar'}
            </Button>
          </form>
        ) : (
          <div className="mt-8">
            {record && record.status !== 'cancelled' ? (
              <div className="rounded-md border border-border-muted bg-bg-elevated p-4">
                <p className="text-smd font-semibold text-text-primary">Prazo informado</p>
                <p className="mt-1 text-md text-text-secondary">{formatDeadline(record.deleteAt)}</p>
              </div>
            ) : (
              <p className="text-md text-text-secondary">Nenhuma exclusão ativa foi encontrada.</p>
            )}

            {canSchedule ? (
              <form onSubmit={handleSchedule} className="mt-6 flex flex-col gap-4">
                <p className="text-md text-text-secondary">
                  O agendamento encerra esta sessão e abre um prazo de sete dias para recuperação.
                </p>
                <label className="flex flex-col gap-2">
                  <span className="text-smd font-semibold text-text-primary">Confirme sua senha</span>
                  <input
                    autoComplete="current-password"
                    className="min-h-12 rounded-md border border-border-muted bg-bg-elevated px-4 text-md text-text-primary placeholder:text-text-placeholder focus:border-accent-brand focus:outline-none"
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder="••••••••"
                    type="password"
                    value={currentPassword}
                  />
                </label>
                <Button disabled={pending !== null || !currentPassword} type="submit" variant="danger">
                  {pending === 'schedule' ? 'Agendando…' : 'Agendar exclusão'}
                </Button>
              </form>
            ) : null}

            {canCancel ? (
              <div className="mt-6">
                <p className="mb-4 text-md text-text-secondary">
                  Cancele antes do prazo para recuperar o acesso normal à conta.
                </p>
                <Button className="w-full" disabled={pending !== null} onClick={() => void handleCancel()}>
                  {pending === 'cancel' ? 'Recuperando…' : 'Recuperar minha conta'}
                </Button>
              </div>
            ) : null}

            {record && !canCancel && !canSchedule ? (
              <p className="mt-5 rounded-md bg-bg-elevated px-4 py-3 text-smd text-accent-warning">
                Esta solicitação não pode ser alterada por esta página.
              </p>
            ) : null}

            <Button
              className="mt-4 w-full"
              disabled={pending !== null}
              onClick={() => void handleSignOut()}
              variant="secondary"
            >
              {pending === 'signout' ? 'Saindo…' : 'Sair'}
            </Button>
          </div>
        )}

        {error ? (
          <p className="mt-5 rounded-md bg-bg-elevated px-3 py-2 text-smd text-accent-warning" role="alert">
            {error}
          </p>
        ) : null}

        <p className="mt-7 border-t border-border-subtle pt-5 text-center text-smd text-text-tertiary">
          O canal de suporte para este fluxo ainda não está disponível.
        </p>
      </Card>
    </div>
  );
}
