/**
 * Opt-in per-model provider input defaults
 * (`planning/vd-media-model-default-input-params/plan.md`).
 *
 * The incident: kie's `seedream/5-pro-image-to-image` REQUIRES a `quality`
 * field (`basic`/`high`). The catalog row declares it in `inputFields` with a
 * default — but `inputFields` is a FORM schema, consumed only by Media
 * Studio's dynamic form. A server-initiated generation (the Vertical Drama
 * character tab) never renders that form, so the field was simply never sent
 * and kie answered "This field is required", leaving the task pending forever.
 * `seedream/5-pro` had never completed a single generation in this system.
 *
 * The deliberate design choice these tests pin: `defaultInputParams` is a NEW
 * opt-in key, NOT "apply every `inputFields` default". 90 of the 148 enabled
 * models carry `inputFields` defaults and most generate correctly today by
 * letting the provider choose its own default — changing the outbound payload
 * of 90 models to fix one is not a trade worth making. A model that declares
 * nothing must behave byte-identically to before this existed.
 */
import { describe, expect, it } from "vitest";
import {
  applyModelDefaultInputParams,
  readModelDefaultInputParams,
} from "../mediaGenerationService";

describe("readModelDefaultInputParams", () => {
  it("reads the opt-in defaults off apiConfig", () => {
    expect(
      readModelDefaultInputParams({
        apiConfig: { defaultInputParams: { quality: "basic" } },
      }),
    ).toEqual({ quality: "basic" });
  });

  it("keeps numbers and booleans, which are legitimate provider input values", () => {
    expect(
      readModelDefaultInputParams({
        apiConfig: { defaultInputParams: { steps: 30, nsfw_checker: false } },
      }),
    ).toEqual({ steps: 30, nsfw_checker: false });
  });

  it("drops non-scalar values — an object here is a config error, not a provider field", () => {
    expect(
      readModelDefaultInputParams({
        apiConfig: {
          defaultInputParams: { quality: "basic", nested: { a: 1 }, list: [1, 2] },
        },
      }),
    ).toEqual({ quality: "basic" });
  });

  it("returns undefined for every model that does not opt in", () => {
    expect(readModelDefaultInputParams(null)).toBeUndefined();
    expect(readModelDefaultInputParams(undefined)).toBeUndefined();
    expect(readModelDefaultInputParams({})).toBeUndefined();
    expect(readModelDefaultInputParams({ apiConfig: {} })).toBeUndefined();
    // The exact shape 90 enabled models already have — declaring inputFields
    // defaults must NOT opt a model in.
    expect(
      readModelDefaultInputParams({
        inputFields: [{ key: "quality", default: "basic" }],
      }),
    ).toBeUndefined();
    // An empty object carries no defaults, so it stays undefined rather than
    // becoming an empty extra_params object.
    expect(
      readModelDefaultInputParams({ apiConfig: { defaultInputParams: {} } }),
    ).toBeUndefined();
  });
});

describe("applyModelDefaultInputParams", () => {
  it("fills a gap the caller left", () => {
    expect(
      applyModelDefaultInputParams({ seed: 7 }, { quality: "basic" }),
    ).toEqual({ seed: 7, quality: "basic" });
  });

  it("lets the caller's explicit value win over the default", () => {
    expect(
      applyModelDefaultInputParams({ quality: "high" }, { quality: "basic" }),
    ).toEqual({ quality: "high" });
  });

  it("supplies the defaults even when the caller sent no extra params at all", () => {
    expect(applyModelDefaultInputParams(undefined, { quality: "basic" })).toEqual({
      quality: "basic",
    });
  });

  it("returns the caller's object untouched when the model declares nothing", () => {
    const caller = { seed: 7 };
    expect(applyModelDefaultInputParams(caller, undefined)).toBe(caller);
    expect(applyModelDefaultInputParams(undefined, undefined)).toBeUndefined();
  });
});
