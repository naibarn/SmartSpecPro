export interface ChatLibraryAttachPayload {
  item_id: number;
  item_type: string;
  title: string;
  source: string;
}

export interface ChatLibrarySearchResultLike {
  status?: string | null;
  attach_payload?: Partial<ChatLibraryAttachPayload> | null;
  item_id?: number;
  item_type?: string;
  title?: string;
  source?: string;
}

export function isChatLibrarySourcePickerEnabled(rawFlag?: string | null): boolean {
  const value = (rawFlag || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function toSafeAttachPayload(
  result: ChatLibrarySearchResultLike,
): ChatLibraryAttachPayload | null {
  const payload = result.attach_payload;
  const item_id = Number(payload?.item_id ?? result.item_id);
  const item_type = String(payload?.item_type ?? result.item_type ?? "").trim();
  const title = String(payload?.title ?? result.title ?? "").trim();
  const source = String(payload?.source ?? result.source ?? "").trim();

  if (!Number.isFinite(item_id) || item_id <= 0) return null;
  if (!item_type || !title || !source) return null;

  return {
    item_id,
    item_type,
    title,
    source,
  };
}

export function toAttachableLibrarySources(
  results?: ChatLibrarySearchResultLike[] | null,
): ChatLibraryAttachPayload[] {
  if (!results || results.length === 0) return [];

  const seen = new Set<number>();
  const items: ChatLibraryAttachPayload[] = [];

  for (const result of results) {
    if ((result.status || "").toLowerCase() !== "ready") {
      continue;
    }

    const safe = toSafeAttachPayload(result);
    if (!safe || seen.has(safe.item_id)) {
      continue;
    }
    seen.add(safe.item_id);
    items.push(safe);
  }

  return items;
}

export function toggleLibrarySourceSelection(
  selected: ChatLibraryAttachPayload[],
  candidate: ChatLibraryAttachPayload,
): ChatLibraryAttachPayload[] {
  const exists = selected.some((item) => item.item_id === candidate.item_id);
  if (exists) {
    return selected.filter((item) => item.item_id !== candidate.item_id);
  }
  return [...selected, candidate];
}

export function appendLibraryContextToMessage(
  message: string,
  selectedSources: ChatLibraryAttachPayload[],
): string {
  const text = message.trim();
  if (selectedSources.length === 0) {
    return text;
  }

  const sourceLines = selectedSources.map(
    (item) => `- [${item.item_type}] ${item.title} (id:${item.item_id}, source:${item.source})`,
  );
  const contextBlock = [
    "Library context:",
    ...sourceLines,
  ].join("\n");

  if (!text) {
    return `Use these library items as context.\n\n${contextBlock}`;
  }

  return `${text}\n\n${contextBlock}`;
}
