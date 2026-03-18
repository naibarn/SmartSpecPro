/**
 * ActiveThreadRef — unified thread reference for the orchestration shell.
 *
 * Supports chat conversations, team rooms, agency conversations, and inbox tasks.
 */

export type ActiveThreadRef =
  | { kind: "chat"; id: number }
  | { kind: "team_room"; id: string }
  | { kind: "agency_conversation"; id: string; agencyId: string }
  | { kind: "external_inbox_task"; id: string };

/** Parse a serialized thread ref string into an ActiveThreadRef */
export function parseThreadRef(str: string): ActiveThreadRef | null {
  if (!str) return null;

  const parts = str.split(":");

  switch (parts[0]) {
    case "chat": {
      const id = parseInt(parts[1], 10);
      if (isNaN(id)) return null;
      return { kind: "chat", id };
    }
    case "team_room":
      if (!parts[1]) return null;
      return { kind: "team_room", id: parts[1] };
    case "agency":
      if (!parts[1] || !parts[2]) return null;
      return { kind: "agency_conversation", id: parts[2], agencyId: parts[1] };
    case "inbox":
      if (!parts[1]) return null;
      return { kind: "external_inbox_task", id: parts[1] };
    default:
      return null;
  }
}

/** Serialize an ActiveThreadRef to a query string-safe format */
export function serializeThreadRef(ref: ActiveThreadRef): string {
  switch (ref.kind) {
    case "chat":
      return `chat:${ref.id}`;
    case "team_room":
      return `team_room:${ref.id}`;
    case "agency_conversation":
      return `agency:${ref.agencyId}:${ref.id}`;
    case "external_inbox_task":
      return `inbox:${ref.id}`;
  }
}

/** Check if two thread refs point to the same thread */
export function isSameThread(a: ActiveThreadRef | null, b: ActiveThreadRef | null): boolean {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;

  switch (a.kind) {
    case "chat":
      return a.id === (b as Extract<ActiveThreadRef, { kind: "chat" }>).id;
    case "team_room":
      return a.id === (b as Extract<ActiveThreadRef, { kind: "team_room" }>).id;
    case "agency_conversation":
      return a.id === (b as Extract<ActiveThreadRef, { kind: "agency_conversation" }>).id;
    case "external_inbox_task":
      return a.id === (b as Extract<ActiveThreadRef, { kind: "external_inbox_task" }>).id;
  }
}

/** Get display label for a thread kind */
export function getThreadKindLabel(kind: ActiveThreadRef["kind"]): string {
  switch (kind) {
    case "chat":
      return "Chat";
    case "team_room":
      return "Team Room";
    case "agency_conversation":
      return "Agency";
    case "external_inbox_task":
      return "Inbox Task";
  }
}
