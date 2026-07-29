import type { Produto } from '../../ports/product.port';

/**
 * Fixtures derivadas do protótipo (`keepit-app/index.html`) — preços de
 * produtos da Farmácia Vida localizados via Grep (R$ 14,90 / R$ 39,90 /
 * R$ 68,30, presentes no carrinho e no pedido #2048 exibido no protótipo).
 * Produtos das demais lojas são fixtures mínimas viáveis (nomes genéricos),
 * pois o protótipo não detalha catálogo de "Loja Bem Vestir" / "Conveniência 24h".
 */
export const produtosFixture: Produto[] = [
  {
    id: 'produto-dipirona',
    estabelecimento_id: 'estab-farmacia-vida',
    nome: 'Dipirona Monoidratada 500mg',
    descricao: 'Caixa com 10 comprimidos.',
    preco_reais: 14.9,
    categoria_produto: 'medicamentos',
    foto_url: null,
    ativo: true,
    excluido_em: null,
  },
  {
    id: 'produto-protetor-solar',
    estabelecimento_id: 'estab-farmacia-vida',
    nome: 'Protetor Solar FPS 60',
    descricao: '120ml.',
    preco_reais: 39.9,
    categoria_produto: 'cuidados',
    foto_url: null,
    ativo: true,
    excluido_em: null,
  },
  {
    id: 'produto-multivitaminico',
    estabelecimento_id: 'estab-farmacia-vida',
    nome: 'Multivitamínico Adulto',
    descricao: 'Frasco com 30 cápsulas.',
    preco_reais: 68.3,
    categoria_produto: 'suplementos',
    foto_url: null,
    ativo: true,
    excluido_em: null,
  },
  {
    id: 'produto-camiseta-basica',
    estabelecimento_id: 'estab-bem-vestir',
    nome: 'Camiseta Básica Algodão',
    descricao: 'Disponível em várias cores.',
    preco_reais: 45.0,
    categoria_produto: 'vestuario',
    foto_url: null,
    ativo: true,
    excluido_em: null,
  },
  {
    id: 'produto-calca-jeans',
    estabelecimento_id: 'estab-bem-vestir',
    nome: 'Calça Jeans Reta',
    descricao: null,
    preco_reais: 159.0,
    categoria_produto: 'vestuario',
    foto_url: null,
    ativo: true,
    excluido_em: null,
  },
  {
    id: 'produto-agua-mineral',
    estabelecimento_id: 'estab-conveniencia-24h',
    nome: 'Água Mineral 500ml',
    descricao: null,
    preco_reais: 3.9,
    categoria_produto: 'bebidas',
    foto_url: null,
    ativo: true,
    excluido_em: null,
  },
  {
    id: 'produto-salgadinho',
    estabelecimento_id: 'estab-conveniencia-24h',
    nome: 'Salgadinho 100g',
    descricao: null,
    preco_reais: 9.24,
    categoria_produto: 'snacks',
    foto_url: null,
    ativo: true,
    excluido_em: null,
  },
];
