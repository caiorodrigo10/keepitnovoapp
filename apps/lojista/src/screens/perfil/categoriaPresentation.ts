import { CATEGORIA_OPTIONS } from '@keepit/config';

/** Mostra o rótulo conhecido sem alterar categorias abertas vindas do banco. */
export function formatCategoriaLoja(categoria: string): string {
  return CATEGORIA_OPTIONS.find((option) => option.value === categoria)?.label ?? categoria;
}
