# Research Findings: Spec 040 — Model-Suggest Endpoint + Auto-Draft Planner Wiring

## 1. Codebase Patterns

### 1.1 Auth Middleware for Internal Tools

Two patterns exist in the codebase:

**Pattern A — Bearer token (autoDraftTool.ts lines 35-48):**
```typescript
const authHeader = (req.headers.authorization as string) ?? "";
if (!authHeader.startsWith("Bearer ") || !ENV.webGatewayToken) {
  res.status(401).json({ success: false, error: "Unauthorized" });
  return;
}
const token = authHeader.slice(7);
if (token !== ENV.webGatewayToken) {
  res.status(401).json({ success: false, error: "Unauthorized" });
  return;
}
```

**Pattern B — X-Internal-Token with timing-safe compare (browserTool.ts):**
```typescript
function verifyInternalToken(req: Request): boolean {
  const expected = ENV.webGatewayToken;
  if (!expected) return false;
  const token = req.headers["x-internal-token"] as string | undefined;
  if (!token) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
```

Spec 035 section-03 specifies `X-Internal-Token` header (Pattern B). Use `crypto.timingSafeEqual()` for security.

### 1.2 contentAutomationGate Middleware

Located at `apps/web/server/middleware/contentAutomationGate.ts`:
```typescript
export async function contentAutomationGate(req, res, next) {
  const enabled = await getFeatureFlag("ENABLE_CONTENT_AUTOMATION");
  if (!enabled) {
    res.status(503).json({ error: "Content automation is not enabled" });
    return;
  }
  next();
}
```
Returns **503** (not 403) when disabled. Gate applies to all internal automation tools.

### 1.3 Route Registration Pattern

In `apps/web/server/_core/index.ts`:
```typescript
import { registerAutoDraftToolRoute } from "../routers/autoDraftTool";
// ...
registerAutoDraftToolRoute(app);
```

New route follows same export signature:
```typescript
export function registerModelSuggestToolRoute(app: Express): void {
  app.post("/api/internal/tools/model-suggest", contentAutomationGate, modelSuggestToolHandler);
}
```

### 1.4 Model Registry

`apps/web/server/services/modelRegistry.ts` — key functions:

```typescript
type MediaType = "image" | "video" | "audio";  // Note: NO "text"

// Sync (uses 5-min TTL cache)
function getModelsByType(type: MediaType): ModelDefinition[];
function getDefaultModel(type: MediaType): ModelDefinition | undefined;

// Async (forces cache refresh from DB)
async function getModelsByTypeAsync(type: MediaType): Promise<ModelDefinition[]>;
```

`ModelDefinition` fields: `id`, `type`, `name`, `provider`, `description`, `creditCost`, `priority` (lower = higher quality), `isEnabled`.

**IMPORTANT:** `purpose: "text"` has NO models in registry — must return `{ recommended: null, alternatives: [], message: "..." }`.

### 1.5 Shared Zod Schemas (spec 035 section-03)

From `apps/web/shared/contentAutomation/types.ts` (or to be created):
```typescript
export const ModelSuggestRequestSchema = z.object({
  purpose: z.enum(["image", "video", "audio", "text"]),
  quality_preference: z.enum(["speed", "balanced", "quality"]).optional().default("balanced"),
  userId: z.number(),
  tenantId: z.string(),
});

export const ModelSuggestResponseSchema = z.object({
  success: z.boolean(),
  recommended: modelEntrySchema.nullable(),
  alternatives: z.array(modelEntrySchema).max(3),
  message: z.string().optional(),
});
```

### 1.6 Cost Tier Mapping (spec 035 section-03 lines 49-52)

```typescript
export function creditCostToTier(creditCost: number): "low" | "medium" | "high" {
  if (creditCost <= 5) return "low";
  if (creditCost <= 20) return "medium";
  return "high";
}
```
Raw `creditCost` values **MUST NOT** appear in responses.

### 1.7 Audit Logger Pattern

```typescript
// Event types to add:
// "model_suggest_request" | "model_suggest_response"

auditLogger.log({
  eventType: "model_suggest_response",
  traceId: getTraceId(),
  userId,
  metadata: { tenantId, purpose, recommendedModelId, diverged },
});
```

### 1.8 autoDraftTool.ts — Current Model Selection Gap

Lines 207-225:
```typescript
imageModel: input.image_model_id,  // agent provides blindly — no validation
```
`generateAIDraft()` uses this for image generation. If `image_model_id` is absent or invalid, falls back to default (undefined behavior).

### 1.9 Testing Conventions (from autoDraftTool.test.ts)

- Vitest (`vi.mock`, `vi.fn`, `beforeEach(() => vi.clearAllMocks())`)
- Mocks defined **before** imports
- `contentAutomationGate` mocked to call `next()` directly
- `buildMockRequest()` + `buildMockResponse()` factory helpers
- Tests cover: auth, validation, rate limiting, success, error paths

### 1.10 Rate Limiting

Model-suggest is **read-only** — spec explicitly states rate limiting is NOT required (only auto-draft tool has hourly rate limiting).

### 1.11 Spec 039 Planner — NOT Reused in Model-Suggest

Spec 039's `resolveModelFromPlan()` uses capability matching (structuredOutput, vision, long-context). Model-suggest uses priority + cost ranking. These are separate algorithms for different contexts. Integration point: autoDraftTool.ts fallback wires them implicitly (agent uses model-suggest, then planner records that model for telemetry).

