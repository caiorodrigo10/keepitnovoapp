import type { Hub, HubHorario } from '../../ports/hub.port';

/**
 * Foto real (Unsplash CDN) do ponto de retirada — encomendas prontas para
 * retirar, coerente com o modelo click-and-collect do Hub Keepit. Só para o
 * mock visual (Épico 0); mesma imagem nos 3 hubs por consistência de marca.
 */
const FOTO_HUB = 'https://images.unsplash.com/photo-1580674285054-bed31e145f59?w=400&h=400&fit=crop&q=80';

/**
 * Modo Demo (`docs/architecture/09-modo-demo-mock.md` §3.4) — horário amplo
 * `00:00–23:59` nos 7 dias. DADO de teste (não regra de negócio): evita que
 * `podeFinalizarNoHorario` (`apps/cliente/src/lib/checkoutValidation.ts`,
 * Story 6.3) bloqueie o checkout do demo por o hub estar "fechado" perto do
 * fim do horário comercial — mesmo racional já aplicado às lojas em
 * `estabelecimentos.ts#horarioAmplo`.
 */
function horarioAmplo(): HubHorario[] {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    aberto: true,
    hora_abre: '00:00',
    hora_fecha: '23:59',
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
    foto_url: FOTO_HUB,
    ativo: true,
    horarios: horarioAmplo(),
  },
  {
    id: 'hub-jardins',
    nome: 'Hub Jardins',
    endereco: 'Av. Jardins, 456 — Jardins',
    lat: -23.567,
    lng: -46.6558,
    ponto_referencia: null,
    foto_url: FOTO_HUB,
    ativo: true,
    horarios: horarioAmplo(),
  },
  {
    id: 'hub-vila-nova',
    nome: 'Hub Vila Nova',
    endereco: 'Rua Vila Nova, 789 — Vila Nova',
    lat: -23.548,
    lng: -46.62,
    ponto_referencia: null,
    foto_url: FOTO_HUB,
    ativo: true,
    horarios: horarioAmplo(),
  },
];
