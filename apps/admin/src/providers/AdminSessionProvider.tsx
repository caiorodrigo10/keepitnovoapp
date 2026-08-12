'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { onAdminAuthStateChange, signIn as adminSignIn, signOut as adminSignOut } from '../lib/adminAuth';
import type { Admin } from '../lib/adminAuth';

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

  useEffect(() => {
    const unsubscribe = onAdminAuthStateChange((nextAdmin) => {
      setAdmin(nextAdmin);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email: string, senha: string) => {
    const nextAdmin = await adminSignIn(email, senha);
    setAdmin(nextAdmin);
    return nextAdmin;
  }, []);

  const signOut = useCallback(async () => {
    await adminSignOut();
    setAdmin(null);
  }, []);

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
