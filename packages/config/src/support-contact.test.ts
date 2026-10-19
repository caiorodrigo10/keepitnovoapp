import { describe, expect, it } from 'vitest';

import { SUPORTE_WHATSAPP_DISPONIVEL, SUPORTE_WHATSAPP_NUMERO } from './support-contact';

describe('support-contact (WA-001 seam, Story 3.6 AC2)', () => {
  it('keeps the WhatsApp number unset (null) while WA-001 is pending', () => {
    expect(SUPORTE_WHATSAPP_NUMERO).toBeNull();
  });

  it('never uses a fabricated/placeholder phone number as a stand-in', () => {
    // Regression guard: a placeholder like "5511999999999" would let a
    // consuming screen build a working wa.me/tel deep link — exactly what
    // AC2 forbids until the real number exists.
    expect(typeof SUPORTE_WHATSAPP_NUMERO === 'string' ? SUPORTE_WHATSAPP_NUMERO : null).toBeNull();
  });

  it('derives SUPORTE_WHATSAPP_DISPONIVEL as false while the number is null', () => {
    expect(SUPORTE_WHATSAPP_DISPONIVEL).toBe(false);
  });
});
