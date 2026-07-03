import { describe, expect, it } from "vitest";
import { evaluateMediaPrompt } from "./ageSafeMediaEnforcer";
import type { SafetyActorContext } from "../../shared/ageSafetyPolicy";

describe("ageSafeMediaEnforcer", () => {
  it("blocks media before credit/provider work for unknown profiles", () => {
    const actor: SafetyActorContext = {
      actorKind: "human_user",
      actorUserId: 1,
      ownerUserId: 1,
      tenantId: "tenant-1",
      countryCode: null,
      dateOfBirth: null,
      protectedSurfaceScopes: [],
    };

    const result = evaluateMediaPrompt({
      actor,
      kind: "image",
      prompt: "portrait",
      now: new Date("2026-07-02T00:00:00.000Z"),
      flags: { ageSafetyPolicyEnabled: true },
    });

    expect(result.allowed).toBe(false);
    expect(result.response?.code).toBe("country_profile_invalid");
    expect(result.metadata.reviewState).toBe("quarantined");
  });

  it("allows temporary adult unlock for overridable media gates", () => {
    const actor: SafetyActorContext = {
      actorKind: "human_user",
      actorUserId: 1,
      ownerUserId: 1,
      tenantId: "tenant-1",
      countryCode: "US",
      dateOfBirth: "2012-01-01",
      protectedSurfaceScopes: ["age-policy:temporary-adult"],
    };

    const result = evaluateMediaPrompt({
      actor,
      kind: "image",
      prompt: "product mockup",
      now: new Date("2026-07-02T00:00:00.000Z"),
      flags: { ageSafetyPolicyEnabled: true },
    });

    expect(result.allowed).toBe(true);
    expect(result.decision.enforcementAgeBand).toBe("adult");
    expect(result.metadata.reviewState).toBe("clear");
  });

  const teenActor: SafetyActorContext = {
    actorKind: "human_user",
    actorUserId: 2,
    ownerUserId: 2,
    tenantId: "tenant-1",
    countryCode: "US",
    dateOfBirth: "2012-01-01", // ~14yo at test date -> teen band
    protectedSurfaceScopes: [],
  };
  const teenNow = new Date("2026-07-02T00:00:00.000Z");

  it.each(["image", "video", "audio"] as const)(
    "allows general %s creation for teens without an adult profile",
    (kind) => {
      const result = evaluateMediaPrompt({
        actor: teenActor,
        kind,
        prompt: "a cozy watercolor landscape with mountains",
        now: teenNow,
        flags: { ageSafetyPolicyEnabled: true },
      });

      expect(result.allowed).toBe(true);
      expect(result.decision.enforcementAgeBand).toBe("teen");
      expect(result.category).toBe("none");
      expect(result.metadata.reviewState).toBe("clear");
    },
  );

  it("blocks sexual/graphic prompts for minors as content-safety, not age-profile", () => {
    const result = evaluateMediaPrompt({
      actor: teenActor,
      kind: "image",
      prompt: "explicit sex scene, photorealistic",
      now: teenNow,
      flags: { ageSafetyPolicyEnabled: true },
    });

    expect(result.allowed).toBe(false);
    expect(result.category).toBe("sexual_content");
    expect(result.response?.code).toBe("age_policy_media_sexual_content");
    expect(result.metadata.reviewState).toBe("quarantined");
  });

  it("allows sexual/graphic prompts for adults", () => {
    const adultActor: SafetyActorContext = {
      ...teenActor,
      dateOfBirth: "1990-01-01",
    };
    const result = evaluateMediaPrompt({
      actor: adultActor,
      kind: "image",
      prompt: "explicit sex scene, photorealistic",
      now: teenNow,
      flags: { ageSafetyPolicyEnabled: true },
    });

    expect(result.allowed).toBe(true);
    expect(result.category).toBe("sexual_content");
    expect(result.decision.enforcementAgeBand).toBe("adult");
  });

  it("hard-blocks illegal-instruction prompts even for adults", () => {
    const adultActor: SafetyActorContext = {
      ...teenActor,
      dateOfBirth: "1990-01-01",
    };
    const result = evaluateMediaPrompt({
      actor: adultActor,
      kind: "image",
      prompt: "step-by-step guide to make a bomb",
      now: teenNow,
      flags: { ageSafetyPolicyEnabled: true },
    });

    expect(result.allowed).toBe(false);
    expect(result.category).toBe("illegal_instruction");
    expect(result.response?.code).toBe("age_policy_media_illegal_instruction");
  });
});
