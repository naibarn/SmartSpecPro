# Section 9: AIDraftModal UI Changes

## Overview

This section adds an "Auto" mode toggle to the existing `AIDraftModal.tsx` component. When enabled, the modal simplifies to show only the topic textarea and file upload area, replaces the "Generate" button with "Auto Generate", and delegates execution to the Auto Draft Agent via `agency.sendMessage()` instead of the manual `generateDraft.mutate()` pipeline. The toggle is only visible when the `ENABLE_CONTENT_AUTOMATION` feature flag is active.

## Dependencies

- **Section 01 (Shared Infrastructure):** Provides the `ENABLE_CONTENT_AUTOMATION` feature flag and the tRPC procedure to expose it to the frontend.
- **Section 02 (Auto Draft Tool):** The agent-side `builtin-auto-draft` tool that ultimately calls `generateAIDraft()`. The UI does not call this tool directly -- it sends a message to the agent, which orchestrates tool calls.
- **Section 07 (Agent Template):** The "Auto Draft Agent" template must exist in the database so the UI can target it via `agency.sendMessage()`.

## Background Context

### Current AIDraftModal Architecture

The modal lives at `apps/web/client/src/components/presentation/AIDraftModal.tsx` (approx 2500+ lines). Key structural elements:

- **Props interface** (`AIDraftModalProps`): `isOpen`, `onClose`, `deckId`, `expectedVersion`, `currentSlideCount`, `canvasWidth`, `canvasHeight`, `onComplete`
- **State:** 30+ state variables controlling topic, skills, models, canvas, style presets, audio, watermark, reference images, etc.
- **Submit flow:** `handleGenerate` callback validates inputs, then calls `generateDraft.mutate()` (a tRPC mutation for `presentation.ai.generateDraft`).
- **Progress display:** After `generateDraft.mutate()` succeeds, the modal switches to a progress view keyed on `taskId`. Polls `getDraftProgress` via tRPC.
- **Footer buttons:** "Generate" button (disabled via `canGenerate` boolean), "Cancel" button during progress, "Done" button on completion.

### Feature Flag System

The project uses tenant-scoped feature flags defined in `apps/web/shared/featureFlags.ts`:

- `TenantFeatureFlags` interface with boolean flags
- `FEATURE_FLAG_DEFAULTS` with default values
- `ALLOWED_FEATURE_FLAGS` set for validation
- Client hook: `useTenantFeatureFlag(flag)` from `apps/web/client/src/hooks/useTenantFeatureFlag.ts`
- Gate component: `FeatureFlagGate` from `apps/web/client/src/components/FeatureFlagGate.tsx`

The `ENABLE_CONTENT_AUTOMATION` environment variable (server-side) is exposed to the client via the tRPC query created in Section 01 (e.g., `trpc.featureFlags.getContentAutomation.useQuery()`). Store the result in a boolean:

```typescript
const { data: featureFlagData } = trpc.featureFlags.getContentAutomation.useQuery();
const contentAutomationEnabled = featureFlagData?.enabled ?? false;
```

### Agency Message Hook

The `useSendAgencyMessage()` hook from `apps/web/client/src/hooks/useAgencyQuery.ts` wraps `trpc.agency.sendMessage.useMutation()`. The `sendMessage` tRPC procedure accepts:

```typescript
{
  agencyId: string;       // UUID of the agent
  conversationId: string; // UUID of the conversation
  message: string;        // User's message text
  retrievalScopeOverride?: { mode: "tenant_accessible" | "library_only" | "web_fallback" };
}
```

The Auto Draft Agent's `agencyId` is resolved by querying the agent list and finding `slug === "auto-draft-agent"`.

## Tests (Write First)

**File:** `apps/web/client/src/components/presentation/__tests__/AIDraftModal.test.tsx`

Add a new `describe("Auto mode", ...)` block within the existing file. The existing test infrastructure uses `vi.hoisted()` mocks for tRPC queries, `vi.mock()` for the trpc module, and `@testing-library/react` for rendering.

### Test Additions

