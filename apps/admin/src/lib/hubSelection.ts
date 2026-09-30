interface HubSelectionState {
  pending: boolean;
  hubAtivo: boolean;
  selecionado: boolean;
}

export function isHubSelectionDisabled({ pending, hubAtivo, selecionado }: HubSelectionState): boolean {
  return pending || (!hubAtivo && !selecionado);
}

export function canSubmitHubApproval(
  hubs: ReadonlyArray<{ id: string; ativo: boolean }>,
  selectedHubIds: ReadonlyArray<string>,
): boolean {
  if (selectedHubIds.length === 0) return false;
  const activeById = new Map(hubs.map((hub) => [hub.id, hub.ativo]));
  return selectedHubIds.every((id) => activeById.get(id) === true);
}
