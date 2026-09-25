import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// The MCP twin of the console's two-step (PRD-13 AD-3, M-GATE-2 applied to
// staff). An action tool called without a confirmation token only previews:
// it returns the one-sentence consequence and a token. Calling it again
// with that token runs it. The token is an HMAC over who asked, which tool,
// the exact arguments (reason included) and the consequence sentence, so:
// - a token can't be reused for a different player, tool or reason;
// - if the player's state changed in between and the sentence would now
//   read differently, the confirm is refused and must be previewed again;
// - it works once and expires after ten minutes.
// The key and the used-token set live in this process only. A restart
// voids outstanding previews, which only means previewing again.

export const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

export interface ConfirmationSubject {
  staffId: string;
  tool: string;
  args: Record<string, unknown>;
  consequence: string;
}

export class ConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfirmationError';
  }
}

/** JSON with sorted keys, so the same arguments always sign the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export class ConfirmationTokens {
  private readonly key: Buffer;
  private readonly used = new Map<string, number>();

  constructor(key: Buffer = randomBytes(32)) {
    this.key = key;
  }

  private sign(subject: ConfirmationSubject, expiresAt: number, nonce: string): string {
    return createHmac('sha256', this.key)
      .update(
        [
          subject.staffId,
          subject.tool,
          canonicalJson(subject.args),
          subject.consequence,
          String(expiresAt),
          nonce,
        ].join('\n'),
      )
      .digest('base64url');
  }

  issue(subject: ConfirmationSubject, now: Date): { token: string; expiresAt: string } {
    const expiresAt = now.getTime() + CONFIRMATION_TTL_MS;
    const nonce = randomBytes(9).toString('base64url');
    return {
      token: `${expiresAt}.${nonce}.${this.sign(subject, expiresAt, nonce)}`,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  /** Accepts a token once, for exactly this subject, before it expires. */
  consume(token: string, subject: ConfirmationSubject, now: Date): void {
    const [exp, nonce, mac] = token.split('.');
    const expiresAt = Number(exp);
    if (!exp || !nonce || !mac || !Number.isFinite(expiresAt)) {
      throw new ConfirmationError(
        'That confirmation token is malformed. Preview the action again.',
      );
    }
    if (expiresAt <= now.getTime()) {
      throw new ConfirmationError('That confirmation expired. Preview the action again.');
    }
    const expected = Buffer.from(this.sign(subject, expiresAt, nonce));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new ConfirmationError(
        "The confirmation does not match: the arguments, the reason or the player's state changed since the preview. Preview the action again and confirm what it now says.",
      );
    }
    this.prune(now);
    if (this.used.has(token)) {
      throw new ConfirmationError('That confirmation was already used. Preview the action again.');
    }
    this.used.set(token, expiresAt);
  }

  private prune(now: Date): void {
    for (const [token, expiresAt] of this.used) {
      if (expiresAt <= now.getTime()) this.used.delete(token);
    }
  }
}
