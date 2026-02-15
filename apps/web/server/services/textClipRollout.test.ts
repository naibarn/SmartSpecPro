import { afterEach, describe, expect, it } from "vitest";

import {
  assertTextClipRolloutEnabledForSpec,
  hasTextSemanticsInJobSpec,
  isTextClipEnabledForTenant,
} from "./textClipRollout";

const ORIGINAL_TEXT_CLIP_T1_ENABLED = process.env.TEXT_CLIP_T1_ENABLED;
const ORIGINAL_TEXT_CLIP_T1_ENABLED_TENANTS = process.env.TEXT_CLIP_T1_ENABLED_TENANTS;

afterEach(() => {
  if (ORIGINAL_TEXT_CLIP_T1_ENABLED === undefined) {
    delete process.env.TEXT_CLIP_T1_ENABLED;
  } else {
    process.env.TEXT_CLIP_T1_ENABLED = ORIGINAL_TEXT_CLIP_T1_ENABLED;
  }

  if (ORIGINAL_TEXT_CLIP_T1_ENABLED_TENANTS === undefined) {
    delete process.env.TEXT_CLIP_T1_ENABLED_TENANTS;
  } else {
    process.env.TEXT_CLIP_T1_ENABLED_TENANTS = ORIGINAL_TEXT_CLIP_T1_ENABLED_TENANTS;
  }
});

describe("isTextClipEnabledForTenant", () => {
  it("defaults to enabled with no explicit flag config", () => {
    delete process.env.TEXT_CLIP_T1_ENABLED;
    delete process.env.TEXT_CLIP_T1_ENABLED_TENANTS;
    expect(isTextClipEnabledForTenant(null)).toBe(true);
    expect(isTextClipEnabledForTenant("tenant-A")).toBe(true);
  });

  it("disables for all tenants when TEXT_CLIP_T1_ENABLED=false", () => {
    process.env.TEXT_CLIP_T1_ENABLED = "false";
    process.env.TEXT_CLIP_T1_ENABLED_TENANTS = "tenant-A,tenant-B";
    expect(isTextClipEnabledForTenant("tenant-A")).toBe(false);
    expect(isTextClipEnabledForTenant("tenant-B")).toBe(false);
    expect(isTextClipEnabledForTenant(null)).toBe(false);
  });

  it("allows only allowlisted tenants when tenant allowlist is configured", () => {
    process.env.TEXT_CLIP_T1_ENABLED = "true";
    process.env.TEXT_CLIP_T1_ENABLED_TENANTS = "tenant-A, 44";
    expect(isTextClipEnabledForTenant("tenant-A")).toBe(true);
    expect(isTextClipEnabledForTenant(44)).toBe(true);
    expect(isTextClipEnabledForTenant("tenant-B")).toBe(false);
    expect(isTextClipEnabledForTenant(null)).toBe(false);
  });
});

describe("hasTextSemanticsInJobSpec", () => {
  it("detects explicit subtitle tracks", () => {
    expect(
      hasTextSemanticsInJobSpec({
        inputs: {
          project: {
            tracks: [{ trackId: "t1", type: "subtitle", clips: [] }],
          },
        } as any,
      }),
    ).toBe(true);
  });

  it("detects textConfig on non-subtitle tracks", () => {
    expect(
      hasTextSemanticsInJobSpec({
        inputs: {
          project: {
            tracks: [
              {
                trackId: "v1",
                type: "video",
                clips: [
                  {
                    clipId: "clip-1",
                    assetId: "asset-1",
                    startMs: 0,
                    textConfig: { text: "hello" },
                  },
                ],
              },
            ],
          },
        } as any,
      }),
    ).toBe(true);
  });

  it("returns false for non-text timelines", () => {
    expect(
      hasTextSemanticsInJobSpec({
        inputs: {
          project: {
            tracks: [{ trackId: "v1", type: "video", clips: [] }],
          },
        } as any,
      }),
    ).toBe(false);
  });
});

describe("assertTextClipRolloutEnabledForSpec", () => {
  it("blocks text semantics when rollout is disabled", () => {
    process.env.TEXT_CLIP_T1_ENABLED = "false";
    expect(() =>
      assertTextClipRolloutEnabledForSpec(
        {
          inputs: {
            project: {
              tracks: [{ trackId: "t1", type: "subtitle", clips: [] }],
            },
          } as any,
        },
        "tenant-A",
      ),
    ).toThrow("Text clip rollout is disabled for this tenant cohort");
  });

  it("allows non-text semantics when rollout is disabled", () => {
    process.env.TEXT_CLIP_T1_ENABLED = "false";
    expect(() =>
      assertTextClipRolloutEnabledForSpec(
        {
          inputs: {
            project: {
              tracks: [{ trackId: "v1", type: "video", clips: [] }],
            },
          } as any,
        },
        "tenant-A",
      ),
    ).not.toThrow();
  });
});
