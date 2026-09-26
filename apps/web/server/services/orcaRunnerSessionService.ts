import { randomUUID } from "node:crypto";
import type {
  OrcaCommandKind,
  OrcaSession,
  OrcaSessionState,
} from "./orcaRuntimeContracts";

export type OrcaRunnerCommand = {
  commandId: string;
  route: "orca.v1";
  kind: OrcaCommandKind;
  tenantId: string;
  runnerId: string;
  jobId: string;
  attemptId: string;
  sessionId: string;
  generation: number;
  sequence: number;
  idempotencyKey: string;
  payload: Record<string, unknown>;
};

export type OrcaRunnerAck = {
  commandId: string;
  status: "accepted" | "duplicate" | "rejected";
  reasonCode?: string;
};
export type OrcaRunnerTransport = {
  send(command: OrcaRunnerCommand): Promise<OrcaRunnerAck>;
};

export class OrcaRunnerSessionError extends Error {
  readonly code:
    | "SESSION_FENCE_STALE"
    | "SESSION_NOT_FOUND"
    | "COMMAND_SEQUENCE_INVALID"
    | "SECRET_PAYLOAD_REJECTED"
    | "COMMAND_IDEMPOTENCY_CONFLICT";

  constructor(code: OrcaRunnerSessionError["code"], message = code) {
    super(message);
    this.name = "OrcaRunnerSessionError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type SessionInput = {
  tenantId: string;
  runnerId: string;
  jobId: string;
  attemptId: string;
  idempotencyKey: string;
};
type CommandInput = OrcaSession & {
  idempotencyKey: string;
  payload?: Record<string, unknown>;
};

const SECRET_KEYS = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "credential",
  "credentials",
  "password",
  "privatekey",
  "refreshtoken",
  "secret",
  "token",
]);

function assertSafePayload(payload: Record<string, unknown>): void {
  for (const key of Object.keys(payload)) {
    if (SECRET_KEYS.has(key.toLowerCase()))
      throw new OrcaRunnerSessionError("SECRET_PAYLOAD_REJECTED");
    const value = payload[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object")
          assertSafePayload(item as Record<string, unknown>);
      }
    } else if (value && typeof value === "object") {
      assertSafePayload(value as Record<string, unknown>);
    }
  }
}

export class OrcaRunnerSessionController {
  private readonly sessions = new Map<string, OrcaSession>();
  private readonly commands = new Map<string, OrcaRunnerAck>();
  private readonly commandSequences = new Map<string, number>();

  constructor(private readonly transport: OrcaRunnerTransport) {}

  async create(input: SessionInput): Promise<OrcaSession> {
    const existing = [...this.sessions.values()].find(
      session =>
        session.tenantId === input.tenantId &&
        session.jobId === input.jobId &&
        session.attemptId === input.attemptId
    );
    if (existing) return existing;
    const session: OrcaSession = {
      sessionId: randomUUID(),
      route: "orca.v1",
      runnerId: input.runnerId,
      tenantId: input.tenantId,
      jobId: input.jobId,
      attemptId: input.attemptId,
      generation: 1,
      state: "created",
    };
    this.sessions.set(session.sessionId, session);
    await this.send(session, "create", input.idempotencyKey, {});
    return session;
  }

  async attach(input: CommandInput): Promise<OrcaSession> {
    const session = this.assertSession(input);
    await this.send(
      session,
      "attach",
      input.idempotencyKey,
      input.payload ?? {}
    );
    const attached = { ...session, state: "attached" as const };
    this.sessions.set(attached.sessionId, attached);
    return attached;
  }

  async prompt(input: CommandInput): Promise<OrcaRunnerAck> {
    return this.dispatch(input, "prompt");
  }
  async observe(input: CommandInput): Promise<OrcaRunnerAck> {
    return this.dispatch(input, "observe");
  }
  async cancel(input: CommandInput): Promise<OrcaRunnerAck> {
    return this.dispatch(input, "cancel");
  }
  async kill(input: CommandInput): Promise<OrcaRunnerAck> {
    return this.dispatch(input, "kill");
  }

  private async dispatch(
    input: CommandInput,
    kind: Exclude<OrcaCommandKind, "create" | "attach">
  ): Promise<OrcaRunnerAck> {
    const session = this.assertSession(input);
    const ack = await this.send(
      session,
      kind,
      input.idempotencyKey,
      input.payload ?? {}
    );
    if (ack.status === "accepted") {
      const state: OrcaSessionState =
        kind === "cancel"
          ? "cancelled"
          : kind === "kill"
            ? "failed"
            : kind === "prompt"
              ? "running"
              : session.state;
      this.sessions.set(session.sessionId, { ...session, state });
    }
    return ack;
  }

  private assertSession(input: CommandInput): OrcaSession {
    const session = this.sessions.get(input.sessionId);
    if (
      !session ||
      session.tenantId !== input.tenantId ||
      session.runnerId !== input.runnerId ||
      session.jobId !== input.jobId ||
      session.attemptId !== input.attemptId
    ) {
      throw new OrcaRunnerSessionError("SESSION_NOT_FOUND");
    }
    if (session.generation !== input.generation)
      throw new OrcaRunnerSessionError("SESSION_FENCE_STALE");
    return session;
  }

  private async send(
    session: OrcaSession,
    kind: OrcaCommandKind,
    idempotencyKey: string,
    payload: Record<string, unknown>
  ): Promise<OrcaRunnerAck> {
    assertSafePayload(payload);
    const commandKey = `${session.sessionId}:${idempotencyKey}`;
    const previous = this.commands.get(commandKey);
    if (previous) return { ...previous, status: "duplicate" };
    const sequenceKey = session.sessionId;
    const sequence = (this.commandSequences.get(sequenceKey) ?? 0) + 1;
    this.commandSequences.set(sequenceKey, sequence);
    const command: OrcaRunnerCommand = {
      commandId: randomUUID(),
      route: "orca.v1",
      kind,
      tenantId: session.tenantId,
      runnerId: session.runnerId,
      jobId: session.jobId,
      attemptId: session.attemptId,
      sessionId: session.sessionId,
      generation: session.generation,
      sequence,
      idempotencyKey,
      payload,
    };
    const ack = await this.transport.send(command);
    this.commands.set(commandKey, ack);
    return ack;
  }
}
