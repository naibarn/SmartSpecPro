import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Tests for parallel_fan_out nodeConfig validation schemas.
 */

const branchSchema = z.object({
  id: z.string().min(1),
  targetNodeId: z.string().min(1),
  taskDescription: z.string().max(500).optional(),
  label: z.string().max(100).optional(),
});

const parallelFanOutSchema = z.object({
  branches: z.array(branchSchema).min(2, "At least 2 branches required"),
  mergeStrategy: z.enum(["wait_all", "first_complete", "majority", "custom_prompt"]),
  mergePrompt: z.string().max(1000).optional(),
  timeoutMs: z.number().int().min(1000).max(600000).default(120000),
  maxConcurrent: z.number().int().min(1).max(10).default(5),
  continueOnError: z.boolean().default(true),
}).superRefine((data, ctx) => {
  if (data.mergeStrategy === "custom_prompt" && !data.mergePrompt?.trim()) {
    ctx.addIssue({ code: "custom", path: ["mergePrompt"], message: "custom_prompt requires mergePrompt" });
  }
});

describe("parallel_fan_out validation", () => {
  it("validates branches array has >= 2 entries", () => {
    const oneBranch = parallelFanOutSchema.safeParse({
      branches: [{ id: "b1", targetNodeId: "n1" }],
      mergeStrategy: "wait_all",
    });
    expect(oneBranch.success).toBe(false);

    const twoBranches = parallelFanOutSchema.safeParse({
      branches: [
        { id: "b1", targetNodeId: "n1" },
        { id: "b2", targetNodeId: "n2" },
      ],
      mergeStrategy: "wait_all",
    });
    expect(twoBranches.success).toBe(true);
  });

  it("validates mergeStrategy is one of 4 allowed values", () => {
    const base = {
      branches: [
        { id: "b1", targetNodeId: "n1" },
        { id: "b2", targetNodeId: "n2" },
      ],
    };

    expect(parallelFanOutSchema.safeParse({ ...base, mergeStrategy: "invalid" }).success).toBe(false);

    for (const s of ["wait_all", "first_complete", "majority", "custom_prompt"]) {
      const result = parallelFanOutSchema.safeParse({
        ...base,
        mergeStrategy: s,
        ...(s === "custom_prompt" ? { mergePrompt: "Summarize" } : {}),
      });
      expect(result.success).toBe(true);
    }
  });

  it("validates maxConcurrent between 1 and 10", () => {
    const base = {
      branches: [
        { id: "b1", targetNodeId: "n1" },
        { id: "b2", targetNodeId: "n2" },
      ],
      mergeStrategy: "wait_all" as const,
    };

    expect(parallelFanOutSchema.safeParse({ ...base, maxConcurrent: 0 }).success).toBe(false);
    expect(parallelFanOutSchema.safeParse({ ...base, maxConcurrent: 11 }).success).toBe(false);
    expect(parallelFanOutSchema.safeParse({ ...base, maxConcurrent: 5 }).success).toBe(true);
  });

  it("validates mergePrompt required when custom_prompt", () => {
    const base = {
      branches: [
        { id: "b1", targetNodeId: "n1" },
        { id: "b2", targetNodeId: "n2" },
      ],
      mergeStrategy: "custom_prompt" as const,
    };

    expect(parallelFanOutSchema.safeParse(base).success).toBe(false);
    expect(parallelFanOutSchema.safeParse({ ...base, mergePrompt: "Summarize these results" }).success).toBe(true);
  });

  it("validates timeoutMs is positive integer with reasonable bounds", () => {
    const base = {
      branches: [
        { id: "b1", targetNodeId: "n1" },
        { id: "b2", targetNodeId: "n2" },
      ],
      mergeStrategy: "wait_all" as const,
    };

    expect(parallelFanOutSchema.safeParse({ ...base, timeoutMs: 0 }).success).toBe(false);
    expect(parallelFanOutSchema.safeParse({ ...base, timeoutMs: 600001 }).success).toBe(false);
    expect(parallelFanOutSchema.safeParse({ ...base, timeoutMs: 120000 }).success).toBe(true);
  });
});
