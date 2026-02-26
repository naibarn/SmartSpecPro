Good -- the sandbox tables do not exist yet. They will be created by section-02. Now I have all the context I need.

# Section 5: Node.js Sandbox Router and Services

## Overview

This section implements the Node.js/tRPC layer that exposes sandbox operations to the frontend and orchestrates sandbox dispatching from the web application. It creates a new tRPC router (`sandbox`) and a suite of supporting service modules under `apps/web/server/services/sandbox/`.

**What this section builds:**
- A tRPC sandbox router with 6 procedures (createJob, getJobStatus, cancelJob, getJobTranscript, listJobs, getProfiles)
- A dispatch service that decides whether workloads go through the sandbox or legacy path
- A policy resolver that checks tenant limits and resolves sandbox profiles
- A status projection module that maps internal states to user-friendly labels
- A cost estimator with credit integration (reserve, reconcile, refund)
- An artifact access service for generating signed URLs to sandbox outputs

**Dependencies:**
- **Section 02 (Database Schema)** must be completed first -- this section reads from `sandbox_jobs`, `sandbox_profiles`, `sandbox_artifacts`, and `tenant_sandbox_policies` tables via Drizzle ORM queries
- **Section 04 (Python Services)** should be in progress or completed -- the dispatch service sends HTTP requests to the Python backend's sandbox API endpoints. However, the Node.js services can be built and tested with mocked HTTP calls

**Blocks:**
- **Section 08 (Router Modifications)** depends on the dispatch service and status projection from this section

---

## Files to Create

| File Path | Purpose |
|-----------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/sandbox.ts` | tRPC router with 6 procedures |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/dispatchService.ts` | Workload routing (sandbox vs legacy) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/policyResolver.ts` | Tenant policy checks and profile resolution |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/statusProjection.ts` | Internal state to user-friendly label mapping |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/costEstimator.ts` | Cost estimation and credit integration |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/artifactAccess.ts` | Signed URL generation for artifacts |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/index.ts` | Barrel export for sandbox services |

## Files to Modify

| File Path | Change |
|-----------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts` | Import and register `sandboxRouter` in `appRouter` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/env.ts` | Add sandbox environment variables |

## Test Files to Create

| File Path | Purpose |
|-----------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/sandbox.test.ts` | tRPC router procedure tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/dispatchService.test.ts` | Dispatch routing tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/policyResolver.test.ts` | Policy resolution tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/statusProjection.test.ts` | Status mapping tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/costEstimator.test.ts` | Cost and credit integration tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/artifactAccess.test.ts` | Artifact URL generation tests |

---

## Tests (Write These First)

All tests use Vitest with the existing project patterns: `vi.hoisted()` for mock setup, `vi.mock()` for module mocking, and `beforeEach(() => vi.clearAllMocks())`.

### 5.1 Status Projection Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/statusProjection.test.ts`

This is the simplest module -- pure function, no dependencies. Start here.

```typescript
import { describe, it, expect } from "vitest";
import { projectStatus, type SandboxInternalStatus } from "../statusProjection";

describe("projectStatus", () => {
  it("maps accepted to Queued", () => {
    expect(projectStatus("accepted")).toEqual({
      label: "Queued",
      phase: "pending",
      isTerminal: false,
    });
  });

  it("maps policy_resolved to Queued", () => {
    expect(projectStatus("policy_resolved").label).toBe("Queued");
  });

  it("maps queued to Queued", () => {
    expect(projectStatus("queued").label).toBe("Queued");
  });

  it("maps provisioning to Preparing secure workspace", () => {
    expect(projectStatus("provisioning").label).toBe("Preparing secure workspace");
  });

  it("maps staging_inputs to Preparing secure workspace", () => {
    expect(projectStatus("staging_inputs").label).toBe("Preparing secure workspace");
  });

  it("maps executing to Running securely", () => {
    const result = projectStatus("executing");
    expect(result.label).toBe("Running securely");
    expect(result.phase).toBe("active");
  });

  it("maps collecting_outputs to Collecting results", () => {
    expect(projectStatus("collecting_outputs").label).toBe("Collecting results");
  });

  it("maps persisting to Collecting results", () => {
    expect(projectStatus("persisting").label).toBe("Collecting results");
  });

  it("maps completed to Completed with isTerminal true", () => {
    const result = projectStatus("completed");
    expect(result.label).toBe("Completed");
    expect(result.isTerminal).toBe(true);
  });

  it("maps failed to Failed with isTerminal true", () => {
    const result = projectStatus("failed");
    expect(result.label).toBe("Failed");
    expect(result.isTerminal).toBe(true);
  });

  it("maps timed_out to Timed out with isTerminal true", () => {
    const result = projectStatus("timed_out");
    expect(result.label).toBe("Timed out");
    expect(result.isTerminal).toBe(true);
  });

  it("maps canceled to Canceled with isTerminal true", () => {
    const result = projectStatus("canceled");
    expect(result.label).toBe("Canceled");
    expect(result.isTerminal).toBe(true);
  });

  it("handles unknown state gracefully", () => {
    const result = projectStatus("nonexistent_state" as SandboxInternalStatus);
    expect(result.label).toBe("Unknown");
    expect(result.isTerminal).toBe(false);
  });
});
```

