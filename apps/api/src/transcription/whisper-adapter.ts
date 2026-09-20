import {
  TranscriptionFailedError,
  type TranscriptionAdapter,
  type TranscriptionInput,
  type TranscriptionResult,
} from './adapter';

// TECH-ARCHITECTURE.md section 4: "roughly USD 0.006 per minute of audio."
const WHISPER_COST_PER_MINUTE_USD = 0.006;
const WHISPER_MODEL = 'whisper-1';

// whisper-1's verbose_json response gives the detected language as a full
// name ("german"), not the ISO 639-1 code PRD-02's data dictionary and
// S-AC-3 expect ("de") — this is the documented, hand-maintained mapping for
// the four languages Preferences actually offers (S-4, S-5); anything else
// falls back to a lowercase two-letter guess rather than failing the note.
const LANGUAGE_NAME_TO_ISO_639_1: Record<string, string> = {
  english: 'en',
  chinese: 'zh',
  spanish: 'es',
  german: 'de',
};

function normalizeLanguage(name: string | undefined): string {
  if (!name) return 'en';
  const mapped = LANGUAGE_NAME_TO_ISO_639_1[name.toLowerCase()];
  if (mapped) return mapped;
  return name.slice(0, 2).toLowerCase();
}

interface WhisperVerboseJsonResponse {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{ no_speech_prob?: number }>;
}

// whisper-1 has no single "confidence" field; no_speech_prob per segment is
// the closest proxy the API exposes, averaged and inverted. Falls back to a
// fixed 0.9 when the response has no segments (a very short note can come
// back with none). The mood-proposal threshold (PRD-02 section 7, a
// placeholder pending review with real transcripts) is step 1.2's concern,
// not this adapter's — this just has to be a reasonable number to store.
function estimateConfidence(segments: WhisperVerboseJsonResponse['segments']): number {
  if (!segments || segments.length === 0) return 0.9;
  const total = segments.reduce((sum, segment) => sum + (segment.no_speech_prob ?? 0), 0);
  return Math.max(0, Math.min(1, 1 - total / segments.length));
}

export interface WhisperAdapterConfig {
  apiKey: string;
}

export function createWhisperAdapter(config: WhisperAdapterConfig): TranscriptionAdapter {
  return {
    async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(input.audio)], { type: input.contentType }),
        'note.webm',
      );
      form.append('model', WHISPER_MODEL);
      form.append('response_format', 'verbose_json');
      if (input.languageOverride) form.append('language', input.languageOverride);

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: form,
      });

      if (!response.ok) {
        throw new TranscriptionFailedError(
          `Whisper transcription failed: ${response.status} ${await response.text()}`,
        );
      }

      const body = (await response.json()) as WhisperVerboseJsonResponse;
      const durationMinutes = (body.duration ?? 60) / 60;

      return {
        transcript: body.text,
        language: input.languageOverride ?? normalizeLanguage(body.language),
        confidence: input.languageOverride ? 1 : estimateConfidence(body.segments),
        model: WHISPER_MODEL,
        costUsd: durationMinutes * WHISPER_COST_PER_MINUTE_USD,
      };
    },
  };
}
