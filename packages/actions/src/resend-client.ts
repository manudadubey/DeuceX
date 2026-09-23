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
}

// Narrow on purpose (mirrors ApprovalGateDb/ReceivablesDb): account.ts's
// gated actions depend on this interface, not on the Resend SDK, so their
// tests need no real API key or network access.
export interface EmailClient {
  sendEmail(input: SendEmailInput): Promise<void>;
}

export class EmailSendFailedError extends Error {
  constructor(reason: string) {
    super(`Resend failed to send: ${reason}`);
    this.name = 'EmailSendFailedError';
  }
}

// Resend's own sandbox sender, which works without any domain verification
// — the real procircuit.app domain is not verified in Resend yet (found
// live, this session: a 403 "domain is not verified" on the first real
// send attempt), so this is the honest default until the owner verifies a
// real sending domain, not a placeholder pretending to be production-ready.
const DEFAULT_FROM_ADDRESS = 'ProCircuit <onboarding@resend.dev>';

export function createResendEmailClient(config: { apiKey: string; from?: string }): EmailClient {
  const resend = new Resend(config.apiKey);
  const from = config.from ?? DEFAULT_FROM_ADDRESS;

  return {
    async sendEmail(input: SendEmailInput): Promise<void> {
      const { error } = await resend.emails.send({
        from,
        to: input.to,
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
    },
  };
}
