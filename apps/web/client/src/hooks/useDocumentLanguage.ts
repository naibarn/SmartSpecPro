import { useEffect } from "react";
import { i18n } from "@/i18n";
import { SUPPORTED_LANGUAGES } from "@shared/i18n";

function getDocumentLanguage(language: string | undefined): string {
  const value = language?.trim();
  if (!value) return "en";

  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(value)) return value;

  const parts = value.split("-");
  const languageAndScript = parts.slice(0, 2).join("-");
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(languageAndScript)) {
    return languageAndScript;
  }

  const baseLanguage = parts[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(baseLanguage)
    ? baseLanguage
    : "en";
}

/** Keep the document language aligned with the active UI locale on every route. */
export function useDocumentLanguage(): void {
  useEffect(() => {
    const syncDocumentLanguage = (language?: string) => {
      document.documentElement.lang = getDocumentLanguage(
        language ?? i18n.resolvedLanguage ?? i18n.language,
      );
    };

    syncDocumentLanguage();
    i18n.on("languageChanged", syncDocumentLanguage);
    return () => {
      i18n.off("languageChanged", syncDocumentLanguage);
    };
  }, []);
}
