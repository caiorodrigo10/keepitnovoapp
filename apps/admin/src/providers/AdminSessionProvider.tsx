'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { onAdminAuthStateChange, signIn as adminSignIn, signOut as adminSignOut } from '../lib/adminAuth';
import type { Admin } from '../lib/adminAuth';
import { bootstrapAdminDataClient } from '../lib/dataClientBootstrap';

type AdminSessionContextValue = {
  admin: Admin | null;
  loading: boolean;
  signIn: (email: string, senha: string) => Promise<Admin>;
  signOut: () => Promise<void>;
};

const AdminSessionContext = createContext<AdminSessionContextValue | undefined>(undefined);

/**
 * Provider de sessão do Admin — Story 10.1 (Task 2).
 *
 * Client boundary inserido dentro do `<body>` do root layout (Server
 * Component) — não transforma a árvore inteira em client, só este wrapper.
 *
 * No mount, restaura a sessão de `sessionStorage` via `onAdminAuthStateChange`
 * (que já dispara com o estado restaurado). `loading` começa `true` e vira
 * `false` assim que o primeiro callback do subscribe chega — evita "piscar"
 * a tela de login para quem já tem sessão (AC5).
 */
export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    void bootstrapAdminDataClient({ recover: bootstrapAttempt > 0 }).then(
      () => {
        if (!mounted) return;
        unsubscribe = onAdminAuthStateChange((nextAdmin) => {
          if (!mounted) return;
          setAdmin(nextAdmin);
          setLoading(false);
          setBootstrapReady(true);
        });
      },
      () => {
        if (!mounted) return;
        setLoading(false);
        setBootstrapError(true);
      },
    );

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [bootstrapAttempt]);

  const signIn = useCallback(async (email: string, senha: string) => {
    const nextAdmin = await adminSignIn(email, senha);
    setAdmin(nextAdmin);
    return nextAdmin;
  }, []);

  const signOut = useCallback(async () => {
    await adminSignOut();
    setAdmin(null);
  }, []);

  const retryBootstrap = useCallback(() => {
    setBootstrapReady(false);
    setBootstrapError(false);
    setLoading(true);
    setBootstrapAttempt((current) => current + 1);
  }, []);

  if (bootstrapError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg-primary px-6" role="alert">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-text-primary">Serviço indisponível</h1>
          <p className="mt-3 text-text-secondary">
            Não foi possível conectar aos dados. Verifique a configuração e tente novamente.
          </p>
          <button
            className="mt-6 rounded-lg bg-primary px-5 py-3 font-semibold text-white"
            onClick={retryBootstrap}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  if (!bootstrapReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg-primary px-6">
        <p className="text-text-secondary">Conectando aos dados…</p>
      </main>
    );
  }

  return (
    <AdminSessionContext.Provider value={{ admin, loading, signIn, signOut }}>{children}</AdminSessionContext.Provider>
  );
}

export function useAdminSession(): AdminSessionContextValue {
  const context = useContext(AdminSessionContext);
  if (!context) {
    throw new Error('useAdminSession deve ser usado dentro de <AdminSessionProvider>');
  }
  return context;
}
