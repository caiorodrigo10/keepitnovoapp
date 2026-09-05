import type { CartMutationResult } from './cartTransaction';

export type PaymentFeedbackType = 'pix' | 'cartao';

export interface PaymentFeedbackTarget {
  pedidoId: string;
  paymentType: PaymentFeedbackType;
}

export type PaymentSubmissionResult =
  | { status: 'ready'; target: PaymentFeedbackTarget }
  | { status: 'cleanup_failed'; target: PaymentFeedbackTarget }
  | { status: 'busy' };

interface PaymentSubmissionInput {
  paymentType: PaymentFeedbackType;
  createOrder(): Promise<{ id: string }>;
  afterCreate?(order: { id: string }): void | Promise<void>;
  clearOrder(): Promise<CartMutationResult>;
}

export function createPaymentSubmissionController() {
  let pendingTarget: PaymentFeedbackTarget | null = null;
  let submitting = false;

  return {
    getPendingTarget: () => pendingTarget,
    async submit({
      paymentType,
      createOrder,
      afterCreate,
      clearOrder,
    }: PaymentSubmissionInput): Promise<PaymentSubmissionResult> {
      if (submitting) {
        return { status: 'busy' };
      }

      submitting = true;
      try {
        if (!pendingTarget) {
          const pedido = await createOrder();
          pendingTarget = { pedidoId: pedido.id, paymentType };
          await afterCreate?.(pedido);
        }

        const target = pendingTarget;
        const clearResult = await clearOrder();
        if (clearResult.status !== 'committed') {
          return { status: 'cleanup_failed', target };
        }

        pendingTarget = null;
        return { status: 'ready', target };
      } finally {
        submitting = false;
      }
    },
  };
}
