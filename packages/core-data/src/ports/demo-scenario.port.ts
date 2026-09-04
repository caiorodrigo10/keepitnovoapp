export interface DemoScenarioStatus {
  hydrated: boolean;
  persistence: 'ready' | 'degraded';
  lastError: 'read' | 'write' | 'reset' | null;
}

export interface DemoScenarioPort {
  reset(): Promise<void>;
  flush(): Promise<void>;
  getStatus(): DemoScenarioStatus;
}
