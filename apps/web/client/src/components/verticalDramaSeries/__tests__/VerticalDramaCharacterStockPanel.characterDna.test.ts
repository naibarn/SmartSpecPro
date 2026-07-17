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

  it("omits empty optional MCP, reference, and negative fields", () => {
    const result = buildCharacterPromptConfirmPayload({
      ...BASE,
      negativePrompt: undefined,
      imageModelUsesMcp: true,
      mcpConnectionId: null,
      referenceAssetLinkId: null,
    });

    expect(result.payload).not.toHaveProperty("approvedNegativePrompt");
    expect(result.payload).not.toHaveProperty("mcpConnectionId");
    expect(result.payload).not.toHaveProperty("referenceAssetLinkId");
  });

  // `selectedImageModelId` is REQUIRED (not optional) — the server now
  // REJECTS image generation without an explicit model (fail-closed, no
  // more silent `DEFAULT_MODELS.image` fallback). Unlike the other optional
  // fields above, it is always included in the payload rather than
  // conditionally spread; the only caller (`handleCharacterPromptConfirm`)
  // guards on `requireModelSelected()` immediately before building this
  // payload, so it always has a non-empty value to pass in.
  it("always includes selectedImageModelId", () => {
    const result = buildCharacterPromptConfirmPayload(BASE);

    expect(result.payload.selectedImageModelId).toBe(BASE.selectedImageModelId);
  });
});
