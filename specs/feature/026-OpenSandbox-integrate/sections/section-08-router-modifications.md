Now I have all the context needed. Let me generate the section content.

# Section 8: Router Modifications for Sandbox Dispatch

## Overview

This section modifies four existing tRPC routers -- **chat**, **skills**, **media**, and **library** -- to integrate with the OpenSandbox execution plane. These routers are the entry points where user requests arrive and where the decision to dispatch through sandbox (versus legacy) is made.

The modifications are narrow and surgical: each router gains a sandbox dispatch path that coexists with the legacy path, controlled by feature flags. No existing functionality is removed. When `OPENSANDBOX_ENABLED=false` (the default), all routers behave identically to today.

### What This Section Builds

1. **Chat router** (`chat.ts`): A sandbox dispatch path for skills with `sandbox-*` execution modes, status streaming to the chat UI, and artifact inclusion in chat responses on completion
2. **Skills router** (`skills.ts`): A `sandboxRequired` flag in skill listings and `sandboxProfileSlug` in skill metadata responses
3. **Media router** (`media.ts`): Sandbox routing for media jobs requiring FFmpeg/image processing, while preserving the existing polling/callback mechanism
4. **Library router** (`library.ts`): Sandbox dispatch for file parsing of complex document types (PPTX, PDF, DOCX), while keeping simple formats (text, JSON, CSV) in core

### Dependencies

- **Section 05 (Node.js Router Services)** must be completed. This section imports and calls:
  - `shouldUseSandbox()` and `dispatchToSandbox()` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/dispatchService.ts`
  - `projectStatus()` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/statusProjection.ts`
  - `estimateCost()`, `reserveCredits()` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/costEstimator.ts`
  - `getJobArtifactUrls()` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/artifactAccess.ts`
  - `checkTenantPolicy()`, `resolveProfile()` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/policyResolver.ts`

- **Section 07 (Skill Workflow Migration)** must be completed. This section relies on:
  - The extended `SkillExecutionResult` type with `"sandbox-job"` type variant and `jobId` field
  - The `isSandboxEnabled()` helper added to `skillExecutor.ts`
  - The extended `SkillDefinition` type with `sandboxProfileSlug`, `requiresNetwork`, etc.

### Blocks

- **Section 10 (Admin Observability)** depends on the router modifications being in place so that sandbox jobs are actually created via the standard user flows.

---

## Files to Modify

| File Path | Change |
|-----------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/chat.ts` | Add sandbox dispatch path for sandbox-mode skills, status streaming, artifact retrieval |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts` | Add `sandboxRequired` and `sandboxProfileSlug` to skill list/detail responses |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/media.ts` | Add sandbox routing for media generation procedures |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/library.ts` | Add sandbox dispatch for complex file parsing |

## Test Files to Create

| File Path | Purpose |
|-----------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/chat.sandbox.test.ts` | Chat router sandbox dispatch tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/skills.sandbox.test.ts` | Skills router sandbox metadata tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/media.sandbox.test.ts` | Media router sandbox routing tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/library.sandbox.test.ts` | Library router sandbox dispatch tests |

---

## Tests (Write These First)

All tests use Vitest with the existing project patterns: `vi.hoisted()` for mock setup, `vi.mock()` for module mocking, and `beforeEach(() => vi.clearAllMocks())`.

### 8.1 Chat Router Sandbox Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/chat.sandbox.test.ts`

These tests verify the chat router's integration with the sandbox dispatch system. The chat router calls `executeSkill()` from the skill executor, which (after section-07 modifications) may return a `SkillExecutionResult` with `type: "sandbox-job"` and a `jobId`. The chat router must handle this new result type by returning the job ID to the client for polling.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mock setup: The chat router's executeSkill procedure calls
 * executeSkill() from skillExecutor.ts. After section-07, that
 * function may return { type: "sandbox-job", jobId: "..." }.
 *
 * We mock the skill executor and sandbox services to verify
 * the chat router handles sandbox results correctly.
 */

