import { Platform } from 'react-native';
import * as Location from 'expo-location';

import type { LatLng } from './distance';

/**
 * Geolocalização cross-platform (Story 5.1.1, AC2/AC4).
 *
 * [IDS] CREATE — nenhum helper de geolocalização existia no Cliente antes
 * desta Story. Segue o precedente de injeção de dependência de
 * `apps/cliente/src/lib/pedidoPolling.ts` (`deps` opcional com default
 * real), mas a maior parte deste módulo **não é testável neste sandbox**
 * (`vitest`, `environment: 'node'`, sem mock de `react-native`/módulo
 * nativo `expo-location`) — mesma limitação já registrada no Dev Agent
 * Record da Story 5.1 (`DEV-5.1-001`). A superfície injetável existe para
 * permitir teste futuro (device/simulador) sem reescrever este módulo.
 *
 * **Web** (`Platform.OS === 'web'`): usa `navigator.geolocation` (API do
 * browser).
 * **Nativo** (iOS/Android): `expo-location`
 * (`requestForegroundPermissionsAsync` + `getCurrentPositionAsync`).
 *
 * Qualquer exceção, permissão negada, timeout ou API indisponível vira
 * `null` — esta função **nunca lança** (AC2/AC3/AC4: a tela sempre cai no
 * fallback gracioso, nunca trava).
 */

export interface GeolocationDeps {
  /** Override de plataforma — só para teste (não usado hoje, sandbox sem RN). */
  platform?: typeof Platform.OS;
}

function getCurrentCoordsWeb(): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
        },
        () => {
          // Permissão negada, timeout do browser, posição indisponível — fallback gracioso (AC3).
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 5000 },
      );
    } catch {
      resolve(null);
    }
  });
}

async function getCurrentCoordsNative(): Promise<LatLng | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return null;
    }

    const position = await Location.getCurrentPositionAsync({});
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Tenta obter a posição atual do device. Retorna `null` (nunca lança)
 * quando a permissão é negada, a API está indisponível, ou qualquer outra
 * falha ocorre — quem chama decide o fallback (AC3: input de CEP).
 */
export async function getCurrentCoords(deps: GeolocationDeps = {}): Promise<LatLng | null> {
  const platform = deps.platform ?? Platform.OS;

  try {
    return platform === 'web' ? await getCurrentCoordsWeb() : await getCurrentCoordsNative();
  } catch {
    return null;
  }
}
