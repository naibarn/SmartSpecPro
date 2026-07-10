/**
 * Vertical Drama Series — Feature 132 server-side quality-criteria wrapper
 * (spec §11 "Unified Criteria Application"; plan
 * `sections/section-01-shared-criteria-and-flags.md`).
 *
 * Thin composition over `@shared/verticalDramaSeries/qualityCriteria`
 * (the pure-TS single source of truth) — this is the ONE function every
 * Feature 132 consumer service imports to get the current criteria bundle,
 * and the ONE function every consumer prompt/output embeds to stamp its
 * `criteriaVersion`. No LLM calls, no DB access.
 *
 * Every §11 consumer entry point MUST call `renderCriteriaVersionMarker()`
 * and embed its output in its built prompt (and/or stamp `bundle.version`
 * on its output) — enforced by
 * `server/services/__tests__/verticalDramaQualityCriteria.agreement.test.ts`.
 */

import {
  CRITERIA_VERSION,
  QUALITY_FINDING_SEVERITIES,
  buildCriteriaVersionMarker,
  buildDialogueRulesV2Fragment,
  buildDramaturgyRulesFragment,
  buildSceneContractRequirementsFragment,
  type VerticalDramaQualityFindingSeverity,
} from "@shared/verticalDramaSeries/qualityCriteria";

export interface VerticalDramaQualityCriteriaBundle {
  version: number;
  dialogueRulesV2: string;
  sceneContractRequirements: string;
  dramaturgyRules: string;
  severityTaxonomy: readonly VerticalDramaQualityFindingSeverity[];
}

/**
 * Returns the current Feature 132 quality-criteria bundle: the dialogue
 * rules v2 fragment, scene-contract requirement fragment, dramaturgy rules
 * fragment, and severity taxonomy, all stamped with the current
 * `CRITERIA_VERSION`. This is the one function every §11 consumer service
 * imports — no consumer should import the shared fragment builders
 * directly (keeps a single call site to update if the bundle shape ever
 * changes).
 */
export function getVerticalDramaQualityCriteriaBundle(): VerticalDramaQualityCriteriaBundle {
  return {
    version: CRITERIA_VERSION,
    dialogueRulesV2: buildDialogueRulesV2Fragment(),
    sceneContractRequirements: buildSceneContractRequirementsFragment(),
    dramaturgyRules: buildDramaturgyRulesFragment(),
    severityTaxonomy: QUALITY_FINDING_SEVERITIES,
  };
}

/**
 * Returns a fixed, greppable literal (e.g. `<!-- VD_QUALITY_CRITERIA_V1 -->`)
 * that consumer prompts must embed and consumer outputs must stamp as
 * `criteriaVersion`. The agreement test greps every §11 consumer's built
 * prompt/output for this exact string.
 */
export function renderCriteriaVersionMarker(): string {
  return buildCriteriaVersionMarker();
}
