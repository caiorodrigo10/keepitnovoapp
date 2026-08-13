import type { Estabelecimento, EstabelecimentoHorario } from '../../ports/store.port';

/**
 * Foto de fachada real (Unsplash CDN) por categoria de loja — só para dar
 * vida ao mock visual (Épico 0). URLs verificadas (HTTP 200 + conteúdo
 * conferido); `?w/h/fit/q` mantêm o thumbnail leve para carregar rápido no
 * StoreCard/Loja. Substituídas por uploads reais quando o Lojista existir.
 */
const foto = (id: string) => `https://images.unsplash.com/photo-${id}?w=400&h=400&fit=crop&q=80`;

function horarioPadrao(): EstabelecimentoHorario[] {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    aberto: true,
    hora_abre: '09:00',
    hora_fecha: '19:00',
  }));
}

/** Fecha aos domingos (dia_semana 0) — mantido para as fixtures que não são ativas (não afeta o demo público). */
function horarioSemDomingo(): EstabelecimentoHorario[] {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    aberto: dia_semana !== 0,
    hora_abre: dia_semana !== 0 ? '10:00' : null,
    hora_fecha: dia_semana !== 0 ? '18:00' : null,
  }));
}

/**
 * Modo Demo (`docs/architecture/09-modo-demo-mock.md` §3.2) — horário amplo
 * `00:00–23:59` nos 7 dias. Isto é DADO de teste, não regra de negócio: não
 * muda `deriveLojaEstado` nem a validação temporal (Story 5.3) — só garante
 * que a MAIORIA das lojas de demo apareça "Aberta" independentemente da
 * hora/dia em que o dono testar o app. Plausível para o próprio negócio
 * (farmácia 24h, conveniência 24h, etc.), sem inventar regra nova.
 */
function horarioAmplo(): EstabelecimentoHorario[] {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    aberto: true,
    hora_abre: '00:00',
    hora_fecha: '23:59',
  }));
}

/**
 * Modo Demo — janela estreita (padaria só de manhã) nos 7 dias, usada
 * DELIBERADAMENTE em UMA loja ativa para o demo exibir o estado "Fechada"
 * do protótipo (AC1) na maior parte do dia, sem depender de dia-da-semana.
 */
function horarioPadariaManha(): EstabelecimentoHorario[] {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    aberto: true,
    hora_abre: '06:00',
    hora_fecha: '11:00',
  }));
}

/**
 * Fixtures derivadas do protótipo (`keepit-app/index.html`) — nomes
 * localizados via Grep: "Farmácia Vida" (loja com detalhe de produtos e
 * pedido #2048), "Loja Bem Vestir" (categoria vestuário), "Conveniência 24h".
 * Enriquecidas para o Modo Demo (`docs/architecture/09-modo-demo-mock.md`
 * §3.4) — ~10 lojas ATIVAS variadas por categoria, a maioria com horário
 * amplo (sempre "Aberta"), mantendo EXATAMENTE 1 "Pausada" e 1 "Fechada"
 * propositais para exibir os 3 estados do protótipo (AC1).
 *
 * Estados representados (AC1 — Aberta/Fechada/Pausada):
 * - Farmácia Vida, Conveniência 24h + 6 lojas novas → ativas, horário amplo → Aberta.
 * - Loja Bem Vestir → ativa, `pausado_manualmente = true` → Pausada (independente do horário).
 * - Padaria Aurora → ativa, horário estreito (06:00–11:00) → Fechada na maior parte do dia.
 */