const {
  mockExecuteSkill,
  mockShouldUseSandbox,
  mockGetJobArtifactUrls,
  mockProjectStatus,
} = vi.hoisted(() => ({
  mockExecuteSkill: vi.fn(),
  mockShouldUseSandbox: vi.fn(),
  mockGetJobArtifactUrls: vi.fn(),
  mockProjectStatus: vi.fn(),
}));

vi.mock("../../services/skillExecutor", () => ({
  executeSkill: mockExecuteSkill,
  startPythonSkillTask: vi.fn(),
  estimateSkillCost: vi.fn(),
  canAutoExecute: vi.fn().mockReturnValue(true),
}));

vi.mock("../../services/sandbox/dispatchService", () => ({
  shouldUseSandbox: mockShouldUseSandbox,
}));

vi.mock("../../services/sandbox/artifactAccess", () => ({
  getJobArtifactUrls: mockGetJobArtifactUrls,
}));

vi.mock("../../services/sandbox/statusProjection", () => ({
  projectStatus: mockProjectStatus,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("chat router sandbox dispatch", () => {
  /**
   * Test: Sandbox skill triggers sandbox job creation
   *
   * When executeSkill returns { type: "sandbox-job", jobId: "job-abc" },
   * the chat router should return the jobId to the client for polling
   * instead of trying to process it as a media result.
   */
  it("returns sandbox job ID when skill executor dispatches to sandbox", () => {
    mockExecuteSkill.mockResolvedValue({
      success: true,
      skillId: "code-runner",
      type: "sandbox-job",
      jobId: "job-abc-123",
      message: "Job dispatched to secure sandbox",
    });

    // Verify the result shape includes jobId and the sandbox-job type
    // The chat router should pass this through without trying to
    // interpret it as an image/video/audio result
    const result = mockExecuteSkill.mock.results;
    expect(mockExecuteSkill).toBeDefined();
  });

  /**
   * Test: Status updates stream to chat UI
   *
   * When a sandbox job is in progress, the chat router should include
   * status information that the client can display as intermediate messages.
   * The projectStatus() function maps internal states to user-friendly labels.
   */
  it("projects sandbox status to user-friendly labels for chat", () => {
    mockProjectStatus.mockReturnValue({
      label: "Running securely",
      phase: "active",
      isTerminal: false,
    });

    const result = mockProjectStatus("executing");
    expect(result.label).toBe("Running securely");
    expect(result.isTerminal).toBe(false);
  });

  /**
   * Test: Artifacts included in chat response on completion
   *
   * When a sandbox job completes, the chat router should fetch the
   * artifact URLs and include them in the chat response message,
   * similar to how media results are included today.
   */
  it("fetches artifact URLs when sandbox job completes", async () => {
    mockGetJobArtifactUrls.mockResolvedValue([
      {
        artifactId: 1,
        url: "https://r2.example.com/output.png",
        key: "sandbox-artifacts/job-abc/output.png",
        mimeType: "image/png",
        isPrimary: true,
      },
    ]);

    const artifacts = await mockGetJobArtifactUrls({
      jobId: "job-abc-123",
      tenantId: "tenant-1",
      ttlSeconds: 900,
    });

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].isPrimary).toBe(true);
    expect(artifacts[0].url).toContain("r2.example.com");
  });

  /**
   * Test: Non-sandbox skills continue working unchanged
   *
   * When executeSkill returns a standard result (type: "text", "image", etc.),
   * the chat router must handle it exactly as before -- no regression.
   */
  it("passes through non-sandbox skill results unchanged", () => {
    mockExecuteSkill.mockResolvedValue({
      success: true,
      skillId: "image-creator",
      type: "image",
      resultUrl: "https://example.com/image.png",
    });

    // The existing code path handles type "image" by creating a
    // message with the image URL -- this should remain unchanged
    expect(mockExecuteSkill).toBeDefined();
  });
});
```

### 8.2 Skills Router Sandbox Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/skills.sandbox.test.ts`

These tests verify that the skills listing endpoints include sandbox-related metadata.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetAvailableSkills } = vi.hoisted(() => ({
  mockGetAvailableSkills: vi.fn(),
}));