### 5.2 Dispatch Service Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/dispatchService.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock("../../../_core/env", () => ({
  ENV: {
    pythonBackendUrl: "http://localhost:8000",
  },
}));

// Mock global fetch
vi.stubGlobal("fetch", mockFetch);

import {
  dispatchToSandbox,
  shouldUseSandbox,
  type SandboxDispatchRequest,
} from "../dispatchService";

beforeEach(() => {
  vi.clearAllMocks();
  // Reset env overrides
  delete process.env.OPENSANDBOX_ENABLED;
});

describe("shouldUseSandbox", () => {
  it("returns false when OPENSANDBOX_ENABLED is false", () => {
    process.env.OPENSANDBOX_ENABLED = "false";
    expect(shouldUseSandbox("sandbox-code")).toBe(false);
  });

  it("returns false for core-text execution mode", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("core-text")).toBe(false);
  });

  it("returns false for llm-only execution mode", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("llm-only")).toBe(false);
  });

  it("returns true for sandbox-code when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("sandbox-code")).toBe(true);
  });

  it("returns true for sandbox-command when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("sandbox-command")).toBe(true);
  });

  it("returns true for sandbox-media when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("sandbox-media")).toBe(true);
  });

  it("returns true for media-generate when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("media-generate")).toBe(true);
  });

  it("returns true for sandbox-browser when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("sandbox-browser")).toBe(true);
  });

  it("returns true for sandbox-file when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandbox("sandbox-file")).toBe(true);
  });
});

describe("dispatchToSandbox", () => {
  it("sends correct request to Python backend", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ job_id: "job-123" }),
    });

    const request: SandboxDispatchRequest = {
      featureType: "media",
      executionMode: "sandbox-media",
      tenantId: "tenant-1",
      userId: 42,
      inputFiles: [],
    };

    const result = await dispatchToSandbox(request);
    expect(result.jobId).toBe("job-123");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/internal/sandbox/dispatch",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("throws on Python backend error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const request: SandboxDispatchRequest = {
      featureType: "media",
      executionMode: "sandbox-media",
      tenantId: "tenant-1",
      userId: 42,
      inputFiles: [],
    };

    await expect(dispatchToSandbox(request)).rejects.toThrow();
  });
});
```

### 5.3 Policy Resolver Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/policyResolver.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));

vi.mock("../../../db", () => ({
  db: { select: mockSelect },
}));

vi.mock("../../../../drizzle/schema", () => ({
  sandboxProfiles: { id: "id", slug: "slug", isActive: "isActive" },
  tenantSandboxPolicies: {
    tenantId: "tenantId",
    maxConcurrentSandboxes: "maxConcurrentSandboxes",
    maxDailyRuntimeSeconds: "maxDailyRuntimeSeconds",
  },
  sandboxJobs: { tenantId: "tenantId", status: "status" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
  count: vi.fn(),
  sql: vi.fn(),
}));

import {
  resolveProfile,
  checkTenantPolicy,
} from "../policyResolver";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveProfile", () => {
  it("resolves profile for given feature type", async () => {
    // Mock: query returns a profile row
    const limitMock = vi.fn().mockResolvedValue([
      { id: 1, slug: "media-processing", name: "Media Processing" },
    ]);
    const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    mockSelect.mockReturnValue({ from: fromMock });

    const profile = await resolveProfile("media");
    expect(profile).toBeDefined();
    expect(profile?.slug).toBe("media-processing");
  });
});

describe("checkTenantPolicy", () => {
  it("returns allowed when tenant is under limits", async () => {
    // First call: get policy, Second call: count active jobs
    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      const createChain = (result: any[]) => {
        const limitMock = vi.fn().mockResolvedValue(result);
        const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
        const fromMock = vi.fn().mockReturnValue({ where: whereMock });
        return { from: fromMock };
      };
      if (callCount === 1) {
        return createChain([{ maxConcurrentSandboxes: 5, maxDailyRuntimeSeconds: 36000 }]);
      }
      return createChain([{ count: 2 }]);
    });

    const result = await checkTenantPolicy("tenant-1");
    expect(result.allowed).toBe(true);
  });

  it("returns denied when tenant exceeds concurrent limit", async () => {
    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      const createChain = (result: any[]) => {
        const limitMock = vi.fn().mockResolvedValue(result);
        const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
        const fromMock = vi.fn().mockReturnValue({ where: whereMock });
        return { from: fromMock };
      };
      if (callCount === 1) {
        return createChain([{ maxConcurrentSandboxes: 3, maxDailyRuntimeSeconds: 36000 }]);
      }
      return createChain([{ count: 3 }]);
    });

    const result = await checkTenantPolicy("tenant-1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("concurrent");
  });
});
```

