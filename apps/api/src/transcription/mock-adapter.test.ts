import { describe, expect, it } from 'vitest';
import { createFailingTranscriptionAdapter, createMockTranscriptionAdapter } from './mock-adapter';

describe('createMockTranscriptionAdapter', () => {
  it('returns the fixture transcript and language', async () => {
    const adapter = createMockTranscriptionAdapter({
      transcript: 'Practice went well.',
      language: 'en',
    });
    const result = await adapter.transcribe({ audio: Buffer.from('x'), contentType: 'audio/webm' });
    expect(result.transcript).toBe('Practice went well.');
    expect(result.language).toBe('en');
    expect(result.costUsd).toBe(0);
  });

  it('respects a language override over the fixture language', async () => {
    const adapter = createMockTranscriptionAdapter({ transcript: 'x', language: 'en' });
    const result = await adapter.transcribe({
      audio: Buffer.from('x'),
      contentType: 'audio/webm',
      languageOverride: 'de',
    });
    expect(result.language).toBe('de');
    expect(result.confidence).toBe(1);
  });
});

describe('createFailingTranscriptionAdapter', () => {
  it('always throws', async () => {
    const adapter = createFailingTranscriptionAdapter('vendor down');
    await expect(
      adapter.transcribe({ audio: Buffer.from('x'), contentType: 'audio/webm' }),
    ).rejects.toThrow('vendor down');
  });
});
