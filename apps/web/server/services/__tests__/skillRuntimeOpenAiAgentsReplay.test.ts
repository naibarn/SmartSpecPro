import { describe, expect, it } from "vitest";

import { compareSharedSkillReplaySnapshots } from "../agentRuntime/skillRuntimeOrchestrator";

describe("compareSharedSkillReplaySnapshots", () => {
  it("detects selected skill drift", () => {
    const result = compareSharedSkillReplaySnapshots(
      {
        selectedSkillSlug: "create-image-prompt",
        schemaValid: true,
        status: "completed",
      },
      {
        selectedSkillSlug: "general-article-writer",
        schemaValid: true,
        status: "completed",
      },
    );

    expect(result).toEqual({
      matches: false,
      mismatchCodes: ["selected_skill_drift"],
    });
  });

  it("detects schema validity drift", () => {
    const result = compareSharedSkillReplaySnapshots(
      {
        selectedSkillSlug: "create-image-prompt",
        schemaValid: true,
        status: "completed",
      },
      {
        selectedSkillSlug: "create-image-prompt",
        schemaValid: false,
        status: "completed",
      },
    );

    expect(result).toEqual({
      matches: false,
      mismatchCodes: ["schema_validity_drift"],
    });
  });

  it("detects runtime status drift", () => {
    const result = compareSharedSkillReplaySnapshots(
      {
        selectedSkillSlug: "create-image-prompt",
        schemaValid: true,
        status: "completed",
      },
      {
        selectedSkillSlug: "create-image-prompt",
        schemaValid: true,
        status: "failed",
      },
    );

    expect(result).toEqual({
      matches: false,
      mismatchCodes: ["status_drift"],
    });
  });
});