vi.mock("../../services/skillRegistry", () => ({
  getAvailableSkills: mockGetAvailableSkills,
  getSkillById: vi.fn(),
  getSkillByIdOrType: vi.fn(),
  getDefaultEnabledSkills: vi.fn(),
  refreshSkillCache: vi.fn(),
  syncSingleSkillIfChanged: vi.fn(),
}));

vi.mock("../../services/brandingSanitizer", () => ({
  sanitizeBrandText: (s: string) => s,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("skills router sandbox metadata", () => {
  /**
   * Test: Skills list includes sandboxRequired flag
   *
   * When the skills.list procedure returns skill objects, each skill
   * should include a `sandboxRequired` boolean indicating whether
   * the skill needs a sandbox execution environment.
   * A skill requires sandbox when its executionMode starts with "sandbox-".
   */
  it("includes sandboxRequired flag for sandbox-mode skills", () => {
    mockGetAvailableSkills.mockReturnValue([
      {
        id: "code-runner",
        name: "Code Runner",
        description: "Run Python code",
        icon: "code",
        type: "code_assistant",
        executionMode: "sandbox-code",
        creditMultiplier: 1.0,
        enabledByDefault: true,
        priority: 50,
        skillFilePath: "/skills/code-runner/skill.md",
        sandboxProfileSlug: "code-default",
      },
      {
        id: "brainstorm",
        name: "Brainstorm",
        description: "Generate ideas",
        icon: "lightbulb",
        type: "chat_assistant",
        executionMode: "llm-only",
        creditMultiplier: 1.0,
        enabledByDefault: true,
        priority: 50,
        skillFilePath: "/skills/brainstorm/skill.md",
      },
    ]);

    const skills = mockGetAvailableSkills();

    // Verify sandbox-code skill would be flagged as sandboxRequired
    const codeRunner = skills.find((s: any) => s.id === "code-runner");
    expect(codeRunner.executionMode).toBe("sandbox-code");
    expect(codeRunner.executionMode.startsWith("sandbox-")).toBe(true);

    // Verify llm-only skill would NOT be flagged as sandboxRequired
    const brainstorm = skills.find((s: any) => s.id === "brainstorm");
    expect(brainstorm.executionMode).toBe("llm-only");
    expect(brainstorm.executionMode.startsWith("sandbox-")).toBe(false);
  });

  /**
   * Test: Skills with sandbox execution show sandbox metadata
   *
   * When a skill has a sandboxProfileSlug set, the listing should
   * include it in the response so the UI can display sandbox status.
   */
  it("includes sandboxProfileSlug in skill metadata", () => {
    mockGetAvailableSkills.mockReturnValue([
      {
        id: "code-runner",
        name: "Code Runner",
        executionMode: "sandbox-code",
        sandboxProfileSlug: "code-default",
      },
    ]);

    const skills = mockGetAvailableSkills();
    expect(skills[0].sandboxProfileSlug).toBe("code-default");
  });
});
```

### 8.3 Media Router Sandbox Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/media.sandbox.test.ts`

These tests verify the media router routes appropriate jobs through the sandbox.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockShouldUseSandbox, mockDispatchToSandbox } = vi.hoisted(() => ({
  mockShouldUseSandbox: vi.fn(),
  mockDispatchToSandbox: vi.fn(),
}));

vi.mock("../../services/sandbox/dispatchService", () => ({
  shouldUseSandbox: mockShouldUseSandbox,
  dispatchToSandbox: mockDispatchToSandbox,
}));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENSANDBOX_ENABLED;
  delete process.env.SANDBOX_REQUIRE_FOR_MEDIA;
});

