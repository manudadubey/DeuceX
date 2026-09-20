import { describe, expect, it } from 'vitest';
import { createMemoryStorageAdapter } from './memory-adapter';

describe('createMemoryStorageAdapter', () => {
  it('round-trips an upload through download', async () => {
    const storage = createMemoryStorageAdapter();
    await storage.upload({ key: 'k', body: Buffer.from('hello'), contentType: 'audio/webm' });
    expect(await storage.download('k')).toEqual(Buffer.from('hello'));
  });

  it('throws downloading a missing key', async () => {
    const storage = createMemoryStorageAdapter();
    await expect(storage.download('missing')).rejects.toThrow();
  });

  it('removes the object on delete', async () => {
    const storage = createMemoryStorageAdapter();
    await storage.upload({ key: 'k', body: Buffer.from('hello'), contentType: 'audio/webm' });
    await storage.delete('k');
    await expect(storage.download('k')).rejects.toThrow();
  });
});
