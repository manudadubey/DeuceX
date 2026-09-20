// Thrown by the approval gate (gate.ts) and recordRun (record-run.ts).
// Distinct classes, not one generic error, because a caller (and a test)
// needs to tell "no such approval" apart from "already used" apart from
// "the model's output didn't validate" — recordRun maps the last one
// specifically to agent_runs.status = 'failed_validation'
// (TECH-ARCHITECTURE.md section 3), everything else to 'failed_infra'.

export class ApprovalNotFoundError extends Error {
  constructor(readonly approvalId: string) {
    super(`No approval found for player matching approvalId ${approvalId}`);
    this.name = 'ApprovalNotFoundError';
  }
}

export class ApprovalActionMismatchError extends Error {
  constructor(
    readonly approvalId: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `Approval ${approvalId} was granted for "${actual}", not "${expected}": refusing to run a different action under it`,
    );
    this.name = 'ApprovalActionMismatchError';
  }
}

export class ApprovalPayloadMismatchError extends Error {
  constructor(readonly approvalId: string) {
    super(
      `Approval ${approvalId}'s payload does not match what the player approved: refusing to run with a substituted payload`,
    );
    this.name = 'ApprovalPayloadMismatchError';
  }
}

export class ApprovalAlreadyConsumedError extends Error {
  constructor(readonly approvalId: string) {
    super(`Approval ${approvalId} has already been consumed`);
    this.name = 'ApprovalAlreadyConsumedError';
  }
}

// Thrown by an agent's own call site (not by this module) when the model's
// structured output fails Zod validation. recordRun() catches it specially;
// everything else it catches is treated as 'failed_infra'.
export class AgentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentValidationError';
  }
}
