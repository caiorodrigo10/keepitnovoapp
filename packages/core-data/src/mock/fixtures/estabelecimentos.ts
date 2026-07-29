import type { Estabelecimento, EstabelecimentoHorario } from '../../ports/store.port';

function horarioPadrao(): EstabelecimentoHorario[] {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    aberto: true,
    hora_abre: '09:00',
    hora_fecha: '19:00',
  }));
}

/** Fecha aos domingos (dia_semana 0) — usada para exercitar o estado "Fechada" fora de horário. */
function horarioSemDomingo(): EstabelecimentoHorario[] {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    aberto: dia_semana !== 0,
    hora_abre: dia_semana !== 0 ? '10:00' : null,
    hora_fecha: dia_semana !== 0 ? '18:00' : null,
  }));
}

/**
 * Fixtures derivadas do protótipo (`keepit-app/index.html`) — nomes
 * localizados via Grep: "Farmácia Vida" (loja com detalhe de produtos e
 * pedido #2048), "Loja Bem Vestir" (categoria vestuário), "Conveniência 24h".
 *
 * Estados representados (AC1 — Aberta/Fechada/Pausada):
 * - Farmácia Vida → ativa, `pausado_manualmente = false`, horário 7 dias → Aberta (na maioria dos horários testados).
 * - Loja Bem Vestir → ativa, `pausado_manualmente = true` → Pausada (independente do horário).
 * - Conveniência 24h → ativa, fecha aos domingos → Fechada aos domingos, Aberta no resto da semana.
 */
export const estabelecimentosFixture: Estabelecimento[] = [
  {
    id: 'estab-farmacia-vida',
    nome_fantasia: 'Farmácia Vida',
    categoria: 'farmacia',
    descricao: 'Farmácia de bairro com entrega rápida via Hub Centro.',
    foto_fachada_url: null,
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
    horarios: horarioPadrao(),
  },
  {
    id: 'estab-bem-vestir',
    nome_fantasia: 'Loja Bem Vestir',
    categoria: 'vestuario',
    descricao: 'Moda casual e acessórios.',
    foto_fachada_url: null,
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
    descricao: 'Itens do dia a dia, aberto todos os dias exceto domingo (fixture).',
    foto_fachada_url: null,
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
    horarios: horarioSemDomingo(),
  },
  {
    id: 'estab-mercadinho-noturno',
    nome_fantasia: 'Mercadinho Noturno',
    categoria: 'conveniencia',
    descricao: 'Suspenso após reincidência de chargebacks e reclamações.',
    foto_fachada_url: null,
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
    horarios: horarioPadrao(),
  },
  {
    id: 'estab-em-analise',
    nome_fantasia: 'Padoca Nova',
    categoria: 'alimentacao',
    descricao: 'Loja recém-cadastrada, aguardando aprovação do admin.',
    foto_fachada_url: null,
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
];
