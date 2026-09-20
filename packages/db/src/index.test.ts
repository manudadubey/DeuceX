import { describe, expect, it } from 'vitest';
import { createAnonClient } from './index';

describe('db clients', () => {
  it('constructs an anon client from a url and key', () => {
    const client = createAnonClient('https://example.supabase.co', 'anon-key');
    expect(client).toBeDefined();
  });
});
