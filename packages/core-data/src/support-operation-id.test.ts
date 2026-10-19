import { expect, it } from 'vitest';
import { createSupportOperationId } from './support-operation-id';

it('gera UUID válido e distinto para solicitações separadas', () => {
  const first = createSupportOperationId();
  const second = createSupportOperationId();
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(second).not.toBe(first);
});
