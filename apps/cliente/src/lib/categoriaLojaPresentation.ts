import { CATEGORIA_OPTIONS } from '@keepit/config';

function normalizarCategoria(categoria: string): string {
  return categoria.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Mostra o rótulo conhecido sem alterar categorias abertas vindas do banco. */
export function formatCategoriaLoja(categoria: string): string {
  const categoriaNormalizada = normalizarCategoria(categoria);

  return CATEGORIA_OPTIONS.find((option) => option.value === categoriaNormalizada)?.label ?? categoria;
}
