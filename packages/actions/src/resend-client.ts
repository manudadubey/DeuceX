import { Resend } from 'resend';

// The only file in this codebase allowed to `import 'resend'` (root
// eslint.config.mjs's no-restricted-imports rule, proven by
// lint-rule.test.ts). apps/api never imports the `resend` package directly:
// it imports createResendEmailClient from here and decides at wiring time
// whether to pass the real client or a logging fallback (same
// warn-and-fall-back branch every other vendor adapter in apps/api/src/
// index.ts already uses for storage/transcription/extraction), the same
// way apps/api owns that branch for R2/Whisper without ever importing the
// R2 or Whisper SDK from inside packages/actions.

export interface EmailAttachment {
  filename: string;
  content: string; // base64-encoded
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  /** Step 4.1: a patron note's replies go to the player, not the agent (PRD-04 P-11). */
  replyTo?: string;
  /** Step 4.1: the display name shown on the From line, e.g. "Arya Dubey". The address stays the verified sender. */
  fromName?: string;
}

// Narrow on purpose (mirrors ApprovalGateDb/ReceivablesDb): account.ts's
// gated actions depend on this interface, not on the Resend SDK, so their
// tests need no real API key or network access.
export interface EmailClient {
  /**
   * Step 4.2: resolves with Resend's email id where the client has one, so
   * the Content Agent can poll the email's status back for open rates.
   * Callers that don't need it ignore it, and mocks may return nothing.
   */
  sendEmail(input: SendEmailInput): Promise<SentEmail | void>;
}

export interface SentEmail {
  id: string | null;
}

/**
 * Step 4.2 (owner decision): open rates are polled from Resend rather than
 * pushed by a webhook, since apps/api has no public URL yet. Returns the
 * email's latest event ("delivered", "opened", "clicked", "bounced", ...),
 * or null when Resend doesn't know the id.
 */
export interface EmailStatusClient {
  getLastEvent(emailId: string): Promise<string | null>;
}

export class EmailSendFailedError extends Error {
  constructor(reason: string) {
    super(`Resend failed to send: ${reason}`);
    this.name = 'EmailSendFailedError';
  }
}

// Resend's own sandbox sender, which works without any domain verification.
// It stays the default until mail.deucex.ai is verified in Resend and
// RESEND_FROM_ADDRESS is set (an unverified domain fails with a 403,
// found live in step 2.3).
const DEFAULT_FROM_ADDRESS = 'DeuceX <onboarding@resend.dev>';

export function createResendEmailClient(config: { apiKey: string; from?: string }): EmailClient {
  const resend = new Resend(config.apiKey);
  const from = config.from ?? DEFAULT_FROM_ADDRESS;

  return {
    async sendEmail(input: SendEmailInput): Promise<SentEmail> {
      const { data, error } = await resend.emails.send({
        from: input.fromName ? `${input.fromName} <${fromAddress(from)}>` : from,
        to: input.to,
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        subject: input.subject,
        html: input.html,
        text: input.html
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
        ...(input.attachments
          ? {
              attachments: input.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
              })),
            }
          : {}),
      });
      if (error) throw new EmailSendFailedError(error.message);
      return { id: data?.id ?? null };
    },
  };
}

export function createResendEmailStatusClient(config: { apiKey: string }): EmailStatusClient {
  const resend = new Resend(config.apiKey);
  return {
    async getLastEvent(emailId) {
      const { data, error } = await resend.emails.get(emailId);
      if (error) {
        if (/not.?found/i.test(error.name ?? '') || /not found/i.test(error.message)) return null;
        throw new EmailSendFailedError(error.message);
      }
      return data?.last_event ?? null;
    },
  };
}

/** "DeuceX <onboarding@resend.dev>" -> "onboarding@resend.dev". */
function fromAddress(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1] ?? from;
}