### 5.4 Cost Estimator Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/costEstimator.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockHasEnoughCredits, mockDeductCredits, mockRefundCredits } = vi.hoisted(
  () => ({
    mockHasEnoughCredits: vi.fn(),
    mockDeductCredits: vi.fn(),
    mockRefundCredits: vi.fn(),
  }),
);

vi.mock("../../creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: mockDeductCredits,
  refundCredits: mockRefundCredits,
}));

import {
  estimateCost,
  reserveCredits,
  reconcileCredits,
  refundReservedCredits,
} from "../costEstimator";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("estimateCost", () => {
  it("estimates cost from profile defaults", () => {
    const cost = estimateCost({
      cpuLimit: "1000m",
      memoryLimitMb: 2048,
      timeoutSeconds: 300,
    });
    expect(typeof cost).toBe("number");
    expect(cost).toBeGreaterThan(0);
  });

  it("returns higher cost for more resources", () => {
    const low = estimateCost({
      cpuLimit: "1000m",
      memoryLimitMb: 2048,
      timeoutSeconds: 300,
    });
    const high = estimateCost({
      cpuLimit: "2000m",
      memoryLimitMb: 4096,
      timeoutSeconds: 1800,
    });
    expect(high).toBeGreaterThan(low);
  });
});

describe("reserveCredits", () => {
  it("pre-checks hasEnoughCredits before deduction", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue({ id: 1 });

    await reserveCredits({
      userId: 42,
      estimatedCost: 10,
      jobId: "job-123",
      tenantId: "tenant-1",
    });

    expect(mockHasEnoughCredits).toHaveBeenCalledWith(42, 10);
    expect(mockDeductCredits).toHaveBeenCalled();
  });

  it("throws when user has insufficient credits", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(
      reserveCredits({
        userId: 42,
        estimatedCost: 10,
        jobId: "job-123",
        tenantId: "tenant-1",
      }),
    ).rejects.toThrow("Insufficient credits");
  });
});

describe("reconcileCredits", () => {
  it("refunds overage when actual cost is lower", async () => {
    mockRefundCredits.mockResolvedValue({ id: 2 });

    await reconcileCredits({
      userId: 42,
      jobId: "job-123",
      estimatedCost: 15,
      actualCost: 10,
    });

    expect(mockRefundCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, amount: 5 }),
    );
  });

  it("deducts additional when actual cost is higher", async () => {
    mockDeductCredits.mockResolvedValue({ id: 3 });

    await reconcileCredits({
      userId: 42,
      jobId: "job-123",
      estimatedCost: 10,
      actualCost: 15,
    });

    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, amount: 5 }),
    );
  });

  it("does nothing when estimated equals actual", async () => {
    await reconcileCredits({
      userId: 42,
      jobId: "job-123",
      estimatedCost: 10,
      actualCost: 10,
    });

    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockRefundCredits).not.toHaveBeenCalled();
  });
});

