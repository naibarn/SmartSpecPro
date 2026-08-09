/**
 * Best-effort localStorage for UI PREFERENCE caches (remembered model
 * defaults, disclosure open-state, last-picked connection, …) — never a source
 * of truth, and never for anything security-relevant.
 *
 * Two rules this module exists to enforce:
 *
 * 1. **It must not throw.** `localStorage.getItem`/`setItem` raise
 *    `SecurityError` in sandboxed / blocked-storage contexts and
 *    `QuotaExceededError` once the origin's storage is full. An unguarded
 *    throw in a click handler aborts the handler BEFORE the real (state)
 *    action fires — that is how a full localStorage once made model selection
 *    look broken.
 *
 * 2. **A full quota must not silently disable preferences forever.** The
 *    previous per-file `safeStorageSet` copies swallowed
 *    `QuotaExceededError` and moved on, so once the origin filled up, nothing
 *    a user chose was ever remembered again — and each page load restored the
 *    stale value that WAS on disk, which reads as "the app keeps forgetting /
 *    randomly resets". Here a quota failure instead evicts the
 *    least-recently-written preference keys and retries.
 *
 * Eviction only ever touches keys that were themselves written through
 * `safeStorageSet`, tracked in the index below. Auth tokens, drafts and
 * anything else written directly via `window.localStorage` are never
 * candidates.
 */

/** Key holding the write-order index of every key this module owns. */
const PREF_INDEX_KEY = "ssp:pref-index";

/** Hard cap on tracked keys, so the index itself can't grow without bound. */
const MAX_TRACKED_KEYS = 500;

type PrefIndex = Record<string, number>;

function readRawIndex(): PrefIndex {
  try {
    const raw = window.localStorage.getItem(PREF_INDEX_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const out: PrefIndex = {};
    for (const [key, value] of Object.entries(parsed as PrefIndex)) {
      if (typeof value === "number" && Number.isFinite(value))
        out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeRawIndex(index: PrefIndex): void {
  try {
    window.localStorage.setItem(PREF_INDEX_KEY, JSON.stringify(index));
  } catch {
    /* index is itself best-effort — losing it only costs eviction ordering */
  }
}

/** Tracked keys, oldest write first. */
function trackedKeysOldestFirst(index: PrefIndex): string[] {
  return Object.keys(index).sort((a, b) => (index[a] ?? 0) - (index[b] ?? 0));
}

export function safeStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Write a preference. Returns `true` when the value actually landed, so
 * callers that care can tell "remembered" from "could not remember" — but the
 * common case ignores the result and MUST still update React state first, so a
 * storage failure never blocks the real action.
 */
export function safeStorageSet(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;

  const attempt = (): boolean => {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };

  if (attempt()) {
    touchIndex(key);
    return true;
  }

  // Quota (or a transient failure). Evict our own least-recently-written
  // preference keys — never the one being written — and retry after each.
  const index = readRawIndex();
  let evicted = false;
  for (const candidate of trackedKeysOldestFirst(index)) {
    if (candidate === key) continue;
    try {
      window.localStorage.removeItem(candidate);
    } catch {
      /* storage is blocked outright — nothing more to try */
      break;
    }
    delete index[candidate];
    evicted = true;
    if (attempt()) {
      index[key] = Date.now();
      writeRawIndex(index);
      return true;
    }
  }
  if (evicted) writeRawIndex(index);
  return false;
}

export function safeStorageRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    return;
  }
  const index = readRawIndex();
  if (key in index) {
    delete index[key];
    writeRawIndex(index);
  }
}

/** Record/refresh a key's write time, trimming the index when it gets long. */
function touchIndex(key: string): void {
  const index = readRawIndex();
  index[key] = Date.now();
  const keys = trackedKeysOldestFirst(index);
  if (keys.length > MAX_TRACKED_KEYS) {
    for (const stale of keys.slice(0, keys.length - MAX_TRACKED_KEYS)) {
      delete index[stale];
    }
  }
  writeRawIndex(index);
}
