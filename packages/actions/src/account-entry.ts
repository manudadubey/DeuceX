// The '@deucex/actions/account' subpath (package.json's `exports` map):
// account.ts and resend-client.ts kept off the main barrel because
// resend-client.ts imports the real 'resend' SDK, and the main barrel is
// already imported into apps/web's client bundle transitively (packages/
// agents' financial module imports AgentValidationError/TokenUsage from
// it). Same split as './queue' (pg-boss) and the same reasoning — see that
// export's own comment in index.ts. apps/api is the only real consumer.

export {
  createResendEmailClient,
  createResendEmailStatusClient,
  EmailSendFailedError,
  type EmailClient,
  type EmailStatusClient,
  type SentEmail,
  type EmailAttachment,
  type SendEmailInput,
} from './resend-client';

export {
  requestAccountDeletion,
  confirmAccountDeletion,
  cancelAccountDeletion,
  requestDataExport,
  sendStaffDataExport,
  buildExportJson,
  buildExpensesCsv,
  buildNotesCsv,
  buildTranscriptsText,
  MissingPlayerEmailError,
  SupabaseAccountDb,
  type AccountDeletionDb,
  type AccountDb,
  type DataExportDb,
  type ExportBundle,
  type ExportNote,
  type ExportExpense,
  type RequestAccountDeletionInput,
  type RequestDataExportInput,
} from './account';

export {
  runAdminGatedAction,
  reasonRequired,
  REASON_REQUIRED_ADMIN_ACTIONS,
  sendStaffDeletionStartedEmail,
  sendPlayerSignInLink,
  sendStaffSignInLink,
  AdminActionNotFoundError,
  AdminActionMismatchError,
  AdminActionAlreadyConsumedError,
  AdminReasonRequiredError,
  type AdminActionGateDb,
  type AdminActionRecord,
  type AdminRole,
  type RunAdminGatedActionInput,
  type StaffDeletionEmailInput,
  type PlayerSignInLinkInput,
} from './admin';
