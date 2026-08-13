import {
  verticalDramaLocaleEnglishName,
  type VerticalDramaSeriesLocale,
} from "./contracts";
import {
  readVerticalDramaDialogueLanguageProfile,
  type VerticalDramaDialogueLanguageProfile,
  type VerticalDramaSpokenLocaleId,
} from "./dialogueLanguageProfile";
import { buildVerticalDramaCharacterNamingContractPrompt } from "./characterNaming";

/**
 * Language ownership for the pre-create AI draft.
 *
 * Narrative fields belong to the current UI/content locale. A creator's
 * explicit spoken-language choice is allowed to control only title language
 * (for market coherence) plus dialogue/subtitle/TTS downstream. Auto keeps
 * titles in the UI language so legacy and unspecified flows remain stable.
 */
export type VerticalDramaDraftLanguageContract = {
  narrativeLocale: VerticalDramaSeriesLocale;
  titleLocale: VerticalDramaSeriesLocale;
  titleSource: "ui" | "spoken";
};

function spokenLocaleToContentLocale(
  spokenLocale: Exclude<VerticalDramaSpokenLocaleId, "auto">
): VerticalDramaSeriesLocale {
  if (spokenLocale.startsWith("en-")) return "en";
  if (spokenLocale.startsWith("th-")) return "th";
  if (spokenLocale.startsWith("zh-")) return "zh";
  if (spokenLocale.startsWith("ja-")) return "ja";
  if (spokenLocale.startsWith("ko-")) return "ko";
  if (spokenLocale.startsWith("es-")) return "es";
  if (spokenLocale.startsWith("pt-")) return "pt";
  if (spokenLocale.startsWith("fr-")) return "fr";
  if (spokenLocale.startsWith("vi-")) return "vi";
  if (spokenLocale.startsWith("id-")) return "id";
  if (spokenLocale.startsWith("fil-")) return "fil";
  if (spokenLocale.startsWith("hi-")) return "hi";
  if (spokenLocale.startsWith("ar-")) return "ar";
  if (spokenLocale.startsWith("de-")) return "de";
  if (spokenLocale.startsWith("it-")) return "it";
  if (spokenLocale.startsWith("tr-")) return "tr";
  if (spokenLocale.startsWith("ru-")) return "ru";
  return "en";
}

export function resolveVerticalDramaDraftLanguageContract(params: {
  narrativeLocale: VerticalDramaSeriesLocale;
  dialogueLanguageProfile?: VerticalDramaDialogueLanguageProfile | null;
}): VerticalDramaDraftLanguageContract {
  const profile = readVerticalDramaDialogueLanguageProfile(
    params.dialogueLanguageProfile
  );
  const explicitSpokenLocale = profile.spokenLocale;

  return {
    narrativeLocale: params.narrativeLocale,
    titleLocale:
      explicitSpokenLocale && explicitSpokenLocale !== "auto"
        ? spokenLocaleToContentLocale(explicitSpokenLocale)
        : params.narrativeLocale,
    titleSource:
      explicitSpokenLocale && explicitSpokenLocale !== "auto" ? "spoken" : "ui",
  };
}

/**
 * Prompt block for the pre-create draft. Keep this separate from the spoken
 * profile prompt so an English voice request cannot take over the story prose.
 */
export function buildVerticalDramaDraftLanguageContractPrompt(params: {
  narrativeLocale: VerticalDramaSeriesLocale;
  dialogueLanguageProfile?: VerticalDramaDialogueLanguageProfile | null;
}): string {
  const contract = resolveVerticalDramaDraftLanguageContract(params);
  const narrativeLanguage = verticalDramaLocaleEnglishName(
    contract.narrativeLocale
  );
  const titleLanguage = verticalDramaLocaleEnglishName(contract.titleLocale);
  const titleReason =
    contract.titleSource === "spoken"
      ? "The creator explicitly selected a spoken-language market, so title/titleOptions must use that market's primary written language."
      : "No explicit spoken-language market was selected, so title/titleOptions follow the current UI/content language.";

  return [
    "DRAFT LANGUAGE CONTRACT (HARD CONTRACT)",
    `Narrative/content language: ${narrativeLanguage}. Write logline, mainPlot, seasonArc, tone, cliffhangerStyle, creatorSummary, character descriptions, locations, visualBible, mixRecipe rationale, and warnings in this language. Character names follow the CHARACTER NAMING & CULTURAL COHERENCE CONTRACT below, not the UI language.`,
    `Title language: ${titleLanguage}. Write both title and every titleOptions candidate in this language.`,
    titleReason,
    "The title language rule is an intentional exception for market coherence; it must not change the language of the narrative fields listed above.",
    "Do not use the spoken dialogue language to write the logline, synopsis, plot, season arc, creator summary, character descriptions or metadata prose, or visual descriptions; character names remain governed by the naming contract above.",
    buildVerticalDramaCharacterNamingContractPrompt({
      narrativeLocale: params.narrativeLocale,
      dialogueLanguageProfile: params.dialogueLanguageProfile,
    }),
    "Return a complete creator-readable story draft: logline is one clear sentence, mainPlot is a coherent 2–4 sentence synopsis, seasonArc explains the season progression, and creatorSummary restates the same story in plain language rather than synthesis metadata.",
  ].join(" ");
}
