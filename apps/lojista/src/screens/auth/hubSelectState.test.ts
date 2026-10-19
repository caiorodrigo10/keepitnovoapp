import { describe, expect, it } from 'vitest';

import { getHubSelectState } from './hubSelectState';

const hub = {
  id: '5fe3a8ac-98dc-4b1c-aaf9-e92d47ef4c91',
  nome: 'Hub Sé',
  endereco: 'Praça da Sé, São Paulo',
  lat: -23.5505,
  lng: -46.6333,
  ponto_referencia: null,
  foto_url: null,
  ativo: true,
  horarios: [],
};

describe('getHubSelectState', () => {
  it('mantém o campo em carregamento enquanto a listagem não terminou', () => {
    expect(getHubSelectState({ data: [], loading: true, error: null })).toEqual({ kind: 'loading' });
  });

  it('usa os UUIDs e nomes retornados pela listagem de hubs', () => {
    expect(getHubSelectState({ data: [hub], loading: false, error: null })).toEqual({
      kind: 'ready',
      options: [{ value: '5fe3a8ac-98dc-4b1c-aaf9-e92d47ef4c91', label: 'Hub Sé' }],
    });
  });

  it('informa quando a listagem não possui hubs', () => {
    expect(getHubSelectState({ data: [], loading: false, error: null })).toEqual({ kind: 'empty' });
  });

  it('informa erro ao carregar a listagem', () => {
    expect(getHubSelectState({ data: [], loading: false, error: new Error('offline') })).toEqual({ kind: 'error' });
  });
});
