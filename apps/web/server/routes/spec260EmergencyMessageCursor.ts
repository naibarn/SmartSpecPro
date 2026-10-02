export interface Spec260EmergencyMessageCursor {
  readonly createdAt: Date;
  readonly id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeSpec260EmergencyMessageCursor(cursor: Spec260EmergencyMessageCursor): string {
  if (!Number.isFinite(cursor.createdAt.getTime()) || !UUID_PATTERN.test(cursor.id)) {
    throw new Error("SPEC260_MESSAGE_CURSOR_INVALID");
  }
  return Buffer.from(`${cursor.createdAt.toISOString()}\n${cursor.id}`).toString("base64url");
}

export function decodeSpec260EmergencyMessageCursor(value: unknown): Spec260EmergencyMessageCursor | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const [createdAt, id, extra] = Buffer.from(value, "base64url").toString("utf8").split("\n");
    const timestamp = Date.parse(createdAt ?? "");
    if (extra !== undefined || !Number.isFinite(timestamp) || !UUID_PATTERN.test(id ?? "")) return null;
    return { createdAt: new Date(timestamp), id };
  } catch {
    return null;
  }
}
