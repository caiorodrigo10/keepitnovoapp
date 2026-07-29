/**
 * Card com sombra suave (`shadow-card`, token `0 2px 8px rgba(0,0,0,.12)`) e
 * cantos arredondados (`rounded-card`) — padrão de card documentado em
 * `ENTENDIMENTO_APP.md#Sistema de design`, reutilizado em todas as listas do
 * Admin (lojistas pendentes, hubs).
 */
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-border-default bg-bg-surface p-5 shadow-card ${className}`}>
      {children}
    </div>
  );
}