export const estabelecimentosFixture: Estabelecimento[] = [
  {
    id: 'estab-farmacia-vida',
    nome_fantasia: 'Farmácia Vida',
    categoria: 'farmacia',
    descricao: 'Farmácia de bairro com entrega rápida via Hub Centro.',
    foto_fachada_url: foto('1576602976047-174e57a47881'),
    endereco: 'Rua das Flores, 200 — Centro',
    lat: -23.551,
    lng: -46.6335,
    raio_atendimento_km: 3,
    tempo_medio_entrega_min: 20,
    taxa_deslocamento_reais: 4.9,
    ticket_minimo_reais: null,
    status: 'ativo',
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: false,
    horarios: horarioAmplo(),
  },
  {
    id: 'estab-bem-vestir',
    nome_fantasia: 'Loja Bem Vestir',
    categoria: 'vestuario',
    descricao: 'Moda casual e acessórios.',
    foto_fachada_url: foto('1441986300917-64674bd600d8'),
    endereco: 'Av. Central, 500 — Centro',
    lat: -23.5498,
    lng: -46.632,
    raio_atendimento_km: 4,
    tempo_medio_entrega_min: 30,
    taxa_deslocamento_reais: 5.9,
    ticket_minimo_reais: 30,
    status: 'ativo',
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: true,
    horarios: horarioPadrao(),
  },
  {
    id: 'estab-conveniencia-24h',
    nome_fantasia: 'Conveniência 24h',
    categoria: 'conveniencia',
    descricao: 'Itens do dia a dia, aberto 24 horas.',
    foto_fachada_url: foto('1604719312566-8912e9227c6a'),
    endereco: 'Rua das Flores, 50 — Centro',
    lat: -23.5502,
    lng: -46.6329,
    raio_atendimento_km: 2.5,
    tempo_medio_entrega_min: 15,
    taxa_deslocamento_reais: 3.5,
    ticket_minimo_reais: null,
    status: 'ativo',
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: false,
    horarios: horarioAmplo(),
  },
  {
    id: 'estab-padaria-aurora',
    nome_fantasia: 'Padaria Aurora',
    categoria: 'padaria',
    descricao: 'Pães e café fresquinhos, só no período da manhã.',
    foto_fachada_url: foto('1550989460-0adf9ea622e2'),
    endereco: 'Rua Aurora, 88 — Centro',
    lat: -23.5493,
    lng: -46.6341,
    raio_atendimento_km: 2,
    tempo_medio_entrega_min: 15,
    taxa_deslocamento_reais: 3.9,
    ticket_minimo_reais: null,
    status: 'ativo',
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: false,
    horarios: horarioPadariaManha(),
  },
  {
    id: 'estab-hortifruti-sabor-da-terra',
    nome_fantasia: 'Hortifruti Sabor da Terra',
    categoria: 'mercado',
    descricao: 'Frutas, verduras e legumes selecionados diariamente.',
    foto_fachada_url: foto('1516684732162-798a0062be99'),
    endereco: 'Rua dos Ipês, 210 — Jardins',
    lat: -23.5665,
    lng: -46.6552,
    raio_atendimento_km: 3,
    tempo_medio_entrega_min: 20,
    taxa_deslocamento_reais: 4.5,
    ticket_minimo_reais: null,
    status: 'ativo',
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: false,
    horarios: horarioAmplo(),
  },
  {
    id: 'estab-pet-center-amigo-fiel',
    nome_fantasia: 'Pet Center Amigo Fiel',
    categoria: 'pet',
    descricao: 'Ração, petiscos e acessórios para cães e gatos.',
    foto_fachada_url: foto('1583511655857-d19b40a7a54e'),
    endereco: 'Av. dos Ipês, 410 — Centro',
    lat: -23.5538,
    lng: -46.6362,
    raio_atendimento_km: 4,
    tempo_medio_entrega_min: 30,
    taxa_deslocamento_reais: 5.5,
    ticket_minimo_reais: 25,
    status: 'ativo',
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: false,
    horarios: horarioAmplo(),
  },
  {
    id: 'estab-boutique-elegance',
    nome_fantasia: 'Boutique Elegance',
    categoria: 'vestuario',
    descricao: 'Roupas e acessórios femininos e masculinos.',
    foto_fachada_url: foto('1490481651871-ab68de25d43d'),
    endereco: 'Av. Jardins, 320 — Jardins',
    lat: -23.5672,
    lng: -46.6564,
    raio_atendimento_km: 5,
    tempo_medio_entrega_min: 35,
    taxa_deslocamento_reais: 6.5,
    ticket_minimo_reais: 40,
    status: 'ativo',
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: false,
    horarios: horarioAmplo(),
  },
  {
    id: 'estab-mercadinho-da-esquina',
    nome_fantasia: 'Mercadinho da Esquina',
    categoria: 'conveniencia',
    descricao: 'Laticínios, bebidas e itens básicos do dia a dia.',
    foto_fachada_url: foto('1534723452862-4c874018d66d'),
    endereco: 'Rua Vila Nova, 45 — Vila Nova',
    lat: -23.5476,
    lng: -46.6205,
    raio_atendimento_km: 2,
    tempo_medio_entrega_min: 12,
    taxa_deslocamento_reais: 3.0,
    ticket_minimo_reais: null,
    status: 'ativo',
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: false,
    horarios: horarioAmplo(),
  },
  {
    id: 'estab-farmacia-popular-bairro',
    nome_fantasia: 'Farmácia Popular Bairro',
    categoria: 'farmacia',
    descricao: 'Medicamentos e produtos de cuidados pessoais com preço popular.',
    foto_fachada_url: foto('1587049352846-4a222e784d38'),
    endereco: 'Rua Vila Nova, 300 — Vila Nova',
    lat: -23.5485,
    lng: -46.6198,
    raio_atendimento_km: 3,
    tempo_medio_entrega_min: 18,
    taxa_deslocamento_reais: 4.2,
    ticket_minimo_reais: null,
    status: 'ativo',
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: false,
    horarios: horarioAmplo(),
  },
  {
    id: 'estab-emporio-caseiro',
    nome_fantasia: 'Empório Caseiro',
    categoria: 'alimentacao',
    descricao: 'Geleias, azeites e produtos artesanais selecionados.',
    foto_fachada_url: foto('1414235077428-338989a2e8c0'),
    endereco: 'Av. Central, 610 — Centro',
    lat: -23.5505,
    lng: -46.6318,
    raio_atendimento_km: 3.5,
    tempo_medio_entrega_min: 25,
    taxa_deslocamento_reais: 5.0,
    ticket_minimo_reais: 20,
    status: 'ativo',
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: false,
    horarios: horarioAmplo(),
  },
  {
    id: 'estab-mercadinho-noturno',
    nome_fantasia: 'Mercadinho Noturno',
    categoria: 'conveniencia',
    descricao: 'Suspenso após reincidência de chargebacks e reclamações.',
    foto_fachada_url: foto('1578916171728-46686eac8d58'),
    endereco: 'Rua Noturna, 88 — Vila Nova',
    lat: -23.548,
    lng: -46.6195,
    raio_atendimento_km: 3,
    tempo_medio_entrega_min: 25,
    taxa_deslocamento_reais: 4.5,
    ticket_minimo_reais: null,
    status: 'suspenso',
    motivo_rejeicao: null,
    motivo_suspensao: 'Reincidência de chargeback e reclamações de clientes (ver Qualidade do Lojista).',
    pausado_manualmente: false,
    // Não-ativo (não aparece no catálogo público) — horário sem domingo mantido só por variedade de fixture.
    horarios: horarioSemDomingo(),
  },
  {
    id: 'estab-em-analise',
    nome_fantasia: 'Padoca Nova',
    categoria: 'alimentacao',
    descricao: 'Loja recém-cadastrada, aguardando aprovação do admin.',
    foto_fachada_url: foto('1509440159596-0249088772ff'),
    endereco: 'Rua Nova, 10 — Centro',
    lat: -23.552,
    lng: -46.634,
    raio_atendimento_km: 2,
    tempo_medio_entrega_min: 25,
    taxa_deslocamento_reais: 4.0,
    ticket_minimo_reais: null,
    status: 'em_analise',
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: false,
    horarios: horarioPadrao(),
  },
  /**
   * Story 10.2 (AC1): Aprovações tinha só 1 lojista `em_analise`
   * ("Padoca Nova"). Adicionados +2 plausíveis, aditivo, mesmo padrão de
   * campos/horários das demais fixtures.
   */
  {
    id: 'estab-mercado-do-bairro',
    nome_fantasia: 'Mercado do Bairro',
    categoria: 'mercado',
    descricao: 'Mercado de vizinhança recém-cadastrado, aguardando aprovação do admin.',
    foto_fachada_url: foto('1542838132-92c53300491e'),
    endereco: 'Rua dos Girassóis, 120 — Vila Nova',
    lat: -23.5473,
    lng: -46.6202,
    raio_atendimento_km: 3,
    tempo_medio_entrega_min: 22,
    taxa_deslocamento_reais: 4.5,
    ticket_minimo_reais: null,
    status: 'em_analise',
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: false,
    horarios: horarioPadrao(),
  },
  {
    id: 'estab-pet-shop-amigo',
    nome_fantasia: 'Pet Shop Amigo',
    categoria: 'pet',
    descricao: 'Pet shop de bairro recém-cadastrado, aguardando aprovação do admin.',
    foto_fachada_url: foto('1601758228041-f3b2795255f1'),
    endereco: 'Av. dos Ipês, 340 — Centro',
    lat: -23.5535,
    lng: -46.6358,
    raio_atendimento_km: 3.5,
    tempo_medio_entrega_min: 28,
    taxa_deslocamento_reais: 5.0,
    ticket_minimo_reais: null,
    status: 'em_analise',
    motivo_rejeicao: null,
    motivo_suspensao: null,
    pausado_manualmente: false,
    horarios: horarioPadrao(),
  },
];
