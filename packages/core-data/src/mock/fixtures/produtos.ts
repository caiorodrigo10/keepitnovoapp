import type { Produto } from '../../ports/product.port';

/**
 * Foto real (Unsplash CDN) por produto — só para o mock visual (Épico 0).
 * URLs verificadas (HTTP 200 + conteúdo conferido); trocadas por uploads
 * do Lojista quando o catálogo real existir.
 */
const foto = (id: string) => `https://images.unsplash.com/photo-${id}?w=400&h=400&fit=crop&q=80`;

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
    foto_url: foto('1584308666744-24d5c474f2ae'),
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
    foto_url: foto('1556228578-8c89e6adf883'),
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
    foto_url: foto('1584362917165-526a968579e8'),
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
    foto_url: foto('1521572163474-6864f9cf17ab'),
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
    foto_url: foto('1542272604-787c3835535d'),
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
    foto_url: foto('1523362628745-0c100150b504'),
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
    foto_url: foto('1600952841320-db92ec4047ca'),
    ativo: true,
    excluido_em: null,
  },
];
