import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ALL_NAMESPACES, type Namespace } from "./config";
import { AVAILABLE_LOCALES, DEFAULT_LOCALE, type Locale } from "../lib/i18n/types";
import { STORAGE_KEY } from "./languageDetector";

type PrefixRule = {
  ns: Namespace;
  transform?: (rest: string[]) => string;
};

const PREFIX_TO_NAMESPACE: Record<string, PrefixRule> = {
  agencies: { ns: "agency" },
  agency: { ns: "agency" },
  orchestrator: { ns: "agency" },
  teams: { ns: "agency" },
  chat: { ns: "chat" },
  common: { ns: "common" },
  credits: { ns: "billing" },
  dashboard: { ns: "dashboard" },
  help: { ns: "help" },
  bsHelp: { ns: "help", transform: (rest) => ["bs", ...rest].join(".") },
  media: { ns: "media" },
  mediaStudio: { ns: "media" },
  marketplace: { ns: "marketplace" },
  profile: { ns: "profile" },
  settings: { ns: "settings" },
  social: { ns: "social" },
  workflow: { ns: "workflow" },
  workflows: { ns: "workflow" },
  admin: { ns: "admin" },
  invite: { ns: "admin" },
  billing: { ns: "billing" },
  editor: { ns: "presentation" },
  notifications: { ns: "common" },
};

function buildCandidates(key: string): Array<{ ns: Namespace; key: string }> {
  const candidates: Array<{ ns: Namespace; key: string }> = [];
  const [prefix, ...rest] = key.split(".");
  const mappedRule = PREFIX_TO_NAMESPACE[prefix];
  if (mappedRule && rest.length > 0) {
    candidates.unshift({ ns: mappedRule.ns, key: mappedRule.transform?.(rest) ?? rest.join(".") });
  }

  for (const ns of ALL_NAMESPACES) {
    candidates.push({ ns, key });
  }

  return candidates;
}

export function useScopedTranslation(defaultNamespaces: Namespace | Namespace[]) {
  const namespaces = Array.isArray(defaultNamespaces) ? defaultNamespaces : [defaultNamespaces];
  const { t: i18nT, i18n } = useTranslation(namespaces);
  const rawLang = i18n.resolvedLanguage ?? i18n.language;
  const locale: Locale = (AVAILABLE_LOCALES as readonly string[]).includes(rawLang)
    ? (rawLang as Locale)
    : DEFAULT_LOCALE;

  const setLocale = useCallback(
    (next: Locale) => {
      void i18n.changeLanguage(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private browsing or storage quota issues
      }
    },
    [i18n],
  );

  function t(key: string, params?: Record<string, string | number>) {
    const candidates = buildCandidates(key);
    for (const ns of namespaces) {
      if (i18n.exists(key, { ns })) {
        return i18nT(key, { ns, ...(params ?? {}) }) as string;
      }
    }

    for (const candidate of candidates) {
      if (i18n.exists(candidate.key, { ns: candidate.ns })) {
        return i18nT(candidate.key, { ns: candidate.ns, ...(params ?? {}) }) as string;
      }
    }

    return i18nT(key, { ns: namespaces, ...(params ?? {}) }) as string;
  }

  return { t, i18n, locale, setLocale };
}
