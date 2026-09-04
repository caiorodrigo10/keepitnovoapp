export interface DemoScenarioStatus {
  hydrated: boolean;
  persistence: 'ready' | 'degraded';
  lastError: 'read' | 'write' | 'reset' | null;
}

export type DemoScenarioResetResult = { status: 'reset' } | { status: 'degraded' };

export interface DemoScenarioPort {
  reset(): Promise<DemoScenarioResetResult>;
  flush(): Promise<void>;
  getStatus(): DemoScenarioStatus;
}
