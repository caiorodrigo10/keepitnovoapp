import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import { initializeDataClient } from '@keepit/core-data';
import { AccountDeletionPublicFlow } from './AccountDeletionPublicFlow';

beforeAll(async () => {
  await initializeDataClient({ source: 'mock' });
});

describe('public account deletion page', () => {
  it('identifies Keepit and welcomes both customer and merchant accounts without the app', () => {
    const html = renderToStaticMarkup(createElement(AccountDeletionPublicFlow));
    expect(html).toContain('Keepit');
    expect(html).toContain('Cliente ou lojista');
    expect(html).toContain('sete dias');
  });
});
