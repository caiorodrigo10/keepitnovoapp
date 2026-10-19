type ComplementoHistorico = {
  grupoId?: string;
  grupoNome?: string;
  itemNome: string;
  precoExtraCentavos: number;
};

type PedidoParaSeparacao = {
  itens: ReadonlyArray<{
    separado: boolean;
    complementos_snapshot?: ReadonlyArray<ComplementoHistorico> | null;
  }>;
};

function textoPreco(precoExtraCentavos: number) {
  return precoExtraCentavos
    ? `+R$ ${(precoExtraCentavos / 100).toFixed(2).replace('.', ',')}`
    : 'Grátis';
}

/** Apresenta o snapshot persistido sem consultar o catálogo atual. */
export function linhasDeComplementos(snapshot: ReadonlyArray<ComplementoHistorico> | null | undefined): string[] {
  const grupos = new Map<string, { nome: string; itens: ComplementoHistorico[] }>();

  for (const complemento of snapshot ?? []) {
    const grupoId = complemento.grupoId?.trim();
    const grupoNome = complemento.grupoNome?.trim();
    const chave = grupoId ? `id:${grupoId}` : grupoNome ? `nome:${grupoNome}` : 'legado';
    const grupo = grupos.get(chave) ?? { nome: grupoNome || 'Complementos', itens: [] };
    if (grupo.nome === 'Complementos' && grupoNome) grupo.nome = grupoNome;
    grupo.itens.push(complemento);
    grupos.set(chave, grupo);
  }

  return [...grupos.values()].map(({ nome, itens }) =>
    `${nome}: ${itens.map((item) => `${item.itemNome} (${textoPreco(item.precoExtraCentavos)})`).join(', ')} · por unidade`,
  );
}

/** Estado visual derivado exclusivamente do checklist persistido do pedido. */
export function separacaoPedidoPresentation(pedido: PedidoParaSeparacao) {
  const separados = pedido.itens.filter((item) => item.separado).length;
  const total = pedido.itens.length;
  return {
    separados,
    total,
    todosSeparados: total > 0 && separados === total,
    complementosPorItem: pedido.itens.map((item) => linhasDeComplementos(item.complementos_snapshot)),
  };
}
