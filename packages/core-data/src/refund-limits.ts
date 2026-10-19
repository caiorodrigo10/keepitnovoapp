export function remainingRefund(paid: number, completed: number, reserved: number): number {
  if ([paid, completed, reserved].some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('VALOR_INVALIDO');
  }
  const remaining = paid - completed - reserved;
  if (remaining < 0) throw new Error('REEMBOLSO_EXCEDIDO');
  return remaining;
}
