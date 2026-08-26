import Link from 'next/link';

import { AdminSidebarFooter } from '../../src/components/AdminSidebarFooter';
import { RequireAdminSession } from '../../src/components/RequireAdminSession';

const SECTIONS = [
  { href: '/aprovacoes', label: 'Aprovações' },
  { href: '/hubs', label: 'Hubs' },
  { href: '/reembolsos', label: 'Reembolsos' },
  { href: '/saques', label: 'Saques' },
  { href: '/pedidos', label: 'Pedidos' },
  { href: '/clientes', label: 'Clientes' },
  { href: '/lojistas', label: 'Lojistas' },
  { href: '/financeiro', label: 'Financeiro' },
  { href: '/qualidade-lojista', label: 'Qualidade Lojista' },
];

/**
 * Layout persistente do route group `(dashboard)` — Épico 0, Story 0.3
 * (AC2). Sidebar de navegação com links para todas as seções do inventário
 * das Stories 0.12–0.13, tema dark (`bg-bg-primary`/`text-text-primary`,
 * mesmo preset já estabelecido na Story 0.1).
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdminSession>
      <div className="flex min-h-screen bg-bg-shell">
        <aside className="flex w-64 shrink-0 flex-col border-r border-border-subtle bg-bg-primary p-5">
          <div className="mb-8 flex items-center gap-2 px-2">
            <span className="text-lg font-extrabold tracking-tight text-text-primary">KEEPITHUB</span>
            <span className="h-2 w-2 rounded-full bg-accent-brand" aria-hidden="true" />
          </div>
          <nav className="flex flex-col gap-1.5" aria-label="Navegação principal">
            {SECTIONS.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
              >
                {section.label}
              </Link>
            ))}
          </nav>
          <AdminSidebarFooter />
        </aside>
        <main className="flex-1 p-6 sm:p-8 lg:p-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </RequireAdminSession>
  );
}
