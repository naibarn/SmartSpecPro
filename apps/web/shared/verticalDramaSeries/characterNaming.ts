import {
  readVerticalDramaDialogueLanguageProfile,
  resolveVerticalDramaSpokenLocale,
  type VerticalDramaDialogueLanguageProfile,
} from "./dialogueLanguageProfile";
import type { VerticalDramaSeriesLocale } from "./contracts";

export type VerticalDramaCharacterNamingContract = {
  narrativeLocale: VerticalDramaSeriesLocale;
  spokenLocale: string;
  source: "explicit_spoken_market" | "content_locale_default";
  defaultMarket: string;
  guidance: string;
};

function namingGuidanceForSpokenLocale(spokenLocale: string): {
  defaultMarket: string;
  guidance: string;
} {
  if (spokenLocale === "en-US") {
    return {
      defaultMarket: "United States / contemporary American market",
      guidance:
        "When the story does not explicitly establish another setting, heritage, or user-supplied name, use plausible contemporary American names and natural US naming patterns. Do not use a Thai-only name merely because the narrative UI language is Thai.",
    };
  }
  if (["en-GB", "en-IE"].includes(spokenLocale)) {
    return {
      defaultMarket: "United Kingdom / Ireland contemporary market",
      guidance:
        "When no setting or heritage overrides it, use plausible contemporary British or Irish names appropriate to the established location and character background.",
    };
  }
  if (["en-AU", "en-NZ", "en-CA", "en-SG", "en-IN", "en-INTL"].includes(spokenLocale)) {
    return {
      defaultMarket: "the established English-speaking story market",
      guidance:
        "Do not infer ethnicity from English alone. Choose names from the established setting and character heritage; when neither is specified, use a plausible diverse name set appropriate to the selected English-speaking market.",
    };
  }
  if (spokenLocale.startsWith("th-")) {
    return {
      defaultMarket: "Thailand / contemporary Thai market",
      guidance:
        "Use natural contemporary Thai names and address conventions, including nicknames when appropriate to the character and setting.",
    };
  }
  if (spokenLocale.startsWith("zh-")) {
    return {
      defaultMarket: "the selected Chinese-speaking market",
      guidance:
        "Use names and romanization appropriate to the selected Chinese-speaking setting; do not mix Mainland, Taiwan, Hong Kong, or overseas conventions without a story reason.",
    };
  }
  if (spokenLocale.startsWith("ja-")) {
    return {
      defaultMarket: "Japan / contemporary Japanese market",
      guidance:
        "Use plausible contemporary Japanese names and preserve the selected naming order/romanization convention consistently.",
    };
  }
  if (spokenLocale.startsWith("ko-")) {
    return {
      defaultMarket: "South Korea / contemporary Korean market",
      guidance:
        "Use plausible contemporary Korean names and keep the chosen romanization consistent across the character bible and dialogue.",
    };
  }
  return {
    defaultMarket: "the story setting and target market",
    guidance:
      "Choose names from the established setting and character heritage, using the target market's normal written form and romanization consistently.",
  };
}

export function resolveVerticalDramaCharacterNamingContract(params: {
  narrativeLocale: VerticalDramaSeriesLocale;
  dialogueLanguageProfile?: VerticalDramaDialogueLanguageProfile | null;
}): VerticalDramaCharacterNamingContract {
  const profile = readVerticalDramaDialogueLanguageProfile(
    params.dialogueLanguageProfile,
  );
  const spokenLocale = resolveVerticalDramaSpokenLocale({
    locale: params.narrativeLocale,
    profile,
  });
  const naming = namingGuidanceForSpokenLocale(spokenLocale);
  return {
    narrativeLocale: params.narrativeLocale,
    spokenLocale,
    source:
      profile.spokenLocale && profile.spokenLocale !== "auto"
        ? "explicit_spoken_market"
        : "content_locale_default",
    ...naming,
  };
}

export function buildVerticalDramaCharacterNamingContractPrompt(params: {
  narrativeLocale: VerticalDramaSeriesLocale;
  dialogueLanguageProfile?: VerticalDramaDialogueLanguageProfile | null;
}): string {
  const contract = resolveVerticalDramaCharacterNamingContract(params);
  return [
    "CHARACTER NAMING & CULTURAL COHERENCE CONTRACT (HARD CONTRACT)",
    `Narrative/content language remains ${contract.narrativeLocale}; effective spoken market is ${contract.spokenLocale}; naming default is ${contract.defaultMarket}.`,
    contract.guidance,
    "Priority 1: a creator-supplied character name, explicit story setting, heritage, nationality, diaspora identity, or lineage canon. Preserve it; do not translate, anglicize, or replace it just to match the title language.",
    "Priority 2: character-level casting preferences and the established story world.",
    "Priority 3: the selected spoken market's naming convention. The current UI language controls story prose, not character identity.",
    "A title written in English does not by itself require every character to have an English name, and English dialogue does not by itself prove an American setting. If a cross-cultural name is intentional, make the character's setting or heritage clear in the character description so the choice is understandable.",
    "Keep every character's name internally consistent across the draft, refined character bible, dialogue speakers, subtitles, and visual prompts. Use one canonical spelling and declare meaningful nicknames or romanizations as aliases rather than silently changing the name.",
    "Character descriptions and explanations remain in the narrative/content language; character names follow this naming contract.",
  ].join(" ");
}

export function getVerticalDramaCharacterNamingPreview(params: {
  narrativeLocale: VerticalDramaSeriesLocale;
  dialogueLanguageProfile?: VerticalDramaDialogueLanguageProfile | null;
}): string {
  const contract = resolveVerticalDramaCharacterNamingContract(params);
  return `${contract.defaultMarket}; ${contract.spokenLocale}; ${contract.source === "explicit_spoken_market" ? "explicit spoken-market selection" : "content-locale default"}`;
}
