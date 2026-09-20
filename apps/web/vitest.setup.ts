import '@testing-library/jest-dom/vitest';
// jsdom has no real IndexedDB implementation; the offline queue
// (lib/match-scribe/offline-queue.ts, S-18) needs a working one to test.
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
