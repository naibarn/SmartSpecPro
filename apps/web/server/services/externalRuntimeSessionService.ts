import { createHash, randomUUID } from "node:crypto";

export type ExternalRuntimeSession = {
  sessionId: string;
  tenantId: string;
  workspaceId: string;
  provider: "acp" | "gascity" | "orca";
  runnerId: string;
  configurationFingerprint: string;
  configurationEpoch: number;
  authEpoch: number;
  childId: string;
  generation: number;
  status: "created" | "running" | "stopped";
};

export class RuntimeSessionError extends Error {
  readonly code:
    | "PROVIDER_CHILD_DUPLICATE"
    | "CONFIGURATION_EPOCH_MISMATCH"
    | "AUTH_EPOCH_MISMATCH"
    | "SESSION_NOT_FOUND"
    | "SESSION_STOPPED";

  constructor(code: RuntimeSessionError["code"], message = code) {
    super(message);
    this.name = "RuntimeSessionError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((out, key) => {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
      return out;
    }, {});
}

function fingerprint(value: Record<string, unknown>): string {
  const canonical = JSON.stringify(canonicalize(value));
  return createHash("sha256").update(canonical).digest("hex");
}

export class ExternalRuntimeSessionService {
  private readonly sessions = new Map<string, ExternalRuntimeSession>();
  private readonly children = new Map<string, string>();

  create(input: {
    tenantId: string;
    workspaceId: string;
    provider: ExternalRuntimeSession["provider"];
    runnerId: string;
    configuration: Record<string, unknown>;
    authEpoch: number;
    childId: string;
  }): ExternalRuntimeSession {
    const childKey = `${input.tenantId}:${input.workspaceId}:${input.provider}:${input.childId}`;
    if (this.children.has(childKey))
      throw new RuntimeSessionError("PROVIDER_CHILD_DUPLICATE");
    const session: ExternalRuntimeSession = {
      sessionId: randomUUID(),
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      provider: input.provider,
      runnerId: input.runnerId,
      configurationFingerprint: fingerprint(input.configuration),
      configurationEpoch: 1,
      authEpoch: input.authEpoch,
      childId: input.childId,
      generation: 1,
      status: "created",
    };
    this.sessions.set(session.sessionId, session);
    this.children.set(childKey, session.sessionId);
    return session;
  }

  resume(
    input: ExternalRuntimeSession & {
      configuration: Record<string, unknown>;
      authEpoch: number;
    }
  ): { status: "resumed"; generation: number; sessionId: string } {
    const session = this.sessions.get(input.sessionId);
    if (!session) throw new RuntimeSessionError("SESSION_NOT_FOUND");
    if (session.status === "stopped")
      throw new RuntimeSessionError("SESSION_STOPPED");
    if (session.configurationFingerprint !== fingerprint(input.configuration))
      throw new RuntimeSessionError("CONFIGURATION_EPOCH_MISMATCH");
    if (session.authEpoch !== input.authEpoch)
      throw new RuntimeSessionError("AUTH_EPOCH_MISMATCH");
    session.generation += 1;
    session.status = "running";
    return {
      status: "resumed",
      generation: session.generation,
      sessionId: session.sessionId,
    };
  }

  cleanup(sessionId: string): { status: "stopped" | "already_stopped" } {
    const session = this.sessions.get(sessionId);
    if (!session) throw new RuntimeSessionError("SESSION_NOT_FOUND");
    if (session.status === "stopped") return { status: "already_stopped" };
    session.status = "stopped";
    this.children.delete(
      `${session.tenantId}:${session.workspaceId}:${session.provider}:${session.childId}`
    );
    return { status: "stopped" };
  }
}
