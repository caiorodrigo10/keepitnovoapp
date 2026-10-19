/**
 * @keepit/config/business-rules — listas de negócio "abertas" (não
 * placeholders financeiros/operacionais, ver JSDoc de `businessConfig` em
 * `./index.ts`) compartilháveis entre apps.
 *
 * [IDS] CREATE — Story 3.4 (Épico 3, AC1) descreve `categoria` como "dropdown
 * com lista aberta gerenciada em `packages/config/business-rules.ts`" — este
 * arquivo não existia antes desta Story. Difere do precedente de
 * `apps/lojista/src/lib/cnpj.ts` (Story 3.3, que optou por NÃO promover um
 * algoritmo de validação para `packages/config` — packages/config é para
 * "placeholders a fechar com o stakeholder"/listas de negócio, não
 * algoritmos determinísticos): uma lista de categorias é, ela sim, o tipo de
 * conteúdo que esse pacote já hospeda (valores operacionais compartilháveis
 * entre apps — Admin e Lojista podem precisar da mesma lista no futuro).
 *
 * `estabelecimentos.categoria` é `text NOT NULL` **sem `CHECK`**
 * (`docs/architecture/03-data-models.md#1.4`) — lista aberta de fato no
 * schema; esta constante é a UI de um subconjunto conhecido, não uma
 * enumeração fechada de banco.
 */

export interface CategoriaOption {
  value: string;
  label: string;
}

/**
 * Valores de `docs/prd/epics/3-lojista-aprovacao.md` (Story 3.4, AC1):
 * "alimentação, farmácia, vestuário, conveniência, higiene, cuidados, +outros
 * a definir" — os 4 primeiros já existiam em
 * `apps/lojista/src/screens/auth/cadastroDraft.ts` (Story 0.8);
 * `higiene`/`cuidados` são novos do Épico 3. `mercado`/`pet` são mantidos
 * porque já são usados por fixtures reais
 * (`packages/core-data/src/mock/fixtures/estabelecimentos.ts`,
 * `estab-mercado-do-bairro`/`estab-pet-shop-amigo`) — removê-los quebraria a
 * correspondência categoria↔fixture sem necessidade; "+outros a definir" é
 * nota de abertura futura do épico, não uma opção de UI a inventar agora.
 */
export const CATEGORIA_OPTIONS: readonly CategoriaOption[] = [
  { value: 'alimentacao', label: 'Alimentação' },
  { value: 'farmacia', label: 'Farmácia' },
  { value: 'vestuario', label: 'Vestuário' },
  { value: 'conveniencia', label: 'Conveniência' },
  { value: 'higiene', label: 'Higiene' },
  { value: 'cuidados', label: 'Cuidados' },
  { value: 'mercado', label: 'Mercado' },
  { value: 'pet', label: 'Pet' },
] as const;

/**
 * Story 4.4 (Dependencies item 3, AC1) — [IDS] CREATE seguindo EXATAMENTE o
 * precedente de `CATEGORIA_OPTIONS` acima (mesmo padrão de reconciliação:
 * "não remover valores já usados por fixtures reais sem necessidade").
 *
 * `categoria_produto` de `produtos` (domínio DIFERENTE de `categoria` de
 * `estabelecimentos` acima — categoria de PRODUTO, não de LOJA) — também
 * `text NOT NULL` **sem `CHECK`** (`docs/architecture/03-data-models.md#3.1`),
 * lista aberta de fato.
 *
 * Reconciliação: o texto do Épico 4 cita "Cuidados, Higiene, Alimentos,
 * Bebidas, Roupas, Acessórios", mas as fixtures REAIS já em uso
 * (`packages/core-data/src/mock/fixtures/produtos.ts`) usam `medicamentos`,
 * `cuidados`, `suplementos`, `vestuario`, `bebidas`, `snacks`. Os 6 valores
 * de fixture são MANTIDOS (removê-los quebraria a correspondência
 * categoria↔fixture sem necessidade); `higiene`/`alimentos` são ADICIONADOS
 * do texto do Épico (não cobertos por nenhuma fixture ainda). `vestuario`
 * cobre "Roupas"/"Acessórios" do texto do Épico — não duplicado como duas
 * categorias novas, mesmo valor de fixture já em uso.
 */
export const CATEGORIA_PRODUTO_OPTIONS: readonly CategoriaOption[] = [
  { value: 'medicamentos', label: 'Medicamentos' },
  { value: 'cuidados', label: 'Cuidados' },
  { value: 'higiene', label: 'Higiene' },
  { value: 'suplementos', label: 'Suplementos' },
  { value: 'alimentos', label: 'Alimentos' },
  { value: 'bebidas', label: 'Bebidas' },
  { value: 'snacks', label: 'Snacks' },
  { value: 'vestuario', label: 'Vestuário' },
] as const;
