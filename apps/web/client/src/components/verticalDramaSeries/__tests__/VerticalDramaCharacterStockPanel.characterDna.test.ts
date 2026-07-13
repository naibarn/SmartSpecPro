import { describe, expect, it } from "vitest";
import { buildCharacterPromptConfirmPayload } from "../VerticalDramaCharacterStockPanel";

const BASE = {
  seriesId: "10",
  characterId: "20",
  originalPrompt: "cinematic portrait of Mali",
  editedPrompt: "cinematic portrait of Mali",
  negativePrompt: "no crowd",
  approvedDesignSnapshot: { characterKey: "mali", visualBible: { version: 1 } },
  selectedImageModelId: "image-model",
  imageModelUsesMcp: false,
  mcpConnectionId: null,
  referenceAssetLinkId: "asset-5",
};

describe("buildCharacterPromptConfirmPayload", () => {
  it("carries the approved DNA snapshot when the prompt is unchanged", () => {
    const result = buildCharacterPromptConfirmPayload(BASE);

    expect(result.wasPromptEdited).toBe(false);
    expect(result.carriesApprovedDna).toBe(true);
    expect(result.payload.approvedDesignSnapshot).toBe(
      BASE.approvedDesignSnapshot
    );
  });

  it("treats whitespace-only changes as unchanged", () => {
    const result = buildCharacterPromptConfirmPayload({
      ...BASE,
      editedPrompt: "  cinematic portrait of Mali\n",
    });

    expect(result.wasPromptEdited).toBe(false);
    expect(result.payload.approvedDesignSnapshot).toBe(
      BASE.approvedDesignSnapshot
    );
  });

  it("omits stale DNA but preserves the edited render prompt", () => {
    const result = buildCharacterPromptConfirmPayload({
      ...BASE,
      editedPrompt: "cinematic full-body portrait of Mali in rain",
    });

    expect(result.wasPromptEdited).toBe(true);
    expect(result.carriesApprovedDna).toBe(false);
    expect(result.payload.approvedPrompt).toBe(
      "cinematic full-body portrait of Mali in rain"
    );
    expect(result.payload).not.toHaveProperty("approvedDesignSnapshot");
  });

  it("stays backward-compatible when preview has no snapshot", () => {
    const result = buildCharacterPromptConfirmPayload({
      ...BASE,
      approvedDesignSnapshot: undefined,
    });

    expect(result.wasPromptEdited).toBe(false);
    expect(result.carriesApprovedDna).toBe(false);
    expect(result.payload).not.toHaveProperty("approvedDesignSnapshot");
  });

  it("omits empty optional model, MCP, reference, and negative fields", () => {
    const result = buildCharacterPromptConfirmPayload({
      ...BASE,
      negativePrompt: undefined,
      selectedImageModelId: null,
      imageModelUsesMcp: true,
      mcpConnectionId: null,
      referenceAssetLinkId: null,
    });

    expect(result.payload).not.toHaveProperty("approvedNegativePrompt");
    expect(result.payload).not.toHaveProperty("selectedImageModelId");
    expect(result.payload).not.toHaveProperty("mcpConnectionId");
    expect(result.payload).not.toHaveProperty("referenceAssetLinkId");
  });
});
