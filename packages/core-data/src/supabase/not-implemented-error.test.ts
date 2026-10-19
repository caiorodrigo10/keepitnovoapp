import { describe, expect, it } from 'vitest';

import { NotImplementedError } from './not-implemented-error';

describe('NotImplementedError (contract)', () => {
  it('formats the message as [core-data/supabase] {port}.{method} — implementar no {epicHint}', () => {
    const error = new NotImplementedError('hub', 'listNearby', 'Épico 2');
    expect(error.message).toBe('[core-data/supabase] hub.listNearby — implementar no Épico 2');
    expect(error.name).toBe('NotImplementedError');
    expect(error.port).toBe('hub');
    expect(error.method).toBe('listNearby');
    expect(error.epicHint).toBe('Épico 2');
  });

  it('is a genuine Error instance (instanceof works, catchable like any other Error)', () => {
    const error = new NotImplementedError('order', 'create', 'Épico 6');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(NotImplementedError);
  });
});
