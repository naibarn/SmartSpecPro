import { describe, expect, it } from "vitest";

import {
  agentRegistryOutcomeMemory,
  agentRegistryPolicyBindings,
  agentRegistryPromotionReviews,
  agentRegistryRegistries,
  agentRegistryRolloutBindings,
  agentRegistryVersions,
} from "../schema";

describe("agentRegistry schema", () => {
  it("exports the registry tables needed for governed agent selection", () => {
    expect(Object.keys(agentRegistryRegistries)).toEqual(expect.arrayContaining([
      "id",
      "tenantId",
      "registryKey",
      "agentKind",
      "title",
      "currentStableVersionId",
      "currentLatestVersionId",
      "rolloutState",
    ]));

    expect(Object.keys(agentRegistryVersions)).toEqual(expect.arrayContaining([
      "id",
      "tenantId",
      "registryId",
      "versionNumber",
      "versionStatus",
      "rolloutState",
      "isStable",
      "reviewRequired",
    ]));

    expect(Object.keys(agentRegistryPolicyBindings)).toEqual(expect.arrayContaining([
      "id",
      "registryId",
      "versionId",
      "purpose",
      "supportedToolClasses",
      "memoryScopeJson",
      "budgetPolicyJson",
      "outcomeMemoryHook",
    ]));

    expect(Object.keys(agentRegistryRolloutBindings)).toEqual(expect.arrayContaining([
      "id",
      "registryId",
      "versionId",
      "tenantTargetId",
      "teamTargetId",
      "queueTargetId",
      "workpackFamily",
    ]));

    expect(Object.keys(agentRegistryPromotionReviews)).toEqual(expect.arrayContaining([
      "id",
      "registryId",
      "proposedVersionId",
      "baselineVersionId",
      "decision",
      "reason",
    ]));

    expect(Object.keys(agentRegistryOutcomeMemory)).toEqual(expect.arrayContaining([
      "id",
      "registryId",
      "versionId",
      "workloadClass",
      "outcome",
      "redactionState",
      "retentionTier",
    ]));
  });
});
