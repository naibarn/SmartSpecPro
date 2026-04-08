import { describe, expect, it } from "vitest";
import {
  buildCreditTransactionBackfillPatch,
  shouldBackfillMediaStudioOrigin,
  type CreditTransactionBackfillRow,
} from "../backfill-credit-transaction-sources";

function makeRow(
  overrides: Partial<CreditTransactionBackfillRow> = {},
): CreditTransactionBackfillRow {
  return {
    id: 1,
    sourceType: null,
    description: null,
    metadata: null,
    skillSlug: null,
    conversationId: null,
    skillCategory: null,
    ...overrides,
  };
}

describe("backfill-credit-transaction-sources", () => {
  it("backfills legacy media rows that are missing sourceType", () => {
    const patch = buildCreditTransactionBackfillPatch(makeRow({
      description: "VIDEO Generation: veo3/generate-veo-3-video-fast",
    }));

    expect(patch).toMatchObject({
      sourceType: "media_video",
    });
    expect(patch?.reasons).toContain("backfill sourceType=media_video");
  });

  it("normalizes legacy origin surface keys into originSurface", () => {
    const patch = buildCreditTransactionBackfillPatch(makeRow({
      sourceType: "media_video",
      metadata: {
        origin_surface: "media_studio",
      },
    }));

    expect(patch).toMatchObject({
      metadata: {
        origin_surface: "media_studio",
        originSurface: "media_studio",
      },
    });
    expect(patch?.reasons).toContain("normalize originSurface=media_studio");
  });

  it("marks Media Studio skill execution rows when no origin was stored", () => {
    const row = makeRow({
      description: "Skill execution: Cinematic Video Create Prompt",
      skillSlug: "cinematic-video-createprompt",
      skillCategory: "video_prompt_generation",
    });

    expect(shouldBackfillMediaStudioOrigin(row)).toBe(true);

    const patch = buildCreditTransactionBackfillPatch(row);
    expect(patch).toMatchObject({
      sourceType: "skill",
      metadata: {
        originSurface: "media_studio",
      },
    });
    expect(patch?.reasons).toContain("infer originSurface=media_studio");
  });

  it("marks non-image auto prompt enhancements with Media Studio origin", () => {
    const row = makeRow({
      description: "Auto Prompt enhancement (Cinematic Video Create Prompt)",
      skillSlug: "cinematic-video-createprompt",
      skillCategory: "video_prompt_generation",
    });

    expect(shouldBackfillMediaStudioOrigin(row)).toBe(true);

    const patch = buildCreditTransactionBackfillPatch(row);
    expect(patch?.metadata).toMatchObject({
      originSurface: "media_studio",
    });
  });

  it("does not label image prompt enhancement rows as Media Studio without stronger evidence", () => {
    const row = makeRow({
      description: "Auto Prompt enhancement (Image Prompt Engineer)",
      skillSlug: "image_prompt_engineer",
      skillCategory: "image_prompt_generation",
    });

    expect(shouldBackfillMediaStudioOrigin(row)).toBe(false);

    const patch = buildCreditTransactionBackfillPatch(row);
    expect(patch).toMatchObject({
      sourceType: "skill",
    });
    expect(patch?.metadata).toBeUndefined();
  });

  it("skips rows that already have normalized source and origin fields", () => {
    const patch = buildCreditTransactionBackfillPatch(makeRow({
      sourceType: "skill",
      description: "Skill execution: Cinematic Video Create Prompt",
      metadata: {
        originSurface: "media_studio",
      },
      skillSlug: "cinematic-video-createprompt",
      skillCategory: "video_prompt_generation",
    }));

    expect(patch).toBeNull();
  });

  it("backfills admin bonus rows from metadata action", () => {
    const patch = buildCreditTransactionBackfillPatch(makeRow({
      description: "Bonus",
      metadata: {
        action: "admin_add_credits",
      },
    }));

    expect(patch).toMatchObject({
      sourceType: "admin",
    });
  });

  it("backfills presentation orchestration fees to other", () => {
    const patch = buildCreditTransactionBackfillPatch(makeRow({
      description: "AI Layout from Note (orchestration fee)",
      metadata: {
        type: "ai_layout_from_note",
      },
    }));

    expect(patch).toMatchObject({
      sourceType: "other",
    });
  });
});