describe("refundReservedCredits", () => {
  it("refunds full amount on failure", async () => {
    mockRefundCredits.mockResolvedValue({ id: 4 });

    await refundReservedCredits({
      userId: 42,
      jobId: "job-123",
      reservedAmount: 10,
    });

    expect(mockRefundCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, amount: 10 }),
    );
  });
});
```

### 5.5 Artifact Access Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/artifactAccess.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockStoragePresignGet, mockSelect } = vi.hoisted(() => ({
  mockStoragePresignGet: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("../../../storage", () => ({
  storagePresignGet: mockStoragePresignGet,
}));

vi.mock("../../../db", () => ({
  db: { select: mockSelect },
}));

vi.mock("../../../../drizzle/schema", () => ({
  sandboxArtifacts: {
    id: "id",
    sandboxJobId: "sandboxJobId",
    objectKey: "objectKey",
  },
  sandboxJobs: {
    id: "id",
    tenantId: "tenantId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

import { getArtifactUrl } from "../artifactAccess";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getArtifactUrl", () => {
  it("generates signed URL for artifact", async () => {
    // Mock: join query returns artifact with matching tenant
    const limitMock = vi.fn().mockResolvedValue([
      {
        objectKey: "sandbox-artifacts/job-123/output.mp4",
        tenantId: "tenant-1",
      },
    ]);
    const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
    const innerJoinMock = vi.fn().mockReturnValue({ where: whereMock });
    const fromMock = vi.fn().mockReturnValue({ innerJoin: innerJoinMock });
    mockSelect.mockReturnValue({ from: fromMock });

    mockStoragePresignGet.mockResolvedValue({
      url: "https://r2.example.com/signed-url",
      key: "sandbox-artifacts/job-123/output.mp4",
    });

    const result = await getArtifactUrl({
      artifactId: 1,
      tenantId: "tenant-1",
      ttlSeconds: 900,
    });

    expect(result).toBeDefined();
    expect(result?.url).toBe("https://r2.example.com/signed-url");
  });

  it("returns null when artifact belongs to different tenant", async () => {
    const limitMock = vi.fn().mockResolvedValue([]);
    const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
    const innerJoinMock = vi.fn().mockReturnValue({ where: whereMock });
    const fromMock = vi.fn().mockReturnValue({ innerJoin: innerJoinMock });
    mockSelect.mockReturnValue({ from: fromMock });

    const result = await getArtifactUrl({
      artifactId: 1,
      tenantId: "tenant-wrong",
      ttlSeconds: 900,
    });

    expect(result).toBeNull();
  });

  it("uses configurable TTL", async () => {
    const limitMock = vi.fn().mockResolvedValue([
      { objectKey: "key", tenantId: "tenant-1" },
    ]);
    const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
    const innerJoinMock = vi.fn().mockReturnValue({ where: whereMock });
    const fromMock = vi.fn().mockReturnValue({ innerJoin: innerJoinMock });
    mockSelect.mockReturnValue({ from: fromMock });

    mockStoragePresignGet.mockResolvedValue({ url: "https://example.com/url", key: "key" });

    await getArtifactUrl({ artifactId: 1, tenantId: "tenant-1", ttlSeconds: 3600 });

    expect(mockStoragePresignGet).toHaveBeenCalledWith("key", 3600);
  });
});
```

### 5.6 tRPC Sandbox Router Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/sandbox.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock tRPC to extract handler functions
vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
    };
    return proc;
  };

  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
  };
});

const { mockDispatchToSandbox, mockShouldUseSandbox } = vi.hoisted(() => ({
  mockDispatchToSandbox: vi.fn(),
  mockShouldUseSandbox: vi.fn(),
}));

vi.mock("../../services/sandbox/dispatchService", () => ({
  dispatchToSandbox: mockDispatchToSandbox,
  shouldUseSandbox: mockShouldUseSandbox,
}));

const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: { select: mockSelect },
}));

vi.mock("../../../drizzle/schema", () => ({
  sandboxJobs: {
    id: "id",
    tenantId: "tenantId",
    userId: "userId",
    status: "status",
    featureType: "featureType",
  },
  sandboxProfiles: {
    id: "id",
    slug: "slug",
    isActive: "isActive",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  inArray: vi.fn(),
}));

import { sandboxRouter } from "../sandbox";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sandboxRouter", () => {
  it("exports all required procedures", () => {
    expect(sandboxRouter).toBeDefined();
    expect(sandboxRouter.createJob).toBeDefined();
    expect(sandboxRouter.getJobStatus).toBeDefined();
    expect(sandboxRouter.cancelJob).toBeDefined();
    expect(sandboxRouter.getJobTranscript).toBeDefined();
    expect(sandboxRouter.listJobs).toBeDefined();
    expect(sandboxRouter.getProfiles).toBeDefined();
  });
});
```

---

## Implementation Details

### 5.1 Environment Variables

Modify `/home/dev/projects/SmartSpecPro/apps/web/server/_core/env.ts` to add sandbox configuration:

```typescript
export const ENV = {
  // ... existing fields ...

  // OpenSandbox integration
  opensandboxEnabled:
    process.env.OPENSANDBOX_ENABLED === "true",
  opensandboxDispatchMode:
    process.env.OPENSANDBOX_DISPATCH_MODE ?? "optional",
  sandboxDefaultProfile:
    process.env.SANDBOX_DEFAULT_PROFILE ?? "code-default",
  sandboxRequireForSkills:
    process.env.SANDBOX_REQUIRE_FOR_SKILLS === "true",
  sandboxRequireForMedia:
    process.env.SANDBOX_REQUIRE_FOR_MEDIA === "true",
};
```

### 5.2 Status Projection

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/statusProjection.ts`

