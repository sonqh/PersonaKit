// Exit codes and typed errors shared by the core and the CLI.

export const ExitCode = {
  ok: 0,
  unexpected: 1,
  usage: 2,
  conflict: 3,
  confirmationRequired: 4,
  notFound: 5,
  invalid: 6,
  unsafeStore: 7,
} as const;

export type ExitCodeName = keyof typeof ExitCode;

export class PersonaKitError extends Error {
  readonly code: ExitCodeName;
  readonly details: Record<string, unknown>;

  constructor(code: ExitCodeName, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "PersonaKitError";
    this.code = code;
    this.details = details;
  }

  get exitCode(): number {
    return ExitCode[this.code];
  }
}
