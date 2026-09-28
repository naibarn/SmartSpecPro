import { randomUUID } from "node:crypto";

export type AcpRpcMessage = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export class AcpProtocolError extends Error {
  readonly code:
    | "FRAME_TOO_LARGE"
    | "FRAME_INVALID"
    | "RPC_INVALID"
    | "PERMISSION_SCOPE_MISMATCH"
    | "DUPLICATE_REQUEST"
    | "BACKPRESSURE";

  constructor(code: AcpProtocolError["code"], message = code) {
    super(message);
    this.name = "AcpProtocolError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function parseAcpFrame(
  frame: string | object,
  options: { maxBytes?: number } = {}
): AcpRpcMessage[] {
  const maxBytes = options.maxBytes ?? 256 * 1024;
  const raw = typeof frame === "string" ? frame : JSON.stringify(frame);
  if (Buffer.byteLength(raw, "utf8") > maxBytes)
    throw new AcpProtocolError("FRAME_TOO_LARGE");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AcpProtocolError("FRAME_INVALID");
  }
  const messages = Array.isArray(value) ? value : [value];
  if (messages.length === 0) throw new AcpProtocolError("FRAME_INVALID");
  return messages.map(message => {
    if (
      !message ||
      typeof message !== "object" ||
      (message as Record<string, unknown>).jsonrpc !== "2.0"
    )
      throw new AcpProtocolError("RPC_INVALID");
    const candidate = message as Record<string, unknown>;
    const hasMethod = typeof candidate.method === "string" && candidate.method.length > 0;
    const hasResponse = Object.prototype.hasOwnProperty.call(candidate, "result") ||
      Object.prototype.hasOwnProperty.call(candidate, "error");
    if (!hasMethod && !hasResponse) throw new AcpProtocolError("RPC_INVALID");
    return message as AcpRpcMessage;
  });
}

export type AcpNormalizedUpdate = {
  type: "activity" | "permission" | "unknown";
  rawType: string;
  sessionId: string;
  payload: Record<string, unknown>;
};

export class AcpProtocolAdapter {
  private readonly seenRequests = new Set<string>();
  private readonly permissions = new Map<
    string,
    { sessionId: string; turnId: string; capability: string }
  >();
  private readonly maxFrameBytes: number;
  private readonly maxPendingPermissions: number;

  constructor(options: { maxFrameBytes: number; maxPendingPermissions?: number }) {
    this.maxFrameBytes = options.maxFrameBytes;
    this.maxPendingPermissions = options.maxPendingPermissions ?? 32;
  }

  initialize(input: { protocolVersion: string; capabilities: string[] }): {
    requestId: string;
    method: "initialize";
    status: "ready";
    protocolVersion: string;
    capabilities: string[];
  } {
    const requestId = randomUUID();
    this.seenRequests.add(requestId);
    return {
      requestId,
      method: "initialize",
      status: "ready",
      protocolVersion: input.protocolVersion,
      capabilities: [...input.capabilities],
    };
  }

  parse(frame: string | object): AcpRpcMessage[] {
    return parseAcpFrame(frame, { maxBytes: this.maxFrameBytes });
  }

  normalizeUpdate(input: {
    sessionId: string;
    updateType: string;
    payload: Record<string, unknown>;
  }): AcpNormalizedUpdate {
    const type =
      input.updateType === "permission/request"
        ? "permission"
        : input.updateType === "session/update" ||
            input.updateType === "turn/update"
          ? "activity"
          : "unknown";
    return {
      type,
      rawType: input.updateType,
      sessionId: input.sessionId,
      payload: input.payload,
    };
  }

  requestPermission(input: {
    requestId: string;
    sessionId: string;
    turnId: string;
    capability: string;
  }): { requestId: string; status: "pending" } {
    if (this.permissions.has(input.requestId))
      throw new AcpProtocolError("DUPLICATE_REQUEST");
    if (this.permissions.size >= this.maxPendingPermissions)
      throw new AcpProtocolError("BACKPRESSURE");
    this.permissions.set(input.requestId, {
      sessionId: input.sessionId,
      turnId: input.turnId,
      capability: input.capability,
    });
    return { requestId: input.requestId, status: "pending" };
  }

  resolvePermission(input: {
    requestId: string;
    sessionId: string;
    turnId: string;
    decision: "allow" | "deny";
  }): { requestId: string; status: "allowed" | "denied" } {
    const pending = this.permissions.get(input.requestId);
    if (
      !pending ||
      pending.sessionId !== input.sessionId ||
      pending.turnId !== input.turnId
    )
      throw new AcpProtocolError("PERMISSION_SCOPE_MISMATCH");
    this.permissions.delete(input.requestId);
    return {
      requestId: input.requestId,
      status: input.decision === "allow" ? "allowed" : "denied",
    };
  }
}