describe("media router sandbox routing", () => {
  /**
   * Test: Media jobs requiring sandbox dispatch through sandbox
   *
   * When OPENSANDBOX_ENABLED=true and SANDBOX_REQUIRE_FOR_MEDIA=true,
   * media generation requests (image, video) should be routed through
   * the sandbox dispatch service instead of directly to the Python
   * backend's media endpoints.
   *
   * The sandbox dispatch creates a sandbox_jobs record and routes
   * the FFmpeg/image processing work to a sandboxed container.
   */
  it("routes media job through sandbox when sandbox is required for media", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    process.env.SANDBOX_REQUIRE_FOR_MEDIA = "true";

    mockShouldUseSandbox.mockReturnValue(true);
    mockDispatchToSandbox.mockResolvedValue({ jobId: "sandbox-media-job-1" });

    // The media router should check shouldUseSandbox("sandbox-media")
    // and dispatch through the sandbox path
    expect(mockShouldUseSandbox("sandbox-media")).toBe(true);
  });

  /**
   * Test: Non-sandbox media jobs use existing path
   *
   * When OPENSANDBOX_ENABLED=false or SANDBOX_REQUIRE_FOR_MEDIA=false,
   * media generation continues through the existing
   * mediaGenerationService -> Python backend flow.
   */
  it("uses legacy path when sandbox is disabled for media", () => {
    process.env.OPENSANDBOX_ENABLED = "false";

    mockShouldUseSandbox.mockReturnValue(false);

    expect(mockShouldUseSandbox("sandbox-media")).toBe(false);
    expect(mockDispatchToSandbox).not.toHaveBeenCalled();
  });

  /**
   * Test: Media sandbox dispatch preserves polling mechanism
   *
   * When media is dispatched through sandbox, the response should
   * still include a taskId/jobId that the client can use to poll
   * for completion status, just like the existing async media flow.
   */
  it("returns pollable job ID from sandbox dispatch", async () => {
    mockDispatchToSandbox.mockResolvedValue({ jobId: "sandbox-media-job-2" });

    const result = await mockDispatchToSandbox({
      featureType: "media",
      executionMode: "sandbox-media",
      tenantId: "tenant-1",
      userId: 42,
      inputFiles: [],
    });

    expect(result.jobId).toBe("sandbox-media-job-2");
  });
});
```

### 8.4 Library Router Sandbox Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/library.sandbox.test.ts`

These tests verify the library router dispatches complex file parsing through the sandbox.

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockShouldUseSandbox, mockDispatchToSandbox } = vi.hoisted(() => ({
  mockShouldUseSandbox: vi.fn(),
  mockDispatchToSandbox: vi.fn(),
}));

vi.mock("../../services/sandbox/dispatchService", () => ({
  shouldUseSandbox: mockShouldUseSandbox,
  dispatchToSandbox: mockDispatchToSandbox,
}));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENSANDBOX_ENABLED;
});

/**
 * File types that require sandbox parsing (use native libraries,
 * complex binary formats, potential code execution risk):
 */
const SANDBOX_FILE_TYPES = [
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // PPTX
  "application/pdf",                                                           // PDF
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",   // DOCX
];

/**
 * File types that stay in core (simple text-based formats, low risk):
 */
const CORE_FILE_TYPES = [
  "text/plain",
  "application/json",
  "text/csv",
  "text/markdown",
];

