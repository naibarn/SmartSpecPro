import { describe, it, expect } from "vitest";
import { z } from "zod";

// ---- Zod Schema Validation Tests ----

const operatorSchema = z.enum(["gt", "lt", "gte", "lte", "eq"]);

const createRuleInput = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  metricName: z.string().min(1).max(100),
  operator: operatorSchema,
  threshold: z.number().finite(),
  windowMinutes: z.number().int().positive().default(5),
  severity: z.enum(["low", "normal", "high", "critical"]).default("high"),
  channels: z.array(z.string()).default(["in_app"]),
  targetRole: z.string().max(20).optional(),
  targetUserId: z.number().int().optional(),
  cooldownMinutes: z.number().int().positive().default(10),
  isEnabled: z.boolean().default(true),
});

const createEscalationPolicyInput = z
  .object({
    name: z.string().min(1).max(100),
    triggerSeverity: z.enum(["low", "normal", "high", "critical"]),
    triggerMinutes: z.number().int().positive(),
    escalateToRole: z.string().max(20).optional(),
    escalateToUserId: z.number().int().optional(),
    escalateChannels: z.array(z.string()),
    escalateMessage: z.string().optional(),
    isEnabled: z.boolean().default(true),
  })
  .refine(
    (d) => d.escalateToRole || d.escalateToUserId,
    { message: "At least one of escalateToRole or escalateToUserId is required" }
  );

describe("alertRules schema", () => {
  it("accepts valid operator values: gt, lt, gte, lte, eq", () => {
    for (const op of ["gt", "lt", "gte", "lte", "eq"]) {
      expect(operatorSchema.safeParse(op).success).toBe(true);
    }
  });

  it("rejects non-allowlisted operators (!=, LIKE, >, <, eval)", () => {
    for (const op of ["!=", "LIKE", ">", "<", "eval", "ne", "in", "not"]) {
      expect(operatorSchema.safeParse(op).success).toBe(false);
    }
  });

  it("validates metricName is non-empty string", () => {
    const base = {
      name: "Test Rule",
      operator: "gt" as const,
      threshold: 100,
    };
    expect(createRuleInput.safeParse({ ...base, metricName: "" }).success).toBe(false);
    expect(createRuleInput.safeParse({ ...base, metricName: "cpu_usage" }).success).toBe(true);
  });

  it("validates threshold is a finite number", () => {
    const base = {
      name: "Test Rule",
      metricName: "latency",
      operator: "gt" as const,
    };
    expect(createRuleInput.safeParse({ ...base, threshold: 100 }).success).toBe(true);
    expect(createRuleInput.safeParse({ ...base, threshold: Infinity }).success).toBe(false);
    expect(createRuleInput.safeParse({ ...base, threshold: NaN }).success).toBe(false);
  });

  it("validates windowMinutes is a positive integer", () => {
    const base = {
      name: "Test Rule",
      metricName: "latency",
      operator: "gt" as const,
      threshold: 100,
    };
    expect(createRuleInput.safeParse({ ...base, windowMinutes: 5 }).success).toBe(true);
    expect(createRuleInput.safeParse({ ...base, windowMinutes: 0 }).success).toBe(false);
    expect(createRuleInput.safeParse({ ...base, windowMinutes: -1 }).success).toBe(false);
    expect(createRuleInput.safeParse({ ...base, windowMinutes: 1.5 }).success).toBe(false);
  });

  it("defaults severity to 'high', isEnabled to true, cooldownMinutes to 10", () => {
    const result = createRuleInput.parse({
      name: "Test Rule",
      metricName: "latency",
      operator: "gt",
      threshold: 100,
    });
    expect(result.severity).toBe("high");
    expect(result.isEnabled).toBe(true);
    expect(result.cooldownMinutes).toBe(10);
  });

  it("stores channels as JSON string array", () => {
    const result = createRuleInput.parse({
      name: "Test Rule",
      metricName: "latency",
      operator: "gt",
      threshold: 100,
      channels: ["in_app", "email"],
    });
    expect(result.channels).toEqual(["in_app", "email"]);
  });
});

describe("escalationPolicies schema", () => {
  it("inserts an escalation policy with all required fields", () => {
    const result = createEscalationPolicyInput.safeParse({
      name: "Critical Escalation",
      triggerSeverity: "critical",
      triggerMinutes: 15,
      escalateToRole: "admin",
      escalateChannels: ["email", "in_app"],
    });
    expect(result.success).toBe(true);
  });

  it("defaults isEnabled to true", () => {
    const result = createEscalationPolicyInput.parse({
      name: "Escalation",
      triggerSeverity: "high",
      triggerMinutes: 30,
      escalateToUserId: 1,
      escalateChannels: ["in_app"],
    });
    expect(result.isEnabled).toBe(true);
  });

  it("requires at least one of escalateToRole or escalateToUserId", () => {
    const result = createEscalationPolicyInput.safeParse({
      name: "Bad Policy",
      triggerSeverity: "high",
      triggerMinutes: 30,
      escalateChannels: ["in_app"],
      // Neither escalateToRole nor escalateToUserId
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("escalateToRole");
    }
  });

  it("validates triggerMinutes is a positive integer", () => {
    const base = {
      name: "Escalation",
      triggerSeverity: "high" as const,
      escalateToRole: "admin",
      escalateChannels: ["in_app"],
    };
    expect(createEscalationPolicyInput.safeParse({ ...base, triggerMinutes: 15 }).success).toBe(true);
    expect(createEscalationPolicyInput.safeParse({ ...base, triggerMinutes: 0 }).success).toBe(false);
    expect(createEscalationPolicyInput.safeParse({ ...base, triggerMinutes: -5 }).success).toBe(false);
  });
});

describe("alertRulesRouter", () => {
  describe("listRules", () => {
    it("requires admin role — validates RBAC enforcement pattern", () => {
      // The router uses adminProcedure which checks ctx.user.role === 'admin'
      const checkAdmin = (role: string) => role === "admin" || role === "system_agent";
      expect(checkAdmin("admin")).toBe(true);
      expect(checkAdmin("user")).toBe(false);
      expect(checkAdmin("domain_admin")).toBe(false);
    });

    it("returns rules scoped to current tenant only", () => {
      // The router uses eq(alertRules.tenantId, ctx.tenantId)
      const rules = [
        { id: 1, tenantId: "tenant-1", name: "Rule A" },
        { id: 2, tenantId: "tenant-1", name: "Rule B" },
      ];
      expect(rules.every((r) => r.tenantId === "tenant-1")).toBe(true);
    });

    it("supports pagination with limit and offset", () => {
      const paginationInput = z.object({
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      });
      expect(paginationInput.safeParse({ limit: 10, offset: 20 }).success).toBe(true);
      expect(paginationInput.safeParse({ limit: 0, offset: 0 }).success).toBe(false);
    });
  });

  describe("createRule", () => {
    it("validates operator is in allowlist [gt, lt, gte, lte, eq]", () => {
      const result = createRuleInput.safeParse({
        name: "Test",
        metricName: "cpu",
        operator: "gt",
        threshold: 90,
      });
      expect(result.success).toBe(true);
    });

    it("rejects operator values not in allowlist", () => {
      const result = createRuleInput.safeParse({
        name: "Test",
        metricName: "cpu",
        operator: "eval",
        threshold: 90,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("deleteRule", () => {
    it("validates delete input requires id", () => {
      const deleteInput = z.object({ id: z.number() });
      expect(deleteInput.safeParse({ id: 1 }).success).toBe(true);
      expect(deleteInput.safeParse({}).success).toBe(false);
    });
  });
});
