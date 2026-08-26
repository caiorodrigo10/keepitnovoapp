import type { Produto } from '../ports/product.port';
import {
  deriveLojaEstado,
  validarHorariosSemanais,
  type Estabelecimento,
  type EstabelecimentoHorario,
  type LojaEstado,
  type StorePort,
} from '../ports/store.port';
import type { AsyncCallOptions } from '../types';
import { simulateAsync } from './async-helpers';
import type { MockDb } from './db';

/**
 * Story 5.3 (AC4) — `[IDS] ADAPT`: `deriveLojaEstado` relocada para
 * `store.port.ts` (fonte única, mesmo padrão de `validarHorariosSemanais`)
 * e reexportada aqui para não quebrar importadores existentes
 * (`store.mock.test.ts`). Nenhuma mudança de comportamento.
 */
export { deriveLojaEstado };

export function createStoreMock(db: MockDb): StorePort {
  function findOrThrow(id: string): Estabelecimento {
    const estabelecimento = db.estabelecimentos.find((e) => e.id === id);
    if (!estabelecimento) {
      throw new Error(`[mock] Estabelecimento não encontrado: ${id}`);
    }
    return estabelecimento;
  }

  return {
    listByHub(_hubId: string, options?: AsyncCallOptions): Promise<Estabelecimento[]> {
      // Ver nota em store.port.ts: schema não tem FK direta estabelecimento -> hub
      // no MVP; mock retorna todas as lojas ativas (single-hub scenario).
      return simulateAsync(() => db.estabelecimentos.filter((e) => e.status === 'ativo'), [], options);
    },

    getCatalog(estabelecimentoId: string, options?: AsyncCallOptions): Promise<Produto[]> {
      return simulateAsync(
        () => db.produtos.filter((p) => p.estabelecimento_id === estabelecimentoId && p.ativo),
        [],
        options,
      );
    },

    getById(id: string, options?: AsyncCallOptions): Promise<Estabelecimento | null> {
      return simulateAsync(() => db.estabelecimentos.find((e) => e.id === id) ?? null, null, options);
    },

    getState(id: string, options?: AsyncCallOptions): Promise<LojaEstado> {
      return simulateAsync(
        () => {
          const estabelecimento = db.estabelecimentos.find((e) => e.id === id);
          if (!estabelecimento) {
            throw new Error(`[mock] Estabelecimento não encontrado: ${id}`);
          }
          return deriveLojaEstado(estabelecimento);
        },
        'fechada',
        options,
      );
    },

    setPausadoManualmente(
      estabelecimentoId: string,
      pausado: boolean,
      options?: AsyncCallOptions,
    ): Promise<Estabelecimento> {
      return simulateAsync(
        () => {
          const estabelecimento = findOrThrow(estabelecimentoId);
          estabelecimento.pausado_manualmente = pausado;
          return estabelecimento;
        },
        {} as Estabelecimento,
        options,
      );
    },

    /**
     * Story 4.7 (AC1, AC3). Substitui as 7 linhas de
     * `estabelecimento.horarios` (mesmo array mock que `getById` lê) —
     * valida `hora_abre < hora_fecha` (defesa em profundidade, mesmo `CHECK`
     * do banco) ANTES de persistir; falha honestamente, sem gravar nada
     * parcial. Devolve a releitura real (nunca ecoa `horarios` sem passar
     * pela validação).
     */
    updateHorarios(
      estabelecimentoId: string,
      horarios: EstabelecimentoHorario[],
      options?: AsyncCallOptions,
    ): Promise<EstabelecimentoHorario[]> {
      return simulateAsync(
        () => {
          const estabelecimento = findOrThrow(estabelecimentoId);
          const erro = validarHorariosSemanais(horarios);
          if (erro) {
            throw new Error(`[mock] updateHorarios — ${erro}`);
          }
          estabelecimento.horarios = horarios.map((horario) => ({ ...horario }));
          return estabelecimento.horarios;
        },
        [],
        options,
      );
    },

    checkCnpjDisponivel(_cnpj: string, options?: AsyncCallOptions): Promise<boolean> {
      // Story 3.3 (AC2, AC4): `Estabelecimento` (tipo acima) não modela
      // `cnpj` — nenhuma fixture pode colidir, então mock sempre resolve
      // "disponível", igual ao comportamento honesto do adapter Supabase
      // até a Story 3.5 popular `estabelecimentos` de verdade.
      return simulateAsync(() => true, true, options);
    },
  };
}