This is a pure, stateless mapping module with no external dependencies. It translates internal sandbox job statuses (stored in the database) into user-friendly labels for the UI.

```typescript
/**
 * Maps internal sandbox job status values to user-friendly display labels.
 * Stateless, pure function -- no I/O, no side effects.
 */

export type SandboxInternalStatus =
  | "accepted"
  | "policy_resolved"
  | "queued"
  | "provisioning"
  | "staging_inputs"
  | "executing"
  | "collecting_outputs"
  | "persisting"
  | "completed"
  | "failed"
  | "timed_out"
  | "canceled";

export interface StatusProjection {
  /** User-facing label */
  label: string;
  /** Phase grouping: pending | active | finishing | terminal */
  phase: "pending" | "active" | "finishing" | "terminal";
  /** Whether this is a final state (no further transitions) */
  isTerminal: boolean;
}

export function projectStatus(status: SandboxInternalStatus): StatusProjection {
  // Implementation: a simple switch/map returning { label, phase, isTerminal }
  // for each status value per the mapping table:
  //
  // accepted/policy_resolved/queued -> "Queued", pending, false
  // provisioning/staging_inputs     -> "Preparing secure workspace", active, false
  // executing                       -> "Running securely", active, false
  // collecting_outputs/persisting   -> "Collecting results", finishing, false
  // completed                       -> "Completed", terminal, true
  // failed                          -> "Failed", terminal, true
  // timed_out                       -> "Timed out", terminal, true
  // canceled                        -> "Canceled", terminal, true
  // unknown                         -> "Unknown", pending, false (fallback)
}
```

### 5.3 Dispatch Service

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/dispatchService.ts`

This module is the central decision point for whether a workload should be routed to the sandbox system or continue on the legacy path. It is called by existing routers (chat, skills, media, library) when they encounter a workload that potentially requires sandboxing.

**Exported types and functions:**

```typescript
export type ExecutionMode =
  | "core-text"
  | "llm-only"         // backward compat alias for core-text
  | "sandbox-code"
  | "sandbox-command"
  | "sandbox-browser"
  | "sandbox-file"
  | "sandbox-media"
  | "media-generate";  // backward compat alias for sandbox-media

