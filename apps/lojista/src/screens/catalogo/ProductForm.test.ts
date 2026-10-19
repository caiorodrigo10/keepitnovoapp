import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  definirObrigatoriedadeGrupo,
  definirTipoGrupo,
  isValidComplementoGrupo,
  normalizarGrupoComplemento,
  ProductForm,
} from "./ProductForm";

const state = vi.hoisted(() => ({
  fields: [] as Array<{ label?: string; value?: string; onChangeText?: (v: string) => void }>,
  steppers: [] as Array<{ label: string; value: number; min: number; max: number; onChange: (value: number) => void }>,
  buttons: [] as Array<{ disabled?: boolean }>,
}));

vi.mock("react-native", () => ({
  Pressable: "div",
  ScrollView: "div",
  StyleSheet: { create: (value: unknown) => value },
  Text: "span",
  View: "div",
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "span" }));
vi.mock("@keepit/ui-tokens", () => ({
  darkColors: {
    bg: { surface: "#111", primary: "#000" },
    border: { muted: "#222" },
    text: { secondary: "#333", primary: "#fff", tertiary: "#444" },
    accent: { brand: "#0f0", warning: "#ff0" },
  },
  radii: { card: 0, md: 0 },
  spacing: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
  typography: { sizes: { lg: { fontSize: 18, lineHeight: 22 }, md: { fontSize: 16, lineHeight: 20 }, sm: { fontSize: 14, lineHeight: 18 }, base: { fontSize: 15, lineHeight: 20 } } },
}));
vi.mock("@keepit/config", () => ({ CATEGORIA_PRODUTO_OPTIONS: [] }));
vi.mock("../../components/FormField", () => ({
  FormField: (props: { label?: string; value?: string; onChangeText?: (v: string) => void }) => {
    state.fields.push(props);
    return null;
  },
}));
vi.mock("../../components/NumericStepper", () => ({
  NumericStepper: (props: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) => {
    state.steppers.push(props);
    return null;
  },
}));
vi.mock("../../components/PrimaryButton", () => ({
  PrimaryButton: (props: { disabled?: boolean }) => {
    state.buttons.push(props);
    return null;
  },
}));
vi.mock("../../components/ScreenHeader", () => ({ ScreenHeader: () => null }));
vi.mock("../../components/SelectField", () => ({ SelectField: () => null }));
vi.mock("./currentStore", () => ({ FARMACIA_TARJADO_AVISO: "aviso" }));

function precoFieldValue(precoTexto: string): string | undefined {
  state.fields = [];
  renderToStaticMarkup(
    React.createElement(ProductForm, {
      title: "Novo produto",
      submitLabel: "Salvar",
      initialValues: {
        nome: "Produto",
        descricao: "",
        precoTexto,
        categoria: "geral",
        fotoLocalUri: null,
        estoqueDisplay: 1,
      },
      isFarmacia: false,
      onSubmit: vi.fn(),
      onBack: vi.fn(),
    }),
  );
  return state.fields.find((f) => f.label === "Preço (R$)")?.value;
}

function renderWithGroups(gruposComplementos: NonNullable<React.ComponentProps<typeof ProductForm>["initialValues"]["gruposComplementos"]>) {
  state.fields = [];
  state.steppers = [];
  state.buttons = [];
  renderToStaticMarkup(
    React.createElement(ProductForm, {
      title: "Novo produto",
      submitLabel: "Salvar",
      initialValues: {
        nome: "Produto",
        descricao: "",
        precoTexto: "15,00",
        categoria: "geral",
        fotoLocalUri: null,
        estoqueDisplay: 1,
        gruposComplementos,
      },
      isFarmacia: false,
      onSubmit: vi.fn(),
      onBack: vi.fn(),
    }),
  );
}

describe("ProductForm campo Preço (bug O2)", () => {
  it("exibe o preço inicial já mascarado em pt-BR com centavos", () => {
    expect(precoFieldValue("15,99")).toBe("15,99");
    expect(precoFieldValue("1234,56")).toBe("1.234,56");
  });
});