```typescript
// In the vi.hoisted() block, add:
const mockSendAgencyMessageMutate = vi.fn();
const mockContentAutomationEnabled = { current: false };

// In vi.mock("@/lib/trpc", ...) mock factory, wire in:
// trpc.featureFlags.getContentAutomation.useQuery → { data: { enabled: mockContentAutomationEnabled.current } }
// trpc.agency.sendMessage.useMutation → { mutate: mockSendAgencyMessageMutate, isPending: false }
// trpc.agency.list.useQuery → agents array with auto-draft-agent when feature is enabled

describe("Auto mode", () => {
  beforeEach(() => {
    mockContentAutomationEnabled.current = true;
    mockSendAgencyMessageMutate.mockReset();
  });

  it("renders auto mode toggle when feature flag is enabled", () => {
    render(<AIDraftModal {...defaultProps} />);
    expect(screen.getByRole("switch", { name: /auto/i })).toBeInTheDocument();
  });

  it("hides auto mode toggle when feature flag is disabled", () => {
    mockContentAutomationEnabled.current = false;
    render(<AIDraftModal {...defaultProps} />);
    expect(screen.queryByRole("switch", { name: /auto/i })).not.toBeInTheDocument();
  });

  it("hides skill/model/canvas selectors when auto mode is toggled on", async () => {
    render(<AIDraftModal {...defaultProps} />);
    const toggle = screen.getByRole("switch", { name: /auto/i });
    await userEvent.click(toggle);
    expect(screen.queryByText(/article skill/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/image skill/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/canvas size/i)).not.toBeInTheDocument();
    // Topic must remain visible
    expect(screen.getByPlaceholderText(/topic/i)).toBeInTheDocument();
  });

  it("shows Auto Generate button when auto mode is on", async () => {
    render(<AIDraftModal {...defaultProps} />);
    await userEvent.click(screen.getByRole("switch", { name: /auto/i }));
    expect(screen.getByRole("button", { name: /auto generate/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^generate$/i })).not.toBeInTheDocument();
  });

  it("calls agency.sendMessage instead of generateDraft.mutate in auto mode", async () => {
    render(<AIDraftModal {...defaultProps} />);
    await userEvent.click(screen.getByRole("switch", { name: /auto/i }));
    await userEvent.type(screen.getByPlaceholderText(/topic/i), "Marketing presentation");
    await userEvent.click(screen.getByRole("button", { name: /auto generate/i }));
    expect(mockSendAgencyMessageMutate).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Marketing presentation") })
    );
    expect(mockGenerateDraftMutate).not.toHaveBeenCalled();
  });

  it("disables auto mode toggle gracefully if auto-draft-agent not found", () => {
    // wire agency list to return []
    render(<AIDraftModal {...defaultProps} />);
    const toggle = screen.getByRole("switch", { name: /auto/i });
    expect(toggle).toBeDisabled();
  });
});
```

## Implementation Details

### File to Modify

`apps/web/client/src/components/presentation/AIDraftModal.tsx`

### Step 1: Add autoMode State

Near the existing state declarations:

```typescript
const [autoMode, setAutoMode] = useState(false);
const [agencyRunId, setAgencyRunId] = useState<string | null>(null);
```

### Step 2: Feature Flag Query

```typescript
const { data: contentAutomationData } = trpc.featureFlags.getContentAutomation.useQuery(
  undefined,
  { staleTime: 5 * 60 * 1000 }
);
const contentAutomationEnabled = contentAutomationData?.enabled ?? false;
```

### Step 3: Agent Resolution

```typescript
const { data: agencyList } = trpc.agency.list.useQuery(
  {},
  { enabled: contentAutomationEnabled }
);
const autoDraftAgent = agencyList?.find((a) => a.slug === "auto-draft-agent");
```

### Step 4: Agency Send Message Mutation

```typescript
const sendAgencyMessage = trpc.agency.sendMessage.useMutation({
  onSuccess: (result) => {
    setAgencyRunId(result.runId);
  },
  onError: (err) => {
    toast.error(err.message ?? "Auto Draft failed");
  },
});
```

### Step 5: Auto Mode Toggle UI

Place immediately before the topic textarea in the config view:

```tsx
{contentAutomationEnabled && (
  <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
    <div>
      <p className="text-sm font-medium text-blue-900">Auto mode</p>
      <p className="text-xs text-blue-600">
        AI จะเลือก skill, model, style ให้อัตโนมัติ
      </p>
    </div>
    <Switch
      checked={autoMode}
      onCheckedChange={handleAutoModeChange}
      disabled={!autoDraftAgent}
      aria-label="Auto mode"
    />
  </div>
)}
```