export interface SandboxDispatchRequest {
  featureType: "chat" | "skill" | "workflow" | "library" | "media" | "presentation" | "connector";
  executionMode: ExecutionMode;
  tenantId: string;
  userId: number;
  inputFiles: Array<{ key: string; mimeType: string; sizeBytes: number }>;
  profileOverride?: string;   // slug of specific profile to use
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface SandboxDispatchResult {
  jobId: string;
}

/**
 * Determine whether a workload should use the sandbox execution path.
 * Returns false for core-text/llm-only modes or when sandbox is disabled.
 */
export function shouldUseSandbox(executionMode: string): boolean;

/**
 * Dispatch a workload to the sandbox system via the Python backend.
 * Sends an HTTP POST to the Python backend's sandbox dispatch endpoint.
 * The Python backend handles profile resolution, policy checks, and Celery dispatch.
 */
export async function dispatchToSandbox(request: SandboxDispatchRequest): Promise<SandboxDispatchResult>;
```

**Key implementation details:**

- `shouldUseSandbox()` reads `process.env.OPENSANDBOX_ENABLED` (not the ENV object, to allow runtime changes). The legacy modes `core-text` and `llm-only` always return false. The sandbox modes `sandbox-code`, `sandbox-command`, `sandbox-browser`, `sandbox-file`, `sandbox-media`, and `media-generate` return true when the feature flag is enabled.

- `dispatchToSandbox()` sends an HTTP POST to `${PYTHON_BACKEND_URL}/api/internal/sandbox/dispatch` with the request body serialized as JSON. It uses the existing pattern from other Node.js-to-Python calls (see `apps/web/server/routes/webhooks.ts` and `apps/web/server/_core/mcpRoutes.ts` for reference). The Python backend URL is resolved from `ENV.pythonBackendUrl` or `process.env.PYTHON_BACKEND_URL || "http://localhost:8000"`.

- On non-200 response, the function throws a descriptive error.

### 5.4 Policy Resolver

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/policyResolver.ts`

Resolves sandbox profiles and checks tenant policy limits. This module queries the database tables created in Section 02.

**Exported types and functions:**

```typescript
export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;           // populated when allowed is false
  profileSlug?: string;      // resolved profile slug
  profileConfig?: {          // resolved profile configuration
    cpuLimit: string;
    memoryLimitMb: number;
    timeoutSeconds: number;
    networkDefaultAction: string;
  };
}

/**
 * Resolve the sandbox profile for a given feature type.
 * Uses the feature-type-to-profile mapping:
 *   media/presentation -> "media-processing"
 *   chat/skill (code)  -> "code-default"
 *   library            -> "file-parser"
 *   workflow (browser)  -> "browser-default"
 * Falls back to the tenant's default profile or "code-default".
 */
export async function resolveProfile(featureType: string, tenantId?: string): Promise<SandboxProfile | null>;

/**
 * Check whether a tenant is allowed to create a new sandbox job.
 * Queries tenant_sandbox_policies for limits and sandbox_jobs for active counts.
 * Returns { allowed: true } or { allowed: false, reason: "..." }.
 */
export async function checkTenantPolicy(tenantId: string): Promise<PolicyCheckResult>;
```

**Feature type to profile mapping** (internal constant):

```typescript
const FEATURE_PROFILE_MAP: Record<string, string> = {
  media: "media-processing",
  presentation: "media-processing",
  skill: "code-default",
  chat: "code-default",
  workflow: "code-default",
  library: "file-parser",
  connector: "code-default",
};
```

**Implementation notes:**

- `resolveProfile` queries the `sandbox_profiles` table by slug (derived from the feature type mapping). It checks `isActive = true`. Returns null if no matching active profile found.

- `checkTenantPolicy` queries `tenant_sandbox_policies` for the tenant's limits (`maxConcurrentSandboxes`, `maxDailyRuntimeSeconds`). Then counts active (non-terminal) sandbox jobs for that tenant. If the count meets or exceeds the limit, returns `{ allowed: false, reason: "Max concurrent sandbox limit reached (X/Y)" }`. If no policy exists for the tenant, use the global default from environment variables (3 concurrent, 36000 daily seconds).

- Active (non-terminal) statuses are: `accepted`, `policy_resolved`, `queued`, `provisioning`, `staging_inputs`, `executing`, `collecting_outputs`, `persisting`.

### 5.5 Cost Estimator

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/costEstimator.ts`

Integrates sandbox costs with the existing credit system in `apps/web/server/services/creditService.ts`.

**Exported functions:**

```typescript
interface ProfileResourceEstimate {
  cpuLimit: string;          // e.g., "1000m"
  memoryLimitMb: number;     // e.g., 2048
  timeoutSeconds: number;    // max expected runtime
}

/**
 * Estimate the credit cost of a sandbox job before execution.
 * Formula: credits = ceil((cpuCores * timeoutMinutes * CPU_RATE) + (memoryGb * timeoutMinutes * MEM_RATE))
 * CPU_RATE and MEM_RATE are internal constants (e.g., 1 credit per CPU-minute, 0.5 per GB-minute).
 * This is an estimate -- actual cost is calculated by the Python backend after execution.
 */
export function estimateCost(profile: ProfileResourceEstimate): number;

/**
 * Reserve credits before sandbox dispatch.
 * 1. Check hasEnoughCredits() for estimated cost
 * 2. Deduct estimated credits with sourceType "sandbox"
 * 3. Return the transaction ID for later reconciliation
 * Throws "Insufficient credits" if balance is too low.
 */
export async function reserveCredits(params: {
  userId: number;
  estimatedCost: number;
  jobId: string;
  tenantId: string;
}): Promise<{ transactionId: number }>;

/**
 * Reconcile credits after job completion.
 * If actual < estimated: refund the overage.
 * If actual > estimated: deduct the additional amount.
 * If actual === estimated: no-op.
 */
export async function reconcileCredits(params: {
  userId: number;
  jobId: string;
  estimatedCost: number;
  actualCost: number;
}): Promise<void>;

/**
 * Refund all reserved credits on job failure.
 * Calls refundCredits() from creditService with sandbox-specific metadata.
 */
export async function refundReservedCredits(params: {
  userId: number;
  jobId: string;
  reservedAmount: number;
}): Promise<void>;
```

**Implementation notes:**

- Uses `hasEnoughCredits`, `deductCredits`, and `refundCredits` from `apps/web/server/services/creditService.ts`. These are the existing credit functions used throughout the project.

- The `estimateCost` function parses CPU millicore strings (e.g., `"1000m"` becomes 1.0 cores, `"2000m"` becomes 2.0 cores). It converts timeout from seconds to minutes for the calculation.

- When calling `deductCredits`, use `sourceType: "other"` (or add `"sandbox"` to the `CreditSourceType` union if the schema supports it -- check the credit system first). Include `metadata: { sandboxJobId: jobId, type: "sandbox_reservation" }`.

- When calling `refundCredits`, include `metadata: { sandboxJobId: jobId, reason: "sandbox_job_failed" }`.

### 5.6 Artifact Access

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/artifactAccess.ts`

Generates signed URLs for sandbox artifacts with tenant isolation enforcement.

```typescript
/**
 * Generate a presigned GET URL for a sandbox artifact.
 * Enforces tenant isolation by joining sandbox_artifacts with sandbox_jobs
 * and verifying the tenantId matches.
 *
 * @returns Signed URL and metadata, or null if artifact not found or tenant mismatch
 */
export async function getArtifactUrl(params: {
  artifactId: number;
  tenantId: string;
  ttlSeconds?: number;       // default 900 (15 minutes)
}): Promise<{ url: string; key: string } | null>;

/**
 * Generate signed URLs for all artifacts of a sandbox job.
 * Enforces tenant isolation.
 */
export async function getJobArtifactUrls(params: {
  jobId: string;
  tenantId: string;
  ttlSeconds?: number;
}): Promise<Array<{ artifactId: number; url: string; key: string; mimeType: string; isPrimary: boolean }>>;
```

**Implementation notes:**

- Uses `storagePresignGet` from `apps/web/server/storage.ts` (the existing signed URL function).

- The query joins `sandbox_artifacts` to `sandbox_jobs` on `sandboxJobId` and includes a WHERE clause for `sandbox_jobs.tenantId = params.tenantId`. This prevents cross-tenant access.

- Default TTL is 900 seconds (15 minutes). The caller can pass a custom TTL (up to 86400 seconds / 24 hours, which is the maximum enforced by the storage layer).

### 5.7 tRPC Sandbox Router

File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/sandbox.ts`

All 6 procedures require authentication. Admin-only procedures use `adminProcedure`. Standard user procedures use `protectedProcedure` with tenant isolation.

```typescript
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

export const sandboxRouter = router({
  /**
   * Create a new sandbox job.
   * Validates input, checks RBAC, calls Python backend via dispatchService.
   */
  createJob: protectedProcedure
    .input(z.object({
      featureType: z.enum(["chat", "skill", "workflow", "library", "media", "presentation", "connector"]),
      executionMode: z.enum(["sandbox-code", "sandbox-command", "sandbox-browser", "sandbox-file", "sandbox-media"]),
      inputFiles: z.array(z.object({
        key: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number(),
      })).default([]),
      profileOverride: z.string().optional(),
      idempotencyKey: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // 1. Verify sandbox is enabled via shouldUseSandbox()
      // 2. Check tenant policy via policyResolver.checkTenantPolicy()
      // 3. Estimate cost and reserve credits via costEstimator
      // 4. Dispatch to Python backend via dispatchToSandbox()
      // 5. Return { jobId }
    }),

  /**
   * Get current status of a sandbox job.
   * Returns projected status, progress, and output URLs when completed.
   */
  getJobStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input, ctx }) => {
      // 1. Query sandbox_jobs by id
      // 2. Verify ownership (tenantId matches) or ctx.user.role === 'admin'
      // 3. Project status via statusProjection
      // 4. If completed, include artifact URLs
      // 5. Return { status, label, phase, isTerminal, artifacts? }
    }),

