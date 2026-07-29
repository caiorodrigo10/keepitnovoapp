/**
 * Componente de página stub — Épico 0, Story 0.3 (AC2, AC3).
 *
 * Renderiza um `<h1>{título}</h1>` mínimo dentro do layout do dashboard,
 * sem lógica/dados nem chamada de rede/backend. Conteúdo real de cada
 * seção fica para as Stories 0.12–0.13.
 *
 * [IDS] REUSE: um único componente evita duplicar o mesmo JSX em ~13
 * arquivos `page.tsx` do Admin.
 */
export function PageStub({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
    </div>
  );
}
