import { describe, expect, it } from "vitest";

import {
  getDevelopmentLifecyclePredicate,
  registerDevelopmentLifecyclePredicate,
  requireDevelopmentLifecyclePredicate,
} from "../developmentLifecyclePredicateRegistry";

describe("development lifecycle predicate registry", () => {
  it("requires a registered verifier and removes it when its owner shuts down", () => {
    const dispose = registerDevelopmentLifecyclePredicate({
      predicateId: "test:canonical-artifact",
      verifyEvidence: async ({ evidence }) => evidence,
      recheck: async () => null,
    });
    expect(getDevelopmentLifecyclePredicate("test:canonical-artifact")).not.toBeNull();
    expect(requireDevelopmentLifecyclePredicate("test:canonical-artifact").predicateId)
      .toBe("test:canonical-artifact");
    expect(() => registerDevelopmentLifecyclePredicate({
      predicateId: "test:canonical-artifact",
      verifyEvidence: async ({ evidence }) => evidence,
      recheck: async () => null,
    })).toThrow("DEVELOPMENT_PREDICATE_DUPLICATE");

    dispose();
    expect(getDevelopmentLifecyclePredicate("test:canonical-artifact")).toBeNull();
    expect(() => requireDevelopmentLifecyclePredicate("test:canonical-artifact"))
      .toThrow("DEVELOPMENT_PREDICATE_UNAVAILABLE");
  });
});