  /**
   * Cancel a running or queued sandbox job.
   */
  cancelJob: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // 1. Verify job ownership
      // 2. Check job is in cancellable state (non-terminal)
      // 3. Send cancel request to Python backend
      // 4. Refund reserved credits
    }),

  /**
   * Fetch execution transcript (stdout/stderr excerpts).
   * Admin or job owner only.
   */
  getJobTranscript: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input, ctx }) => {
      // 1. Verify ownership or admin
      // 2. Return { stdout, stderr } from sandbox_jobs
    }),

  /**
   * List sandbox jobs with filters. Admin: all tenants. User: own tenant only.
   */
  listJobs: protectedProcedure
    .input(z.object({
      status: z.enum([
        "accepted", "policy_resolved", "queued", "provisioning",
        "staging_inputs", "executing", "collecting_outputs", "persisting",
        "completed", "failed", "timed_out", "canceled",
      ]).optional(),
      featureType: z.enum(["chat", "skill", "workflow", "library", "media", "presentation", "connector"]).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      // 1. Build query with filters
      // 2. Non-admin: filter by tenantId
      // 3. Admin: no tenant filter (or optional tenant filter)
      // 4. Order by createdAt desc
      // 5. Return paginated results with projected status
    }),

  /**
   * List available sandbox profiles.
   */
  getProfiles: protectedProcedure
    .query(async () => {
      // 1. Query sandbox_profiles where isActive = true
      // 2. Return array of { slug, name, description, executionMode, cpuLimit, memoryLimitMb, timeoutSeconds }
    }),
});
```

### 5.8 Register Router in appRouter

Modify `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts`:

1. Add import near the existing router imports (around line 27-50):
   ```typescript
   import { sandboxRouter } from "./routers/sandbox";
   ```

2. Add to the `appRouter` definition (around line 1425-1428, after the `workflow` entries):
   ```typescript
   sandbox: sandboxRouter,
   ```

### 5.9 Barrel Export

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/index.ts`

