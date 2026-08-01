import { describe, expect, it } from "vitest";

import {
  VD_LOOK_LOCK_GENRES,
  applySeriesLookToImagePrompt,
  getSeriesLookLockGenreIdentity,
  resolveEffectiveSeriesVisualIdentity,
  validateSeriesLookManualPatch,
  type VdLookLockControl,
} from "../seriesLookLock";
import type { VerticalDramaPresetVisualIdentity } from "../presetVisualIdentity";

const inheritedIdentity: VerticalDramaPresetVisualIdentity = {
  styleName: "Inherited soft drama",
  palette: ["cream", "navy", "warm gray"],
  lighting: "soft window light",
  environmentMotifs: ["lived-in rooms"],
  wardrobeGrammar: ["grounded contemporary tailoring"],
  signaturePropsAndCompanions: [],
  cameraGrammar: "restrained still composition",
  characterArchetypes: [],
  imagePromptFragments: {
    positive: ["soft window light", "grounded production design"],
    negative: ["neon cyberpunk"],
  },
};

function bible(control?: VdLookLockControl, identity = inheritedIdentity) {
  return {
    story: "unrelated",
    presetVisualIdentity: identity,
    ...(control ? { lookLockControl: control } : {}),
  };
}

describe("series look-lock catalog", () => {
  it("freezes exactly five product genres", () => {
    expect(VD_LOOK_LOCK_GENRES).toEqual([
      "drama_romance",
      "horror_thriller",
      "sci_fi_cyberpunk",
      "action_epic",
      "fantasy_fairytale",
    ]);
  });

  it.each(VD_LOOK_LOCK_GENRES)("returns a bounded complete identity for %s", key => {
    const identity = getSeriesLookLockGenreIdentity(key);
    expect(identity.palette.length).toBeGreaterThanOrEqual(3);
    expect(identity.palette.length).toBeLessThanOrEqual(6);
    expect(identity.imagePromptFragments.positive.length).toBeLessThanOrEqual(12);
    expect(JSON.stringify(identity)).not.toMatch(/gpt|openai|midjourney|4k|8k|1080/i);
  });
});

describe("effective series visual identity", () => {
  it("keeps the legacy preset path governed only by preset-mix", () => {
    expect(resolveEffectiveSeriesVisualIdentity({
      bible: bible(),
      presetMixEnabled: true,
      lookLockEnabled: false,
    })).toEqual(inheritedIdentity);
    expect(resolveEffectiveSeriesVisualIdentity({
      bible: bible(),
      presetMixEnabled: false,
      lookLockEnabled: true,
    })).toBeUndefined();
  });

  it("keeps stored genre/manual data inert while the look flag is off", () => {
    const control: VdLookLockControl = {
      mode: "genre",
      genreKey: "horror_thriller",
      inheritedIdentity,
      inheritedSource: "preset",
      inheritedGovernance: "preset_mix",
      revision: 2,
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    expect(resolveEffectiveSeriesVisualIdentity({
      bible: bible(control, getSeriesLookLockGenreIdentity("horror_thriller")),
      presetMixEnabled: true,
      lookLockEnabled: false,
    })).toEqual(inheritedIdentity);
  });

  it.each(["genre", "manual"] as const)("lets look-lock govern %s mode", mode => {
    const active = getSeriesLookLockGenreIdentity("action_epic");
    const control: VdLookLockControl = {
      mode,
      inheritedIdentity,
      inheritedSource: "preset",
      inheritedGovernance: "preset_mix",
      revision: 3,
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    expect(resolveEffectiveSeriesVisualIdentity({
      bible: bible(control, active),
      presetMixEnabled: false,
      lookLockEnabled: true,
    })).toEqual(active);
  });

  it("returns no identity for none, malformed, or unauthorized state", () => {
    const none: VdLookLockControl = {
      mode: "none",
      inheritedIdentity,
      inheritedGovernance: "preset_mix",
      revision: 2,
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    expect(resolveEffectiveSeriesVisualIdentity({
      bible: bible(none), presetMixEnabled: true, lookLockEnabled: true,
    })).toBeUndefined();
    expect(resolveEffectiveSeriesVisualIdentity({
      bible: { presetVisualIdentity: { styleName: "bad" } },
      presetMixEnabled: true,
      lookLockEnabled: true,
    })).toBeUndefined();
  });

  it("restores an inherited source only under its recorded governance", () => {
    const control: VdLookLockControl = {
      mode: "inherit_source",
      inheritedIdentity,
      inheritedSource: "lineage",
      inheritedGovernance: "look_lock",
      revision: 4,
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    expect(resolveEffectiveSeriesVisualIdentity({
      bible: bible(control), presetMixEnabled: true, lookLockEnabled: false,
    })).toBeUndefined();
    expect(resolveEffectiveSeriesVisualIdentity({
      bible: bible(control), presetMixEnabled: false, lookLockEnabled: true,
    })).toEqual(inheritedIdentity);
  });
});

describe("look-lock validation and final prompt assembly", () => {
  it("accepts only editable fields and rejects controls/oversized strings", () => {
    expect(validateSeriesLookManualPatch({ styleName: "  Noir drama  " })).toEqual({
      ok: true,
      value: { styleName: "Noir drama" },
    });
    expect(validateSeriesLookManualPatch({ styleName: "bad\u0000value" })).toMatchObject({ ok: false });
    expect(validateSeriesLookManualPatch({ lighting: "x".repeat(501) })).toMatchObject({ ok: false });
    expect(validateSeriesLookManualPatch({ referenceAssetIds: ["forbidden"] })).toMatchObject({ ok: false });
  });

  it("appends positive and negative fragments exactly once", () => {
    const once = applySeriesLookToImagePrompt({
      prompt: "portrait, soft window light",
      negativePrompt: "blur",
      identity: inheritedIdentity,
    });
    const twice = applySeriesLookToImagePrompt({ ...once, identity: inheritedIdentity });
    expect(once).toEqual({
      prompt: "portrait, soft window light, grounded production design",
      negativePrompt: "blur, neon cyberpunk",
    });
    expect(twice).toEqual(once);
  });
});