---

## 2. Web Research Findings

### 2.1 Internal API Security — Key Takeaways

- **Always** use `crypto.timingSafeEqual()` — never `===` for secret comparison (timing attack vector)
- Hash both sides before compare to ensure equal-length buffers:
  ```typescript
  const a = createHash("sha256").update(Buffer.from(token)).digest();
  const b = createHash("sha256").update(Buffer.from(expected)).digest();
  timingSafeEqual(a, b);
  ```
- Custom header (`X-Internal-Token`) is standard for service-to-service; `Authorization: Bearer` for mixed internal/external endpoints
- Network-level isolation (bind to 127.0.0.1 or Docker network) is first line of defense; tokens are second layer
- Never log header values — only log `configured: true/false`

### 2.2 Model Routing Patterns (LiteLLM/OpenRouter)

Production-grade routing uses layered signals:
1. **Complexity classification** (zero cost, rule-based) — SIMPLE/MEDIUM/COMPLEX tiers
2. **Cost-based selection within tier** — prefer cheaper unless quality threshold not met
3. **Latency fallback** — escalate if cheapest model is over latency budget
4. **Hard fallback** — always have a no-routing-needed default

Priority-based ranking (lower priority = higher quality) aligns with `priority` field in SmartSpecPro model registry. `quality_preference` maps to:
- `"quality"` → sort by `priority ASC` (lower priority = higher quality)
- `"speed"` → sort by `creditCost ASC` (cheapest = fastest typical proxy)
- `"balanced"` → sort by `priority ASC` (default, same as quality)

### 2.3 HTTP Fallback / Graceful Degradation

**Recommended pattern for model-suggest fallback in autoDraftTool.ts:**

```typescript
// Simple try-catch + default (best for non-critical enrichment call)
async function getRecommendedImageModel(ctx): Promise<string> {
  try {
    const result = await callModelSuggest({ purpose: "image", ...ctx });
    return result.recommended?.model_id ?? DEFAULT_IMAGE_MODEL;
  } catch {
    return DEFAULT_IMAGE_MODEL;  // never block auto-draft for a suggestion failure
  }
}
```

- Use `AbortSignal.timeout(3000)` for 3-second hard deadline on internal HTTP call
- Model-suggest is an **enhancement**, not a gatekeeper — auto-draft must complete even if model-suggest fails
- Circuit breaker (opossum) warranted if model-suggest call volume > 10 req/s; not needed for MVP

---

## 3. Testing Strategy (Vitest)

### Files to create/modify:
- `apps/web/server/routers/modelSuggestTool.test.ts` (new, ~200 lines)
- `apps/web/server/routers/autoDraftTool.test.ts` (extend, ~30 lines for fallback tests)

### modelSuggestTool.test.ts coverage requirements:
```
✓ returns 503 when ENABLE_CONTENT_AUTOMATION is false
✓ returns 401 when X-Internal-Token is missing
✓ returns 401 when X-Internal-Token is wrong
✓ returns 400 when purpose is invalid
✓ returns 400 when userId is missing
✓ returns recommended model for purpose=image
✓ returns recommended model for purpose=video
✓ returns recommended model for purpose=audio
✓ returns null with message for purpose=text
✓ returns up to 3 alternatives, not more
✓ returns empty alternatives when only 1 model exists
✓ cost_tier is categorical (never exposes raw creditCost)
✓ quality_preference=quality sorts by priority ASC
✓ quality_preference=speed sorts by creditCost ASC
✓ quality_preference=balanced uses priority ASC (default)
✓ handles empty model list gracefully (returns null recommended)
✓ emits audit log event on success
```

### autoDraftTool.test.ts additions:
```
✓ uses recommended imageModel when agent sends no image_model_id
✓ uses agent's imageModel when provided (no model-suggest call)
✓ audit log includes { agentModel, recommendedModel, diverged }
✓ auto-draft completes even when model-suggest call fails (fallback to default)
```

---

## 4. ENV Variables

- `SMARTSPEC_WEB_GATEWAY_TOKEN` (fallback: `WEB_GATEWAY_TOKEN`) — accessed via `ENV.webGatewayToken`
- `ENABLE_CONTENT_AUTOMATION=true` — feature flag for gate middleware

No new env vars needed.

---

## 5. File Dependency Map

```
modelSuggestTool.ts
  imports:
    ← ENV from ../_core/env
    ← contentAutomationGate from ../middleware/contentAutomationGate
    ← getModelsByTypeAsync from ../services/modelRegistry
    ← auditLogger, AuditEventType from ../services/auditLogger
    ← getTraceId from ../services/traceContext
    ← ModelSuggestRequestSchema from @shared/contentAutomation/types (verify exists)
    ← z from zod
    ← crypto from node:crypto
    ← Express, Request, Response from express

autoDraftTool.ts (modified)
  new import:
    ← callModelSuggest (internal HTTP or direct function call)

_core/index.ts (modified)
  new import:
    ← registerModelSuggestToolRoute from ../routers/modelSuggestTool
  new call:
    → registerModelSuggestToolRoute(app)
```

**Implementation decision needed:** Should autoDraftTool call model-suggest via HTTP or import the ranking function directly? Direct import avoids network overhead and is simpler. HTTP call matches spec pattern and enables independent scaling. Recommendation: **direct import** (same process, avoids timeout complexity).
