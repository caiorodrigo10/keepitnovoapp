import type { PaymentAttempt } from '@keepit/core-data';

export function isPagamentoConfirmado(estado: PaymentAttempt['estado']): boolean {
  return estado === 'confirmado' || estado === 'recebido';
}
export function canSubmitCard(attempt: PaymentAttempt | null): boolean {
  return !attempt || attempt.estado === 'recusado' || attempt.estado === 'expirado';
}
export function paymentMessage(attempt: PaymentAttempt | null): string {
  if (!attempt) return 'Aguardando início do pagamento';
  switch (attempt.estado) {
    case 'confirmado': case 'recebido': return 'Pagamento confirmado';
    case 'reconciliacao': return 'Pagamento em conciliação. Aguarde antes de tentar novamente.';
    case 'recusado': return 'Pagamento recusado. Revise os dados ou use outro cartão.';
    case 'expirado': return 'Tentativa encerrada. Você pode iniciar outro pagamento.';
    case 'criando': return 'Processando pagamento. Aguarde a confirmação.';
    case 'pendente': return 'Aguardando confirmação do pagamento';
  }
}

/** Mesmo controlador para Android/iOS; nenhum timer cria pedido ou confirma pagamento. */
export function startPaymentPolling(deps: {
  read(): Promise<PaymentAttempt | null>;
  onAttempt(attempt: PaymentAttempt | null): void;
  onError(message: string): void;
  getAppState(): string;
  subscribe(listener: (state: string) => void): { remove(): void };
  intervalMs?: number;
}) {
  let stopped = false;
  let active = deps.getAppState() === 'active';
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = async () => {
    if (stopped || !active || busy) return;
    clearTimeout(timer); busy = true;
    try {
      const attempt = await deps.read();
      if (!stopped && active) deps.onAttempt(attempt);
    } catch {
      if (!stopped && active) deps.onError('Não foi possível consultar o pagamento. Tente atualizar.');
    } finally {
      busy = false;
      if (!stopped && active) timer = setTimeout(() => void refresh(), deps.intervalMs ?? 3000);
    }
  };
  const subscription = deps.subscribe((state) => {
    active = state === 'active'; clearTimeout(timer);
    if (active) void refresh();
  });
  void refresh();
  return { refresh: () => { void refresh(); }, stop: () => { stopped = true; clearTimeout(timer); subscription.remove(); } };
}