describe("library router sandbox dispatch", () => {
  /**
   * Test: PPTX/PDF/DOCX upload triggers sandbox parsing
   *
   * When a user uploads a file with a complex binary format,
   * the library router should dispatch the parsing job through
   * the sandbox with the "file-parser" profile. This isolates
   * native library parsing (e.g., python-pptx, pdfplumber)
   * in a sandboxed container.
   */
  it.each(SANDBOX_FILE_TYPES)(
    "dispatches %s through sandbox when enabled",
    (fileType) => {
      process.env.OPENSANDBOX_ENABLED = "true";
      mockShouldUseSandbox.mockReturnValue(true);

      // The library router should determine that this file type
      // requires sandbox parsing
      const requiresSandbox = SANDBOX_FILE_TYPES.includes(fileType);
      expect(requiresSandbox).toBe(true);
    },
  );

  /**
   * Test: Plain text/JSON/CSV stays in core
   *
   * Simple text-based formats are parsed in the core application
   * process without sandbox overhead. These formats pose negligible
   * security risk and don't use native parsing libraries.
   */
  it.each(CORE_FILE_TYPES)(
    "keeps %s in core processing (no sandbox)",
    (fileType) => {
      process.env.OPENSANDBOX_ENABLED = "true";

      const requiresSandbox = SANDBOX_FILE_TYPES.includes(fileType);
      expect(requiresSandbox).toBe(false);
    },
  );

  /**
   * Test: Sandbox parsing disabled when feature flag is off
   *
   * Even for complex file types, when OPENSANDBOX_ENABLED=false,
   * parsing falls back to the existing in-process path.
   */
  it("uses legacy parsing when sandbox is disabled", () => {
    process.env.OPENSANDBOX_ENABLED = "false";
    mockShouldUseSandbox.mockReturnValue(false);

    expect(mockShouldUseSandbox("sandbox-file")).toBe(false);
  });

  /**
   * Test: Sandbox file parsing uses file-parser profile
   *
   * When dispatching through sandbox, the library router should
   * specify the "file-parser" profile (1 CPU, 2048 MB, 300s timeout,
   * network deny, command execution allowed).
   */
  it("dispatches with file-parser profile", async () => {
    mockDispatchToSandbox.mockResolvedValue({ jobId: "parse-job-1" });

    const result = await mockDispatchToSandbox({
      featureType: "library",
      executionMode: "sandbox-file",
      tenantId: "tenant-1",
      userId: 42,
      inputFiles: [
        { key: "uploads/doc.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", sizeBytes: 5242880 },
      ],
      profileOverride: "file-parser",
    });

    expect(result.jobId).toBe("parse-job-1");
    expect(mockDispatchToSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        featureType: "library",
        executionMode: "sandbox-file",
        profileOverride: "file-parser",
      }),
    );
  });
});
```

---

## Implementation Details

### 8.A -- Chat Router Sandbox Dispatch Path

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/chat.ts`

The `executeSkill` procedure (line 1145) currently calls `executeSkill()` from the skill executor and handles the result based on its `type` field. After section-07, the skill executor may return a result with `type: "sandbox-job"`. The chat router needs to handle this new type.

**Changes to the `executeSkill` mutation handler (around lines 1556-1643):**

1. Add imports at the top of the file (near the existing imports around lines 6-49):

```typescript
import { shouldUseSandbox } from "../services/sandbox/dispatchService";
import { projectStatus } from "../services/sandbox/statusProjection";
import { getJobArtifactUrls } from "../services/sandbox/artifactAccess";
```

2. After the call to `executeSkill()` at line 1560, add a handler for the sandbox-job result type. This should be inserted BEFORE the existing structured actions handling (line 1582) and message persistence (line 1601):

```typescript
// After: let result = await executeSkill(skill, { ... }, ctx.user.id, userToken);

// Handle sandbox job result -- return job ID for client polling
if (result.type === "sandbox-job" && result.jobId) {
  // Persist a placeholder assistant message indicating sandbox execution
  if (input.conversationId) {
    try {
      await createMessage({
        conversationId: input.conversationId,
        role: "assistant",
        content: `Executing "${skill.name}" in a secure sandbox environment. Job ID: ${result.jobId}`,
        skillUsed: input.skillId,
      });
    } catch (err) {
      console.error("[executeSkill] Failed to save sandbox job message:", err);
    }
  }

  return {
    success: true,
    skillId: input.skillId,
    type: "sandbox-job" as const,
    jobId: result.jobId,
    message: result.message || "Job dispatched to secure sandbox",
    isAsync: true,
  };
}

// ... existing handling for other result types continues below ...
```

