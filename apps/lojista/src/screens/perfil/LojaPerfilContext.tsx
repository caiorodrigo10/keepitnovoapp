import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import { createInitialLojaPerfilDraft, type LojaPerfilDraft } from './lojaPerfilDraft';

interface LojaPerfilContextValue {
  perfil: LojaPerfilDraft;
  updatePerfil: (patch: Partial<LojaPerfilDraft>) => void;
}

const LojaPerfilContext = createContext<LojaPerfilContextValue | null>(null);

/**
 * Provider do perfil da loja — Story 0.8 (Task 9/10). Envolve `PerfilStack`
 * para compartilhar o estado entre `Configuracoes` (card-resumo) e
 * `PerfilPublico` (edição) sem persistência real.
 */
export function LojaPerfilProvider({ children }: PropsWithChildren) {
  const [perfil, setPerfil] = useState<LojaPerfilDraft>(createInitialLojaPerfilDraft);

  const value = useMemo<LojaPerfilContextValue>(
    () => ({
      perfil,
      updatePerfil: (patch) => setPerfil((previous) => ({ ...previous, ...patch })),
    }),
    [perfil],
  );

  return <LojaPerfilContext.Provider value={value}>{children}</LojaPerfilContext.Provider>;
}

export function useLojaPerfil(): LojaPerfilContextValue {
  const context = useContext(LojaPerfilContext);
  if (!context) {
    throw new Error('useLojaPerfil deve ser usado dentro de <LojaPerfilProvider>.');
  }
  return context;
}
