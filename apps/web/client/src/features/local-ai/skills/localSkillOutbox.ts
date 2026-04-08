export interface LocalSkillOutboxItem {
  id: string;
  conversationId: number;
  content: string;
  skillId: string;
  profileId?: string | null;
  provider?: string | null;
  model?: string | null;
  runtimeKind: "gemma4_text" | "script_bundle";
  createdAt: string;
}

const LOCAL_SKILL_OUTBOX_STORAGE_KEY = "smartspec_local_skill_outbox_v1";

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readOutbox(): LocalSkillOutboxItem[] {
  if (!canUseLocalStorage()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_SKILL_OUTBOX_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalSkillOutboxItem[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: LocalSkillOutboxItem[]) {
  if (!canUseLocalStorage()) {
    return;
  }
  window.localStorage.setItem(
    LOCAL_SKILL_OUTBOX_STORAGE_KEY,
    JSON.stringify(items),
  );
}

export function getLocalSkillOutboxItems(): LocalSkillOutboxItem[] {
  return readOutbox();
}

export function enqueueLocalSkillOutboxItem(
  item: Omit<LocalSkillOutboxItem, "id" | "createdAt">,
): LocalSkillOutboxItem {
  const fullItem: LocalSkillOutboxItem = {
    ...item,
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `local-skill-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
  };
  const items = readOutbox();
  items.push(fullItem);
  writeOutbox(items);
  return fullItem;
}

export function removeLocalSkillOutboxItem(itemId: string) {
  const items = readOutbox().filter((item) => item.id !== itemId);
  writeOutbox(items);
}

export async function flushLocalSkillOutbox(input: {
  save: (item: LocalSkillOutboxItem) => Promise<boolean>;
}): Promise<{ processed: number; synced: number }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { processed: 0, synced: 0 };
  }

  const items = readOutbox();
  let synced = 0;
  let processed = 0;
  for (const item of items) {
    processed += 1;
    const ok = await input.save(item).catch(() => false);
    if (!ok) {
      continue;
    }
    synced += 1;
    removeLocalSkillOutboxItem(item.id);
  }
  return { processed, synced };
}
