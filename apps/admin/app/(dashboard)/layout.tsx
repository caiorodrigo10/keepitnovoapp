import Link from 'next/link';

const SECTIONS = [
  { href: '/aprovacoes', label: 'Aprovações' },
  { href: '/hubs', label: 'Hubs' },
  { href: '/reembolsos', label: 'Reembolsos' },
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
    <div className="flex min-h-screen bg-bg-primary">
      <aside className="w-60 shrink-0 border-r border-border-default bg-bg-surface p-4">
        <div className="mb-6 flex items-center gap-2">
          <span className="text-lg font-extrabold text-text-primary">keepit</span>
          <span className="h-2 w-2 rounded-full bg-accent-brand" aria-hidden="true" />
        </div>
        <nav className="flex flex-col gap-1">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
            >
              {section.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
