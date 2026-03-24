import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { DEFAULT_LANGUAGE, STARTUP_NAMESPACES } from "./config";

const INIT_TIMEOUT_MS = 3000;

// Backend loader — section-03 provides the real glob-based loader.
// Until then, resolve with empty object so i18next falls through to fallback keys.
const backendLoader = resourcesToBackend(
  async (language: string, namespace: string) => {
    // TODO: section-03 provides real loader
    try {
      const loader = await import("./loader");
      return loader.loadNamespace(language, namespace);
    } catch {
      return {};
    }
  },
);

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("i18n init timeout")), ms),
  );
}

const initPromise = i18next
  .use(initReactI18next)
  .use(backendLoader)
  .init({
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: "common",
    ns: [...STARTUP_NAMESPACES],
    partialBundledLanguages: true,
    interpolation: { escapeValue: false },
    react: { useSuspense: true },
  });

export const i18nReady: Promise<void> = Promise.race([
  initPromise.then(() => {}),
  timeout(INIT_TIMEOUT_MS),
]).catch((err) => {
  console.error("i18n init failed, proceeding in English-only mode", err);
});

export { i18next as i18n };
export default i18next;
