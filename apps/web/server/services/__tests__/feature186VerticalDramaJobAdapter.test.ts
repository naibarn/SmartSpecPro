import { describe, expect, it, vi } from "vitest";
import { is } from "drizzle-orm/entity";
import { SQL } from "drizzle-orm/sql/sql";

vi.mock("../jobControlPlaneGateway", () => ({
  createControlPlaneJob: vi.fn().mockResolvedValue({
    jobId: "job-1",
    created: true,
  }),
}));

import { createControlPlaneJob } from "../jobControlPlaneGateway";
import {
  createFeature186VerticalDramaJob,
  omitUndefinedJobPayloadProperties,
} from "../feature186VerticalDramaJobAdapter";

describe("Feature 186 job payload boundary", () => {
  it("passes an undefined-free payload to canonical job creation", async () => {
    await createFeature186VerticalDramaJob({
      jobId: "job-1",
      tenantId: "tenant-1",
      userId: 42,
      jobType: "vertical_drama.shot_prompt",
      executionClass: "long",
      payload: {
        publicUrl: undefined,
        input: {
          imageUrl: undefined,
          shotNumber: 3,
        },
      },
    });

    expect(createControlPlaneJob).toHaveBeenCalledWith(
      expect.objectContaining({
        definition: expect.objectContaining({
          input: { input: { shotNumber: 3 } },
        }),
      })
    );
  });

  it("omits undefined optional object properties recursively", () => {
    const payload = {
      publicUrl: undefined,
      input: {
        imageUrl: undefined,
        keep: null,
        references: [
          { url: "https://cdn.example/reference.png", label: undefined },
        ],
      },
    };

    expect(omitUndefinedJobPayloadProperties(payload)).toEqual({
      input: {
        keep: null,
        references: [{ url: "https://cdn.example/reference.png" }],
      },
    });
  });

  it("materializes plain objects that are safe for Drizzle value inspection", () => {
    const normalized = omitUndefinedJobPayloadProperties({
      input: { shotNumber: 3 },
    }) as Record<string, unknown>;

    expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(normalized.input)).toBe(Object.prototype);
    expect(() => is(normalized, SQL)).not.toThrow();
  });

  it("preserves special keys without changing the normalized object's prototype", () => {
    const payload = JSON.parse(
      '{"__proto__":{"polluted":true},"safe":1}'
    ) as Record<string, unknown>;
    const normalized = omitUndefinedJobPayloadProperties(payload) as Record<
      string,
      unknown
    >;

    expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(normalized, "__proto__")).toBe(
      true
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("preserves undefined array elements for strict canonical validation", () => {
    const payload = { references: [undefined] };

    expect(omitUndefinedJobPayloadProperties(payload)).toEqual({
      references: [undefined],
    });
  });

  it("does not coerce unsupported values or circular references", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const functionValue = () => "unsupported";

    const normalized = omitUndefinedJobPayloadProperties({
      circular,
      functionValue,
    }) as Record<string, unknown>;

    expect(normalized.functionValue).toBe(functionValue);
    expect((normalized.circular as Record<string, unknown>).self).toBe(
      circular
    );
  });
});
