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
  type QaScenarioState,
  type QaSimulationDomain,
  type QaSimulationState,
} from '@keepit/core-data';

export interface QaScenarioContextValue {
  state: QaScenarioState;
  persistence: DemoScenarioStatus;
  setSimulation(
    domain: QaSimulationDomain,
    value: QaSimulationState,
  ): Promise<DemoScenarioMutationResult>;
  syncFromClient(): void;
}

const QaScenarioContext = createContext<QaScenarioContextValue | null>(null);

function copyQaState(state: QaScenarioState): QaScenarioState {
  return { ...state, simulations: { ...state.simulations } };
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

  const syncFromClient = useCallback(() => {
    const next = copyQaState(scenario.getQaState());
    stateRef.current = next;
    setState(next);
    setPersistence(scenario.getStatus());
  }, [scenario]);

  const value = useMemo<QaScenarioContextValue>(
    () => ({ state, persistence, setSimulation, syncFromClient }),
    [persistence, setSimulation, state, syncFromClient],
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
