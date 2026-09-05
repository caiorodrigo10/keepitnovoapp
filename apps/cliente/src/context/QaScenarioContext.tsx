import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  getDataClient,
  type DemoScenarioMutationResult,
  type DemoScenarioStatus,
  type QaOrderProgressionDelaysMs,
  type QaScenarioState,
  type QaSimulationDomain,
  type QaSimulationState,
} from '@keepit/core-data';

import { advanceQaClock, configureQaOrderProgression } from '../lib/qaOrderProgression';

export interface QaScenarioContextValue {
  state: QaScenarioState;
  persistence: DemoScenarioStatus;
  setSimulation(
    domain: QaSimulationDomain,
    value: QaSimulationState,
  ): Promise<DemoScenarioMutationResult>;
  configureOrderProgression(
    delays: QaOrderProgressionDelaysMs | null,
    enabled: boolean,
  ): Promise<DemoScenarioMutationResult>;
  advanceClockBy(offsetMs: number): Promise<DemoScenarioMutationResult>;
  syncFromClient(): void;
}

const QaScenarioContext = createContext<QaScenarioContextValue | null>(null);

function copyQaState(state: QaScenarioState): QaScenarioState {
  return {
    ...state,
    orderProgressionDelaysMs: state.orderProgressionDelaysMs
      ? { ...state.orderProgressionDelaysMs }
      : null,
    simulations: { ...state.simulations },
  };
}

export function QaScenarioProvider({ children }: { children: ReactNode }) {
  const scenario = getDataClient().demoScenario!;
  const initialStateRef = useRef<QaScenarioState | null>(null);
  if (!initialStateRef.current) {
    initialStateRef.current = copyQaState(scenario.getQaState());
  }

  const stateRef = useRef(initialStateRef.current);
  const [state, setState] = useState(initialStateRef.current);
  const [persistence, setPersistence] = useState(() => scenario.getStatus());

  const setSimulation = useCallback(
    async (domain: QaSimulationDomain, value: QaSimulationState) => {
      const next = {
        ...stateRef.current,
        simulations: { ...stateRef.current.simulations, [domain]: value },
      };
      stateRef.current = next;
      setState(next);

      try {
        return await scenario.setQaState(next);
      } finally {
        setPersistence(scenario.getStatus());
      }
    },
    [scenario],
  );

  const configureOrderProgression = useCallback(
    async (delays: QaOrderProgressionDelaysMs | null, enabled: boolean) => {
      const next = configureQaOrderProgression(stateRef.current, delays, enabled);
      stateRef.current = next;
      setState(next);

      try {
        return await scenario.setQaState(next);
      } finally {
        setPersistence(scenario.getStatus());
      }
    },
    [scenario],
  );

  const advanceClockBy = useCallback(
    async (offsetMs: number) => {
      const next = advanceQaClock(stateRef.current, offsetMs);
      stateRef.current = next;
      setState(next);

      try {
        return await scenario.setQaState(next);
      } finally {
        setPersistence(scenario.getStatus());
      }
    },
    [scenario],
  );

  const syncFromClient = useCallback(() => {
    const next = copyQaState(scenario.getQaState());
    stateRef.current = next;
    setState(next);
    setPersistence(scenario.getStatus());
  }, [scenario]);

  const value = useMemo<QaScenarioContextValue>(
    () => ({
      state,
      persistence,
      setSimulation,
      configureOrderProgression,
      advanceClockBy,
      syncFromClient,
    }),
    [
      advanceClockBy,
      configureOrderProgression,
      persistence,
      setSimulation,
      state,
      syncFromClient,
    ],
  );

  return <QaScenarioContext.Provider value={value}>{children}</QaScenarioContext.Provider>;
}

export function useQaScenario(): QaScenarioContextValue {
  const context = useContext(QaScenarioContext);
  if (!context) {
    throw new Error('useQaScenario() precisa ser usado dentro de <QaScenarioProvider>.');
  }
  return context;
}

export function useQaSimulation(domain: QaSimulationDomain): QaSimulationState {
  return useContext(QaScenarioContext)?.state.simulations[domain] ?? 'normal';
}
