// Translation values MUST be plain text only. No HTML markup. See spec Security Requirements S1.

export {
  SUPPORTED_LANGUAGES,
  RTL_LANGUAGES,
  LANGUAGE_LABELS,
  LANGUAGE_LABELS_EN,
  LANGUAGE_COVERAGE,
} from "@shared/i18n";

export const DEFAULT_LANGUAGE = "en" as const;

export const STARTUP_NAMESPACES = [
  "common",
  "nav",
  "auth",
  "errors",
] as const;

export const ALL_NAMESPACES = [
  "common",
  "nav",
  "auth",
  "errors",
  "dashboard",
  "chat",
  "agency",
  "presentation",
  "media",
  "marketplace",
  "workflow",
  "profile",
  "settings",
  "billing",
  "admin",
  "social",
  "help",
] as const;

export type Namespace = (typeof ALL_NAMESPACES)[number];
