import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { DEFAULT_LANGUAGE, STARTUP_NAMESPACES } from "./config";
import { createBackendLoader } from "./loader";
import { languageDetector } from "./languageDetector";

const INIT_TIMEOUT_MS = 3000;

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("i18n init timeout")), ms),
  );
}

const initPromise = i18next
  .use(languageDetector)
  .use(initReactI18next)
  .use(resourcesToBackend(createBackendLoader()))
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
export { useScopedTranslation } from "./useScopedTranslation";