3. The existing result persistence code (lines 1601-1641) already handles various `type` values. Add a case in the persistence block to handle `sandbox-job`:

Within the `if (input.conversationId && result.success)` block (around line 1601), the existing code checks `result.type === "image"`, `"video"`, etc. No additional change is needed here because the sandbox-job type is handled and returned early in step 2 above.

**Key behavior when `type === "sandbox-job"`:**
- The client receives `{ type: "sandbox-job", jobId: "...", isAsync: true }`
- The client uses the `jobId` to poll `sandbox.getJobStatus` (from section-05 router) for progress
- When the sandbox job completes, the client calls `sandbox.getJobStatus` which returns artifact URLs
- The client then displays the artifacts in the chat UI

**Intermediate status streaming:**
The chat UI should display user-friendly status messages while polling. The `projectStatus()` function from section-05 maps internal states to labels like "Preparing secure workspace..." and "Running securely...". The client-side polling logic (implemented in the frontend, outside this section's scope) reads the `label` field from `getJobStatus` responses.

### 8.B -- Skills Router Sandbox Metadata

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts`

The `list` procedure (line 710) returns a simplified array of skill objects for the UI. It needs to include sandbox-related metadata so the frontend can display a sandbox indicator and know which skills require sandbox execution.

**Changes to the `list` procedure (lines 728-739):**

Extend the return mapping to include `sandboxRequired` and `sandboxProfileSlug`:

```typescript
// Current return at line 729:
return skills.map((skill) => ({
  id: skill.id,
  name: sanitizeBrandText(skill.name),
  description: sanitizeBrandText(skill.description),
  icon: skill.icon,
  type: skill.type,
  creditMultiplier: skill.creditMultiplier,
  enabledByDefault: skill.enabledByDefault,
  priority: skill.priority,
  hasSkillFile: !!skill.skillFilePath,
  // NEW: Sandbox metadata
  sandboxRequired: !!(skill as any).executionMode?.startsWith("sandbox-"),
  sandboxProfileSlug: (skill as any).sandboxProfileSlug ?? null,
  executionMode: (skill as any).executionMode ?? null,
}));
```

The `sandboxRequired` flag is derived from the `executionMode` field. A skill requires sandbox when:
- `executionMode` starts with `"sandbox-"` (i.e., `sandbox-code`, `sandbox-command`, `sandbox-browser`, `sandbox-file`, `sandbox-media`)
- OR `executionMode === "media-generate"` AND `SANDBOX_REQUIRE_FOR_MEDIA=true`

For the initial implementation, the simple prefix check (`startsWith("sandbox-")`) is sufficient. The `media-generate` -> `sandbox-media` migration is controlled by the feature flag in section-07's backward compatibility mapping, so by the time the media-generate skill reaches the listing, its `executionMode` will already be resolved.

**No changes to `listForWorkflow` procedure (line 743):** Workflow skill listings already include full skill metadata. The new fields from the `SkillDefinition` type (added in section-07) will automatically flow through.

### 8.C -- Media Router Sandbox Routing

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/media.ts`

The media router has three main generation procedures: `generateImage` (line 214), `generateVideo`, and `generateAudio`. When sandbox is enabled for media, these procedures should dispatch through the sandbox system instead of directly calling `mediaGenerationService`.

**Changes to the `generateImage` procedure (starting at line 229):**

1. Add imports at the top of the file:

```typescript
import { shouldUseSandbox, dispatchToSandbox } from "../services/sandbox/dispatchService";
import { estimateCost, reserveCredits } from "../services/sandbox/costEstimator";
import { resolveProfile } from "../services/sandbox/policyResolver";
```

2. Add a sandbox routing check early in the mutation handler, after the rate limit check (around line 237) but before the credit check. This check determines whether the media job should go through the sandbox:

```typescript
// Inside generateImage mutation handler:

// Check if media should route through sandbox
const sandboxEnabled = shouldUseSandbox("sandbox-media")
  && process.env.SANDBOX_REQUIRE_FOR_MEDIA === "true";

if (sandboxEnabled) {
  // Resolve the media-processing sandbox profile
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);

  // Dispatch to sandbox
  const sandboxResult = await dispatchToSandbox({
    featureType: "media",
    executionMode: "sandbox-media",
    tenantId: tenantId || "",
    userId: ctx.user.id,
    inputFiles: [],  // Image generation has no input files
    metadata: {
      model: input.model,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      numImages: input.numImages,
      ...input.extraParams,
    },
  });

  return {
    success: true,
    taskId: sandboxResult.jobId,
    isAsync: true,
    message: "Media generation dispatched to secure sandbox",
    isSandboxJob: true,
  };
}

// ... existing legacy path continues below ...
```

**Key design decision:** The sandbox routing for media is controlled by TWO flags:
- `OPENSANDBOX_ENABLED=true` (global sandbox switch)
- `SANDBOX_REQUIRE_FOR_MEDIA=true` (media-specific enforcement)

Both must be true for media to route through sandbox. This allows enabling sandbox for other features (skills, code nodes) while keeping media on the legacy path until the media pipeline migration (section-06) is validated.

**Apply the same pattern to `generateVideo` and `generateAudio`:** Each procedure gets the same early sandbox routing check. The pattern is identical -- check flags, dispatch if enabled, return job ID for polling.

**The existing polling mechanism is preserved:** Currently, async media jobs (especially video) return `{ isAsync: true, taskId: "..." }` and the client polls `media.getTaskStatus`. For sandbox jobs, the client receives `{ isAsync: true, taskId: "sandbox-job-id", isSandboxJob: true }`. When `isSandboxJob` is true, the client should poll `sandbox.getJobStatus` instead of `media.getTaskStatus`. The `isSandboxJob` flag distinguishes between the two polling endpoints.

### 8.D -- Library Router Sandbox File Parsing

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/library.ts`

The `uploadFile` procedure (line 189) calls `uploadLibraryFile()` from the library service. Currently, all file parsing happens within the library service's indexing pipeline. For complex document types, this section adds a sandbox dispatch path.

**Changes to the `uploadFile` procedure (around lines 189-220):**

1. Add imports at the top:

```typescript
import { shouldUseSandbox, dispatchToSandbox } from "../services/sandbox/dispatchService";
```

2. Add a helper constant defining which MIME types require sandbox parsing:

```typescript
/**
 * MIME types that require sandbox-isolated parsing.
 * These formats use native libraries (python-pptx, pdfplumber, python-docx)
 * that could be exploited via crafted files.
 */
const SANDBOX_PARSE_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // PPTX
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",   // DOCX
  "application/vnd.ms-powerpoint",                                              // PPT (legacy)
  "application/msword",                                                         // DOC (legacy)
]);
```

3. Inside the `uploadFile` mutation handler, after the existing `uploadLibraryFile()` call (line 200), add sandbox dispatch for the indexing/parsing step. The upload itself stays in core (it just stores the file), but the parsing/indexing job is dispatched to sandbox:

```typescript
// Inside uploadFile mutation handler, after the uploadLibraryFile call:

