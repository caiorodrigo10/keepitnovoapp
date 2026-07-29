import type { Hub, HubHorario } from '../../ports/hub.port';

/** Horário padrão 08:00–20:00 todos os dias — usado pelo Hub Centro no protótipo. */
function horarioPadrao(): HubHorario[] {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    aberto: true,
    hora_abre: '08:00',
    hora_fecha: '20:00',
  }));
}

/**
 * Fixtures derivadas do protótipo (`keepit-app/index.html`) — nomes
 * localizados via Grep: "Hub Centro", "Hub Jardins", "Hub Vila Nova".
 * Apenas "Hub Centro" é usado nas demais fixtures (lojas/pedidos) por ser
 * o único hub com contexto detalhado no protótipo; os outros dois existem
 * só como opções de lista/seleção de hub.
 */
export const hubsFixture: Hub[] = [
  {
    id: 'hub-centro',
    nome: 'Hub Centro',
    endereco: 'Rua das Flores, 123 — Centro',
    lat: -23.55052,
    lng: -46.633308,
    ponto_referencia: 'Em frente à praça central',
    foto_url: null,
    ativo: true,
    horarios: horarioPadrao(),
  },
  {
    id: 'hub-jardins',
    nome: 'Hub Jardins',
    endereco: 'Av. Jardins, 456 — Jardins',
    lat: -23.567,
    lng: -46.6558,
    ponto_referencia: null,
    foto_url: null,
    ativo: true,
    horarios: horarioPadrao(),
  },
  {
    id: 'hub-vila-nova',
    nome: 'Hub Vila Nova',
    endereco: 'Rua Vila Nova, 789 — Vila Nova',
    lat: -23.548,
    lng: -46.62,
    ponto_referencia: null,
    foto_url: null,
    ativo: true,
    horarios: horarioPadrao(),
  },
];
