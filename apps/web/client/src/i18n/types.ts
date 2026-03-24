import type { ALL_NAMESPACES } from "./config";
import type { SupportedLanguage as SharedSupportedLanguage } from "@shared/i18n";

/** Union type of all namespace identifiers */
export type Namespace = (typeof ALL_NAMESPACES)[number];

/** Type-safe translation function signature */
export type TFunction = (
  key: string,
  params?: Record<string, string | number>,
) => string;

/** Language code from the supported set */
export type SupportedLanguage = SharedSupportedLanguage;