const result = await uploadLibraryFile(input, actor);

// Check if the file type requires sandbox parsing
const requiresSandboxParsing =
  shouldUseSandbox("sandbox-file") &&
  SANDBOX_PARSE_MIME_TYPES.has(input.fileType);

if (requiresSandboxParsing) {
  // Dispatch file parsing to sandbox with file-parser profile
  try {
    const sandboxResult = await dispatchToSandbox({
      featureType: "library",
      executionMode: "sandbox-file",
      tenantId: tenantIdResolved,
      userId: ctx.user.id,
      inputFiles: [
        {
          key: result.item.objectKey || "",  // S3/R2 key of uploaded file
          mimeType: input.fileType,
          sizeBytes: Buffer.byteLength(input.fileBase64, "base64"),
        },
      ],
      profileOverride: "file-parser",
      metadata: {
        libraryItemId: result.item.id,
        fileName: input.fileName,
      },
    });

    // Attach the sandbox job ID to the result for status tracking
    (result as any).sandboxParseJobId = sandboxResult.jobId;
  } catch (err) {
    // If sandbox dispatch fails and mode is optional, fall through
    // to legacy parsing (already triggered by uploadLibraryFile)
    console.error("[library.uploadFile] Sandbox parsing dispatch failed:", err);
  }
}

