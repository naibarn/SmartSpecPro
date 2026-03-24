// Security: The glob manifest is build-time only. Runtime callers cannot
// request arbitrary file paths. Language codes are validated by the detector.
import i18next from "i18next";

// Build-time manifest — each JSON file becomes a separate lazy Vite chunk.
// NOT eager — files are loaded on demand.
const localeModules = import.meta.glob("../locales/*/*.json");

/** In-flight deduplication map: "${lng}:${ns}" -> load promise */
const inFlight = new Map<string, Promise<void>>();

/**
 * Load a translation namespace for a given language.
 * Idempotent — returns immediately if already loaded.
 * Deduplicates concurrent calls for the same lng/ns.
 */
export function loadNamespace(lng: string, ns: string): Promise<void> {
  // Already loaded — skip
  if (i18next.hasResourceBundle(lng, ns)) {
    return Promise.resolve();
  }

  const key = `${lng}:${ns}`;

  // Deduplicate in-flight request
  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const globKey = `../locales/${lng}/${ns}.json`;
  const loader = localeModules[globKey];

  if (!loader) {
    // No file exists for this language/namespace — i18next fallback handles it
    return Promise.resolve();
  }

  const promise = loader()
    .then((mod: unknown) => {
      const data = (mod as { default: Record<string, unknown> }).default;
      i18next.addResourceBundle(lng, ns, data, true, true);
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Factory that returns the callback expected by i18next-resources-to-backend.
 * Returns the raw JSON object (not void) so the backend plugin can register it.
 */
export function createBackendLoader() {
  return async (
    language: string,
    namespace: string,
  ): Promise<Record<string, unknown>> => {
    const globKey = `../locales/${language}/${namespace}.json`;
    const loader = localeModules[globKey];

    if (!loader) {
      // No file — return empty so i18next falls back to 'en'
      return {};
    }

    const mod = (await loader()) as { default: Record<string, unknown> };
    return mod.default;
  };
}
