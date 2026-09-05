import type { AsyncCallOptions } from '../types';

export interface HubFavoritesPort {
  list(options?: AsyncCallOptions): Promise<string[]>;
  has(hubId: string, options?: AsyncCallOptions): Promise<boolean>;
  favorite(hubId: string, options?: AsyncCallOptions): Promise<void>;
  unfavorite(hubId: string, options?: AsyncCallOptions): Promise<void>;
}

export interface StoreFavoritesPort {
  list(options?: AsyncCallOptions): Promise<string[]>;
  has(estabelecimentoId: string, options?: AsyncCallOptions): Promise<boolean>;
  favorite(estabelecimentoId: string, options?: AsyncCallOptions): Promise<void>;
  unfavorite(estabelecimentoId: string, options?: AsyncCallOptions): Promise<void>;
}
