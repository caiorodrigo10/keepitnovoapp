/**
 * Layout do route group `(auth)` — Épico 0, Story 0.3 (AC2).
 *
 * Layout mínimo, sem sidebar (o dashboard só aparece após login).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-shell px-5 py-10 sm:p-10">
      {children}
    </main>
  );
}
