import type { StorageAdapter } from './adapter';

// Used by tests and, as a dev-only fallback in index.ts, by `pnpm dev:api`
// when no R2 credentials are configured yet — so the rest of the note
// pipeline (upload, transcribe, review, save, lifecycle sweep) is runnable
// end to end before a real Cloudflare account exists. Never used in staging
// or production: index.ts requires the R2 env vars there.
export function createMemoryStorageAdapter(): StorageAdapter & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();

  return {
    objects,
    async upload({ key, body }) {
      objects.set(key, body);
    },
    async download(key) {
      const body = objects.get(key);
      if (!body) throw new Error(`No object at key ${key}`);
      return body;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}
