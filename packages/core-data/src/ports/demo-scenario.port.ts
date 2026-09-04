export interface DemoScenarioStatus {
  hydrated: boolean;
  persistence: 'ready' | 'degraded';
  lastError: 'read' | 'write' | 'reset' | null;
}

export type DemoScenarioResetResult = { status: 'reset' } | { status: 'degraded' };

export const QA_SIMULATION_DOMAINS = ['orders', 'stores', 'hubs', 'favorites', 'profile', 'search'] as const;

export type QaSimulationDomain = (typeof QA_SIMULATION_DOMAINS)[number];

export type QaSimulationState = 'normal' | 'loading' | 'empty' | 'error';

export interface QaScenarioState {
  clockOffsetMs: number;
  autoProgressOrders: boolean;
  simulations: Record<QaSimulationDomain, QaSimulationState>;
}

export type DemoScenarioMutationResult = { status: 'updated' } | { status: 'degraded' };

export interface DemoScenarioPort {
  reset(): Promise<DemoScenarioResetResult>;
  flush(): Promise<void>;
  getStatus(): DemoScenarioStatus;
  getQaState(): QaScenarioState;
  setQaState(next: QaScenarioState): Promise<DemoScenarioMutationResult>;
}