```typescript
export { shouldUseSandbox, dispatchToSandbox } from "./dispatchService";
export type { SandboxDispatchRequest, SandboxDispatchResult, ExecutionMode } from "./dispatchService";
export { resolveProfile, checkTenantPolicy } from "./policyResolver";
export { projectStatus } from "./statusProjection";
export type { SandboxInternalStatus, StatusProjection } from "./statusProjection";
export { estimateCost, reserveCredits, reconcileCredits, refundReservedCredits } from "./costEstimator";
export { getArtifactUrl, getJobArtifactUrls } from "./artifactAccess";
```

---

## Job Completion Notification Pattern

The initial implementation uses client-side polling via tRPC's `getJobStatus` query. The frontend should use TanStack Query with a dynamic `refetchInterval`:

- Active jobs (`executing`): Poll every 2 seconds
- Queued jobs (`accepted`, `policy_resolved`, `queued`): Poll every 10 seconds
- Terminal jobs (`completed`, `failed`, `timed_out`, `canceled`): Stop polling

This is implemented on the frontend side (Section 10 / Admin UI) using the `isTerminal` field from the status projection. The router procedure itself is stateless and simply queries the database on each request.

SSE (Server-Sent Events) for real-time push is a future enhancement and is NOT in scope for this section.

---

## Implementation Notes (Actual)

All files implemented as planned. Key deviations from original spec based on code review:

### Code Review Fixes Applied
1. **Credit reservation rollback**: Added try/catch around `dispatchToSandbox` in `createJob` mutation -- refunds credits on dispatch failure
2. **Internal auth headers**: Added `X-Internal-Token` header (from `SMARTSPEC_WEB_GATEWAY_TOKEN`) to all Node.js-to-Python HTTP calls via `internalFetch` wrapper
3. **30s timeout**: All internal Python backend calls now use `AbortController` with 30s timeout
4. **COUNT query**: `checkTenantPolicy` uses `SELECT COUNT(*)` instead of fetching all rows
5. **Daily runtime check**: Added `maxDailyRuntimeSeconds` enforcement using SUM of job runtimes today
6. **Admin artifact fix**: `getJobStatus` uses `job.tenantId` (not `ctx.tenantId`) for artifact URLs when admin queries cross-tenant
7. **Cancel response check**: `cancelJob` verifies Python backend response before refunding credits

### Test Results
- 6 test files, 41 tests passing
- Status projection: 13 tests
- Dispatch service: 11 tests
- Policy resolver: 5 tests (incl. daily runtime)
- Cost estimator: 8 tests
- Artifact access: 3 tests
- Router structure: 1 test

### Files Created
- `apps/web/server/services/sandbox/statusProjection.ts`
- `apps/web/server/services/sandbox/dispatchService.ts` (includes `internalFetch` utility)
- `apps/web/server/services/sandbox/policyResolver.ts`
- `apps/web/server/services/sandbox/costEstimator.ts`
- `apps/web/server/services/sandbox/artifactAccess.ts`
- `apps/web/server/services/sandbox/index.ts`
- `apps/web/server/routers/sandbox.ts`
- 6 test files under `__tests__/`

### Files Modified
- `apps/web/server/_core/env.ts` -- added 5 OpenSandbox env vars
- `apps/web/server/routers.ts` -- imported and registered `sandboxRouter`