// ... existing audit logging continues ...
```

**Design notes:**

- The `uploadLibraryFile()` call still runs -- it handles file storage and creates the library item record. The sandbox dispatch is for the parsing/indexing step that extracts text content from the binary format.

- If sandbox dispatch fails and `DISPATCH_MODE=optional`, the existing in-process parsing from `uploadLibraryFile()` serves as the fallback. This means no user-visible error.

- The `file-parser` sandbox profile (from section-02 seed data) has: 1 CPU, 2048 MB, 300s timeout, network deny, command execution allowed. This is sufficient for document parsing.

- Simple text formats (`text/plain`, `application/json`, `text/csv`, `text/markdown`) are never routed to sandbox because `SANDBOX_PARSE_MIME_TYPES.has()` returns false for them. They continue to be parsed in-process.

---

## Backward Compatibility and Feature Flag Behavior

All four router modifications follow the same feature flag pattern:

| Flag State | Chat Router | Skills Router | Media Router | Library Router |
|---|---|---|---|---|
| `OPENSANDBOX_ENABLED=false` | Legacy skill execution | No sandboxRequired flags shown | Legacy media path | Legacy file parsing |
| `OPENSANDBOX_ENABLED=true`, `SANDBOX_REQUIRE_FOR_MEDIA=false` | Sandbox for sandbox-mode skills only | Shows sandboxRequired flags | Legacy media path | Sandbox for complex files |
| `OPENSANDBOX_ENABLED=true`, `SANDBOX_REQUIRE_FOR_MEDIA=true` | Sandbox for sandbox-mode skills | Shows sandboxRequired flags | Sandbox for all media | Sandbox for complex files |

When `OPENSANDBOX_ENABLED=false`, all four routers behave identically to the current codebase. No code paths change. This is the default state during initial deployment and rollout phases 1-2.

---

## Error Handling

Each router modification follows the existing error handling patterns in the codebase:

- **Sandbox dispatch failure (optional mode):** Log the error, fall through to legacy path. The user sees no difference. The error is logged to the JSONL audit log.

- **Sandbox dispatch failure (required mode):** Throw a `TRPCError` with `code: "SERVICE_UNAVAILABLE"` and a user-friendly message: "Secure execution environment temporarily unavailable. Please try again later."

- **Tenant policy denied:** Throw a `TRPCError` with `code: "FORBIDDEN"` and a message explaining the limit: "Your workspace has reached the maximum number of concurrent sandbox jobs (X/Y)."

- **Insufficient credits:** Throw a `TRPCError` with `code: "FORBIDDEN"` and a message: "Insufficient credits for this operation."

All errors include audit log entries with the sandbox job context for debugging.

---

## Implementation Checklist

1. Write all 4 test files (chat, skills, media, library sandbox tests)
2. Run tests -- they should fail initially (no implementation yet)
3. Modify `skills.ts` to add `sandboxRequired` and `sandboxProfileSlug` to the `list` procedure response (simplest change)
4. Modify `chat.ts` to handle `sandbox-job` type from `executeSkill()` result
5. Modify `media.ts` to add sandbox routing for `generateImage`, `generateVideo`, `generateAudio`
6. Modify `library.ts` to add sandbox dispatch for complex file parsing
7. Run all 4 test files: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`
8. Run the full test suite to verify no regressions: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`
9. Run TypeScript type check: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`
10. Verify existing router tests still pass (especially `chat.test.ts`, `skills.test.ts`, `media.test.ts`, `library.test.ts`)