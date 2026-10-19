// Testes de tela do lojista renderizam componentes com react-dom/server
// (sem react-test-renderer neste app). O pacote nao traz @types/react-dom,
// entao declaramos so a superficie usada pelos testes.
declare module "react-dom/server" {
  import type { ReactElement } from "react";
  export function renderToStaticMarkup(element: ReactElement): string;
}
