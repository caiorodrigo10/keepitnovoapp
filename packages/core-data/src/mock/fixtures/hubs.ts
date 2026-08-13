import type { Hub, HubHorario } from '../../ports/hub.port';

/**
 * Foto real (Unsplash CDN) do ponto de retirada — encomendas prontas para
 * retirar, coerente com o modelo click-and-collect do Hub Keepit. Só para o
 * mock visual (Épico 0); mesma imagem nos hubs por consistência de marca.
 */
const FOTO_HUB = 'https://images.unsplash.com/photo-1580674285054-bed31e145f59?w=400&h=400&fit=crop&q=80';

/**
 * Modo Demo (`docs/architecture/09-modo-demo-mock.md` §3.4) — horário amplo
 * `00:00–23:59` nos 7 dias. DADO de teste (não regra de negócio): evita que
 * `podeFinalizarNoHorario` (`apps/cliente/src/lib/checkoutValidation.ts`,
 * Story 6.3) bloqueie o checkout do demo por o hub estar "fechado" perto do
 * fim do horário comercial — mesmo racional já aplicado às lojas em
 * `estabelecimentos.ts#horarioAmplo`. O horário real de operação de cada
 * ponto (ex.: 24h Seg–Sáb do Portal das Américas) fica descrito em texto no
 * `ponto_referencia`, sem travar o demo.
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
 * Hubs de demonstração — pontos reais/simulados na região da Barra da
 * Tijuca / Recreio (Rio de Janeiro), fornecidos pelo Caio (product owner)
 * para o demo. Os DOIS primeiros são pontos reais de instalação Keepit
 * (Posto Portal das Américas e Posto Jardim Oceânico); os três seguintes
 * são simulados na mesma região só para exibir a seleção de hub.
 *
 * `hubsFixture[0]` é o hub DEFAULT ("RETIRAR EM" da Home — `Home.tsx`).
 *
 * NOTA de IDs: os três primeiros mantêm os IDs legados (`hub-centro`,
 * `hub-jardins`, `hub-vila-nova`) DE PROPÓSITO — são referenciados por
 * `pedidos.ts`, `order.mock.test.ts`, `store.mock.test.ts` e
 * `admin.mock.test.ts` por ID (opaco ao usuário). Trocar só o conteúdo
 * (nome/endereço/geo) preserva a integridade sem tocar nesses arquivos.
 */
export const hubsFixture: Hub[] = [
  {
    id: 'hub-centro',
    nome: 'Posto Portal das Américas',
    endereco: 'Av. das Américas, 17.877 — Barra da Tijuca, Rio de Janeiro/RJ',
    lat: -23.0181,
    lng: -43.4521,
    ponto_referencia: 'Posto de Gasolina Portal das Américas Ltda · 24h (Seg–Sáb) · Facultativo Dom/feriados',
    foto_url: FOTO_HUB,
    ativo: true,
    horarios: horarioAmplo(),
  },
  {
    id: 'hub-jardins',
    nome: 'Posto Jardim Oceânico',
    endereco: 'Av. Armando Lombardi, 370 — Barra da Tijuca, Rio de Janeiro/RJ',
    lat: -23.0106,
    lng: -43.3078,
    ponto_referencia: 'Auto Posto Jardim Oceânico da Barra da Tijuca',
    foto_url: FOTO_HUB,
    ativo: true,
    horarios: horarioAmplo(),
  },
  {
    id: 'hub-vila-nova',
    nome: 'Hub Recreio',
    endereco: 'Av. das Américas, 15.500 — Recreio dos Bandeirantes, Rio de Janeiro/RJ',
    lat: -23.0225,
    lng: -43.4640,
    ponto_referencia: 'Recreio dos Bandeirantes (simulado — demo)',
    foto_url: FOTO_HUB,
    ativo: true,
    horarios: horarioAmplo(),
  },
  {
    id: 'hub-barra-americas',
    nome: 'Hub Barra – Av. das Américas',
    endereco: 'Av. das Américas, 4.666 — Barra da Tijuca, Rio de Janeiro/RJ',
    lat: -23.0036,
    lng: -43.3650,
    ponto_referencia: 'Próximo ao BarraShopping (simulado — demo)',
    foto_url: FOTO_HUB,
    ativo: true,
    horarios: horarioAmplo(),
  },
  {
    id: 'hub-peninsula',
    nome: 'Hub Península',
    endereco: 'Av. Prefeito Dulcídio Cardoso, 1.500 — Barra da Tijuca, Rio de Janeiro/RJ',
    lat: -23.0002,
    lng: -43.3627,
    ponto_referencia: 'Bairro Península, Barra da Tijuca (simulado — demo)',
    foto_url: FOTO_HUB,
    ativo: true,
    horarios: horarioAmplo(),
  },
];