describe("ProductForm complementos", () => {
  it("exibe os limites editáveis para um grupo de múltipla escolha", () => {
    renderWithGroups([
      {
        nome: "Adicionais",
        tipo: "multipla",
        min_selecoes: 1,
        max_selecoes: 2,
        ordem: 0,
        itens: [
          { nome: "Queijo", preco_extra_reais: 0, ordem: 0 },
          { nome: "Bacon", preco_extra_reais: 0, ordem: 1 },
        ],
      },
    ]);

    expect(state.steppers).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Mínimo de seleções", value: 1, min: 0, max: 2 }),
      expect.objectContaining({ label: "Máximo de seleções", value: 2, min: 1, max: 2 }),
    ]));
  });

  it("impede salvar quando há grupo inválido", () => {
    renderWithGroups([
      {
        nome: "",
        tipo: "unica",
        min_selecoes: 0,
        max_selecoes: 1,
        ordem: 0,
        itens: [{ nome: "", preco_extra_reais: 0, ordem: 0 }],
      },
    ]);

    expect(state.buttons.at(-1)?.disabled).toBe(true);
  });

  it("mantém produto sem grupos habilitado para salvar", () => {
    renderWithGroups([]);

    expect(state.buttons.at(-1)?.disabled).toBe(false);
  });

  it("normaliza grupo obrigatório com no mínimo uma seleção", () => {
    const grupo = definirObrigatoriedadeGrupo({
      nome: "Adicionais",
      tipo: "multipla",
      min_selecoes: 0,
      max_selecoes: 2,
      ordem: 0,
      itens: [
        { nome: "Queijo", preco_extra_reais: 0, ordem: 0 },
        { nome: "Bacon", preco_extra_reais: 0, ordem: 1 },
      ],
    }, true);

    expect(grupo.min_selecoes).toBe(1);
  });

  it("normaliza grupo opcional com mínimo zero", () => {
    const grupo = definirObrigatoriedadeGrupo({
      nome: "Adicionais",
      tipo: "multipla",
      min_selecoes: 1,
      max_selecoes: 2,
      ordem: 0,
      itens: [
        { nome: "Queijo", preco_extra_reais: 0, ordem: 0 },
        { nome: "Bacon", preco_extra_reais: 0, ordem: 1 },
      ],
    }, false);

    expect(grupo.min_selecoes).toBe(0);
  });

  it("limita máximo ao número de itens e mínimo ao máximo em múltipla escolha", () => {
    const grupo = normalizarGrupoComplemento({
      nome: "Adicionais",
      tipo: "multipla",
      min_selecoes: 8,
      max_selecoes: 9,
      ordem: 0,
      itens: [
        { nome: "Queijo", preco_extra_reais: 0, ordem: 0 },
        { nome: "Bacon", preco_extra_reais: 0, ordem: 1 },
      ],
    });

    expect(grupo).toMatchObject({ min_selecoes: 2, max_selecoes: 2 });
  });

  it("normaliza limites ao alternar entre única e múltipla", () => {
    const grupoMultipla = definirTipoGrupo({
      nome: "Adicionais",
      tipo: "unica",
      min_selecoes: 1,
      max_selecoes: 1,
      ordem: 0,
      itens: [
        { nome: "Queijo", preco_extra_reais: 0, ordem: 0 },
        { nome: "Bacon", preco_extra_reais: 0, ordem: 1 },
      ],
    }, "multipla");
    const grupoUnica = definirTipoGrupo({ ...grupoMultipla, max_selecoes: 2 }, "unica");

    expect(grupoMultipla).toMatchObject({ min_selecoes: 1, max_selecoes: 1 });
    expect(grupoUnica).toMatchObject({ min_selecoes: 1, max_selecoes: 1 });
  });

  it("rejeita limites inconsistentes, nomes vazios e grupos sem itens", () => {
    expect(isValidComplementoGrupo({
      nome: "",
      tipo: "unica",
      min_selecoes: 0,
      max_selecoes: 1,
      ordem: 0,
      itens: [{ nome: "Queijo", preco_extra_reais: 0, ordem: 0 }],
    })).toBe(false);
    expect(isValidComplementoGrupo({
      nome: "Adicionais",
      tipo: "multipla",
      min_selecoes: 0,
      max_selecoes: 1,
      ordem: 0,
      itens: [],
    })).toBe(false);
    expect(isValidComplementoGrupo({
      nome: "Adicionais",
      tipo: "multipla",
      min_selecoes: 2,
      max_selecoes: 1,
      ordem: 0,
      itens: [{ nome: "", preco_extra_reais: 0, ordem: 0 }],
    })).toBe(false);
  });
});
