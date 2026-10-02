import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@keepit/supabase-client';
import { useCallback, useEffect, useState } from 'react';
import {
  initializeDataClient,
  recoverDataClient,
  resolveDataMode,
  type DataClient,
} from '@keepit/core-data';

let sharedSupabaseClient: ReturnType<typeof createClient> | undefined;

/** Auth e adapters precisam da mesma instância e do mesmo storage no nativo. */
export function getLojistaSupabaseClient(): ReturnType<typeof createClient> {
  if (resolveDataMode(
    process.env.EXPO_PUBLIC_DATA_SOURCE,
    process.env.EXPO_PUBLIC_APP_ENV,
  ) !== 'supabase') {
    throw new Error('SUPABASE_NAO_CONFIGURADO');
  }
  return sharedSupabaseClient ??= createClient({
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
  });
}

const DATA_CLIENT_BOOTSTRAP_TIMEOUT_MS = 5_000;

export interface BootstrapDataClientOptions {
  timeoutMs?: number;
  recover?: boolean;
}

export type DataClientBootstrapState =
  | { status: 'loading'; error: null }
  | { status: 'ready'; error: null }
  | { status: 'error'; error: Error };

function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('DataClient bootstrap timeout')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('DATA_CLIENT_INDISPONIVEL');
}

/** Inicializa ou recupera o mesmo modo configurado; nunca troca Supabase por mock. */
export async function bootstrapDataClient(
  options: BootstrapDataClientOptions = {},
): Promise<DataClient> {
  const timeoutMs = options.timeoutMs ?? DATA_CLIENT_BOOTSTRAP_TIMEOUT_MS;
  const dataSource = resolveDataMode(
    process.env.EXPO_PUBLIC_DATA_SOURCE,
    process.env.EXPO_PUBLIC_APP_ENV,
  );
  const initialize = options.recover ? recoverDataClient : initializeDataClient;

  if (dataSource === 'mock') {
    return settleWithin(initialize({ source: 'mock' }), timeoutMs);
  }

  const supabaseClient = getLojistaSupabaseClient();
  return settleWithin(initialize({ source: 'supabase', supabaseClient }), timeoutMs);
}

export const dataClientReady: Promise<DataClient> = bootstrapDataClient();
void dataClientReady.catch(() => undefined);

/** Expõe loading/erro/retry ao root sem montar consumidores prematuramente. */
export function useDataClientBootstrap(): DataClientBootstrapState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DataClientBootstrapState>({ status: 'loading', error: null });

  useEffect(() => {
    let mounted = true;
    const readiness = attempt === 0 ? dataClientReady : bootstrapDataClient({ recover: true });
    void readiness.then(
      () => {
        if (mounted) setState({ status: 'ready', error: null });
      },
      (error: unknown) => {
        if (mounted) setState({ status: 'error', error: asError(error) });
      },
    );
    return () => {
      mounted = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading', error: null });
    setAttempt((current) => current + 1);
  }, []);
  return { ...state, retry };
}
