import { describe, expect, it } from "vitest";

import { POSTGRES_NODE_JOB_TYPES } from "../../jobs/feature186JobTypes";
import { defaultJobExecutorRegistry } from "../jobExecutorRegistry";

describe("content protection control-plane registration", () => {
  it("keeps protection execution on the native Worker App lane", () => {
    expect(POSTGRES_NODE_JOB_TYPES.has("content_protection.protect")).toBe(
      false
    );
    expect(POSTGRES_NODE_JOB_TYPES.has("content_protection.verify")).toBe(true);
    expect(
      defaultJobExecutorRegistry.resolve(
        "content_protection.protect",
        "content-protection.v1"
      )
    ).toBeDefined();
    expect(
      defaultJobExecutorRegistry.resolve(
        "content_protection.verify",
        "content-protection.verify.v1"
      )
    ).toBeDefined();
  });
});