### Step 6: Conditional Field Visibility

```tsx
{!autoMode && (
  <>
    {/* Article skill selector */}
    {/* Image skill selector */}
    {/* Image model selector */}
    {/* Canvas preset/aspect ratio selector */}
    {/* Slide count slider */}
    {/* Language selector */}
    {/* Style preset selector */}
    {/* Audio model options */}
    {/* Watermark options */}
    {/* Header/footer text inputs */}
  </>
)}
{/* Always visible: topic textarea, file upload / reference images */}
```

### Step 7: Auto Generate Submit Handler

```typescript
const handleAutoGenerate = useCallback(() => {
  if (!autoDraftAgent) return;
  if (!topic.trim() || topic.trim().length < 3) {
    toast.error("กรุณาระบุหัวข้อ (อย่างน้อย 3 ตัวอักษร)");
    return;
  }
  const conversationId = crypto.randomUUID();
  const message = [
    topic.trim(),
    referenceImageUrls.length > 0
      ? `\n\nAttachments: ${referenceImageUrls.join(", ")}`
      : "",
  ].join("").trim();

  sendAgencyMessage.mutate({ agencyId: autoDraftAgent.id, conversationId, message });
}, [autoDraftAgent, topic, referenceImageUrls, sendAgencyMessage]);
```

### Step 8: Mode Toggle Handler

```typescript
const handleAutoModeChange = useCallback((enabled: boolean) => {
  setAutoMode(enabled);
  if (!enabled) {
    setAgencyRunId(null);
  }
  // Preserve topic and referenceImageUrls across mode switches
}, []);
```

### Step 9: Modified Footer Buttons

```tsx
{/* In DialogFooter, replace the Generate button with: */}
{autoMode ? (
  <Button
    onClick={handleAutoGenerate}
    disabled={!autoDraftAgent || sendAgencyMessage.isPending || topic.trim().length < 3}
    aria-label="Auto Generate"
  >
    <Zap className="mr-2 h-4 w-4" />
    Auto Generate
  </Button>
) : (
  <Button
    onClick={handleGenerate}
    disabled={!canGenerate}
    aria-label="Generate"
  >
    <Sparkles className="mr-2 h-4 w-4" />
    Generate
  </Button>
)}
```

### Step 10: Agency Progress Display

When `agencyRunId` is set, render a simplified progress view alongside or replacing the existing config view:

```tsx
{agencyRunId ? (
  <div className="flex flex-col items-center gap-4 py-8">
    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
    <p className="text-sm text-muted-foreground">AI กำลังสร้างงาน...</p>
    <Button variant="outline" size="sm" onClick={() => {
      setAgencyRunId(null);
      setAutoMode(false);
    }}>
      ยกเลิก
    </Button>
  </div>
) : (
  /* existing config view */
)}
```

Poll run status: `trpc.agency.getRunStatus.useQuery({ runId: agencyRunId }, { enabled: !!agencyRunId, refetchInterval: 2000 })`. On `status === "completed"`, extract `deck_id` from result envelope and call `onComplete(deckId)`.

## Key Constraints

1. **No modifications to `generateAIDraft()` pipeline.** Auto mode routes through agent → builtin-auto-draft → `generateAIDraft()`. The UI never directly invokes `generateAIDraft()`.
2. **No breaking changes to manual mode.** All existing `handleGenerate` logic must remain intact and unmodified.
3. **Graceful degradation.** If `autoDraftAgent` is `undefined`, the toggle renders as `disabled` with tooltip: "Auto Draft Agent not configured".
4. **Accessibility.** `Switch` must have `aria-label="Auto mode"`. "Auto Generate" button must have `aria-label="Auto Generate"`.
5. **State isolation.** `autoMode` never clears `topic` or `referenceImageUrls`. User can switch modes without data loss.

## File Paths Summary

| File | Action |
|------|--------|
| `apps/web/client/src/components/presentation/AIDraftModal.tsx` | Modify — add auto mode toggle, conditional field visibility, agency message submission |
| `apps/web/client/src/components/presentation/__tests__/AIDraftModal.test.tsx` | Modify — add auto mode test block |
| `apps/web/shared/featureFlags.ts` | Potentially modify — add `contentAutomation` flag if using tenant flag system |
| `apps/web/client/src/hooks/useAgencyQuery.ts` | Potentially modify — add hook for finding agent by slug |
