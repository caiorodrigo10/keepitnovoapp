import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import SaindoParaHub from "./SaindoParaHub";

const state = vi.hoisted(() => ({
  pedido: {
    id: "pedido-1",
    hub_id: "hub-1",
    itens: [{ id: "item-1" }],
  } as { id: string; hub_id: string; itens: Array<{ id: string }> },
}));

vi.mock("react-native", () => ({
  StyleSheet: { create: (value: unknown) => value },
  Text: "span",
  View: "div",
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "div" }));
vi.mock("@keepit/ui-tokens", () => ({
  darkColors: { bg: { primary: "#000" }, text: { secondary: "#111" } },
  spacing: { 4: 0, 5: 0, 6: 0 },
  typography: { sizes: { md: { fontSize: 16, lineHeight: 20 } } },
}));
vi.mock("../../components/PedidoResumoCard", () => ({
  PedidoResumoCard: (props: { subtitle: string }) =>
    React.createElement("div", { "data-subtitle": props.subtitle }),
}));
vi.mock("../../components/PrimaryButton", () => ({ PrimaryButton: "button" }));
vi.mock("../../components/ScreenHeader", () => ({ ScreenHeader: "div" }));
vi.mock("./OrdersContext", () => ({
  useOrdersContext: () => ({
    getById: () => state.pedido,
    nomeHub: () => "Hub Teste Homologação",
  }),
}));

function renderSubtitle(itemCount: number): string {
  state.pedido = {
    id: "pedido-1",
    hub_id: "hub-1",
    itens: Array.from({ length: itemCount }, (_, i) => ({ id: `item-${i}` })),
  };
  const html = renderToStaticMarkup(
    React.createElement(SaindoParaHub, {
      navigation: { navigate: vi.fn() } as never,
      route: { params: { pedidoId: "pedido-1" } } as never,
    }),
  );
  const match = html.match(/data-subtitle="([^"]*)"/);
  return match?.[1] ?? "";
}

describe("SaindoParaHub (Pedido a caminho)", () => {
  it("usa singular para 1 item no subtítulo", () => {
    expect(renderSubtitle(1)).toBe("1 item · Hub Teste Homologação");
  });

  it("usa plural para mais de 1 item no subtítulo", () => {
    expect(renderSubtitle(2)).toBe("2 itens · Hub Teste Homologação");
  });
});
