import { describe, expect, it } from 'vitest';
import { previousClosedWeek } from './payoutCalendar';

describe('Admin payout calendar', () => {
  it('seleciona a semana encerrada conforme segunda em São Paulo', () => {
    expect(previousClosedWeek(new Date('2026-10-05T02:59:59Z'))).toBe('2026-09-21');
    expect(previousClosedWeek(new Date('2026-10-05T03:00:00Z'))).toBe('2026-09-28');
  });
});
