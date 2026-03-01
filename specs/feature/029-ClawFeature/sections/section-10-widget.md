Now I have all the context needed. Let me generate the section content.

# Section 10: F02 -- Embeddable Chat Widget

## Overview

This section implements a fully embeddable chat widget that third parties can add to their websites via a single `<script>` tag. The widget consists of four subsystems: (1) a separate Vite build producing a lightweight chat iframe bundle, (2) an embed.js loader script with HMAC-signed init tokens, (3) a WebSocket-based widgetGateway on the server that proxies messages through the existing `channelGateway.ingest()` pipeline, and (4) an admin UI for widget CRUD, theme customization, and credit budget management.

Anonymous visitors are tracked through a per-tenant system user account that cannot log in through normal auth flows. Credits are deducted from the tenant owner's balance with per-visitor session, daily, and monthly caps enforced via Redis atomic counters.

## Dependencies

- **section-01-database** (must be completed first): Creates the `chat_widgets` table with all columns (tenant_id, name, target_type, target_agency_id, default_persona_id, theme, allowed_origins, rate_limit_per_minute, max_conversation_length, require_email, credit_source, monthly_credit_budget, max_credits_per_visitor_session, max_credits_per_visitor_day, is_active, timestamps). Also adds `'widget'` as a valid value context for the channel system.
- **section-05-channel-adapter** (recommended): Provides the `ChannelAdapterRegistry` and generalized `channelGateway.ingest()` interface. Widget messages flow through ingest with `channelType: 'widget'`. If section-05 is not yet complete, the widget gateway can call `channelGateway.processMessageServerSide()` directly as a fallback.
- **section-14-feature-flags** (recommended): The `chatWidget` feature flag gates this entire feature. If not yet implemented, add a placeholder check.

## File Inventory

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/client/widget/main.tsx` | **Create** | Widget React entry point |
| `apps/web/client/widget/WidgetChat.tsx` | **Create** | Minimal chat UI component for iframe |
| `apps/web/client/widget/embed.ts` | **Create** | Embed.js loader script (creates iframe, handles postMessage) |
| `apps/web/client/widget/index.html` | **Create** | HTML shell for widget iframe |
| `apps/web/vite.config.widget.ts` | **Create** | Separate Vite config for widget build |
| `apps/web/server/routes/widgetGateway.ts` | **Create** | WebSocket endpoint + HTTP init token endpoint |
| `apps/web/server/services/widgetService.ts` | **Create** | Widget CRUD, system user management, credit cap logic |
| `apps/web/server/routers/widget.ts` | **Create** | tRPC router for widget admin operations |
| `apps/web/client/src/pages/AdminWidgets.tsx` | **Create** | Admin UI for widget management |
| `apps/web/server/routes/__tests__/widgetGateway.test.ts` | **Create** | Gateway tests |
| `apps/web/server/services/__tests__/widgetService.test.ts` | **Create** | Service tests |
| `apps/web/server/routers/__tests__/widget.test.ts` | **Create** | Router tests |
| `apps/web/client/widget/__tests__/embed.test.ts` | **Create** | Embed script tests |
| `apps/web/server/_core/index.ts` | **Modify** | Register widget HTTP routes and WebSocket upgrade handler |
| `apps/web/server/routers/index.ts` | **Modify** | Add widget router to appRouter |
| `apps/web/vite.config.ts` | **Modify** | (Optional) Add widget build as additional entry if using single config |
| `apps/web/shared/channelTypes.ts` | **Modify** | Add `'widget'` to channel type union |
| `nginx/conf.d/dev-host.conf` | **Modify** | Add WebSocket proxy for `/widget/v1/ws` |

---

## Tests (Write First)

All tests use Vitest with hoisted mocks following the established project conventions (`vi.hoisted()`, module mocks for DB/services/external APIs).

### Test File 1: `apps/web/server/routes/__tests__/widgetGateway.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the Widget Gateway (HTTP init endpoint + WebSocket handler).
 *
 * Covers:
 * - HMAC-signed init token generation and validation
 * - Expired init token rejection
 * - postMessage origin validation (both directions)
 * - Rate limiting enforcement (10 msgs/min default)
 * - Messages flowing through channelGateway.ingest with channelType 'widget'
 * - WebSocket connection rejected for inactive widgets
 * - WebSocket connection rejected for disallowed origins
 */

// Mock dependencies: db, redis, crypto, channelGateway, widgetService
// Use vi.hoisted() for mock definitions consistent with project patterns

describe("Widget Init Token", () => {
  it("generates HMAC-signed init token with correct payload shape");
  it("rejects request when widget is_active is false");
  it("rejects request when tenant chatWidget feature flag is false");
  it("includes tenantId, widgetId, visitorSessionId, iat, exp in token payload");
  it("token TTL is 24 hours from issuance");
});

describe("Widget Token Validation", () => {
  it("accepts valid HMAC-signed token");
  it("rejects token with tampered payload");
  it("rejects token past exp (24h TTL)");
  it("rejects token with missing required fields");
});

describe("Widget WebSocket", () => {
  it("accepts connection with valid init token");
  it("rejects connection with expired init token");
  it("rejects connection from disallowed origin (not in allowed_origins)");
  it("enforces rate limit of N msgs/min (widget.rate_limit_per_minute)");
  it("routes messages through channelGateway.ingest with channelType 'widget'");
  it("closes connection with code 4003 on rate limit exceeded");
  it("closes connection with code 4001 on invalid/missing token");
});
```

### Test File 2: `apps/web/server/services/__tests__/widgetService.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for widgetService — system user management, credit cap logic.
 *
 * Covers:
 * - Per-tenant system user auto-creation on first widget activation
 * - System user email pattern: widget-system@{tenantId}.internal
 * - System user cannot login via normal auth flow
 * - Tenant credit deduction with ownerId null check
 * - Per-visitor session cap via Redis
 * - Per-visitor daily cap via Redis
 * - Monthly budget cap via Redis INCR
 */

// Mock: db, redis, creditService

describe("System User Management", () => {
  it("auto-creates system user on first widget activation for tenant");
  it("system user email matches pattern widget-system@{tenantId}.internal");
  it("system user role is 'user' (not system — role does not exist in enum)");
  it("system user password is random bcrypt hash (not guessable)");
  it("returns existing system user if already created for tenant");
  it("rejects login attempt for widget-system@*.internal emails");
});

describe("Credit Deduction for Widget", () => {
  it("deducts credits from tenant ownerId when credit_source is 'tenant'");
  it("throws PRECONDITION_FAILED when tenant ownerId is null");
  it("includes sourceType 'widget' in credit transaction metadata");
});

describe("Per-Visitor Rate Caps (Redis)", () => {
  it("enforces session cap — rejects message when session credits exhausted");
  it("enforces daily cap — rejects message when daily credits exhausted");
  it("enforces monthly budget — rejects message when monthly budget exhausted");
  it("session cap key format: widget:session:{visitorSessionId}");
  it("daily cap key format: widget:daily:{widgetId}:{visitorIp}:{YYYY-MM-DD}");
  it("monthly cap key format: widget:monthly:{widgetId}:{YYYY-MM}");
  it("daily cap key expires after 24 hours");
  it("monthly cap key expires after 32 days");
  it("Redis INCR is atomic — concurrent requests do not exceed cap");
});
```

### Test File 3: `apps/web/server/routers/__tests__/widget.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the widget tRPC router.
 *
 * Covers:
 * - CRUD operations (list, getById, create, update, delete)
 * - Embed code generation
 * - Tenant isolation (can only access own tenant's widgets)
 * - RBAC (domain_admin or admin required for widget management)
 * - Feature flag enforcement
 */

describe("widget.list", () => {
  it("returns widgets for caller's tenant only");
  it("does not return widgets from other tenants");
  it("returns empty array when no widgets exist");
});

describe("widget.create", () => {
  it("creates widget with valid input and returns widget with id");
  it("validates allowed_origins are valid URL patterns");
  it("rejects creation when chatWidget feature flag is false");
  it("requires domain_admin or admin role");
  it("auto-creates system user on first widget for tenant");
});

describe("widget.update", () => {
  it("updates widget theme and allowed_origins");
  it("rejects update for widget belonging to different tenant");
  it("sanitizes theme values against key allowlist");
});

describe("widget.delete", () => {
  it("soft-deletes widget (sets is_active to false)");
  it("rejects deletion for widget belonging to different tenant");
});

describe("widget.getEmbedCode", () => {
  it("returns HTML snippet with correct script src and widget id");
  it("includes data-widget-id attribute in snippet");
});
```

### Test File 4: `apps/web/client/widget/__tests__/embed.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the embed.js loader script.
 *
 * Covers:
 * - Creates iframe with correct src URL
 * - postMessage origin validation (rejects messages from unexpected origins)
 * - Applies theme configuration from data attributes
 * - Does not create duplicate iframes on double-init
 */

describe("Embed Script", () => {
  it("creates iframe element pointing to /widget/v1/chat?token=...");
  it("validates postMessage origin matches smartaihub.app");
  it("rejects postMessage from unexpected origin");
  it("applies position and theme from data attributes");
  it("prevents duplicate iframe creation on re-initialization");
  it("sends resize messages from iframe to parent via postMessage");
});
```

---

## Implementation Details

### 10.1 Widget Build (Separate Vite Entry)

Create a separate Vite configuration for the widget build. The widget must produce a small, self-contained bundle (target: under 50KB gzipped) that loads independently from the main application.

**File: `apps/web/vite.config.widget.ts`**

Create a dedicated Vite config with:
- Entry point: `client/widget/main.tsx`
- Output directory: `dist/public/widget/v1/`
- Minimal external dependencies (only React core, no Radix, no TanStack Query, no tRPC client)
- Tree-shaking enabled, no code splitting (single bundle)
- Build target: `es2020` for broad browser compatibility
- CSS inlined into JS to minimize requests

The widget HTML shell (`client/widget/index.html`) serves as the iframe content. It loads the widget bundle and renders the `WidgetChat` component.

**File: `apps/web/client/widget/main.tsx`**

Minimal React entry:
- Reads the signed init token from URL query parameter `?token=...`
- Validates token is present (show error state if missing)
- Establishes WebSocket connection to `wss://smartaihub.app/widget/v1/ws`
- Sends token as first WebSocket message for authentication
- Renders `WidgetChat` component with connection state
- Stores token in `sessionStorage` (not localStorage, not accessible to parent page)

**File: `apps/web/client/widget/WidgetChat.tsx`**

Minimal chat UI component:
- Message list with auto-scroll
- Text input with send button
- Typing indicator for assistant responses
- Tenant branding applied via theme config received from server
- postMessage communication with parent window for resize events
- Strict origin validation on all postMessage calls: check `event.origin` against the widget's `allowed_origins` list

**Build script addition in `apps/web/package.json`:**
```json
{
  "scripts": {
    "build:widget": "vite build --config vite.config.widget.ts"
  }
}
```

The main `build` script should be updated to also run `build:widget` so widget assets are included in production deployments.

### 10.2 Embed Script

**File: `apps/web/client/widget/embed.ts`**

This is the script that website owners embed on their pages. It compiles to a standalone JS file (no React dependency) served at `/widget/v1/embed.js`.

Behavior:
1. Reads configuration from the `<script>` tag's `data-*` attributes:
   - `data-widget-id` (required): The widget UUID
   - `data-position` (optional): `"bottom-right"` (default), `"bottom-left"`
   - `data-theme` (optional): JSON string for theme overrides
2. Calls `POST /api/widget/init` with `{ widgetId }` to obtain an HMAC-signed init token
3. Creates a sandboxed `<iframe>` pointing to `https://smartaihub.app/widget/v1/chat?token=<signed-token>`
4. Listens for `postMessage` events from the iframe (resize, open/close toggle)
5. All postMessage handlers validate `event.origin === 'https://smartaihub.app'` before processing
6. Prevents duplicate initialization (idempotent — if iframe already exists, skip)

The embed script itself has zero dependencies and should be under 5KB minified.

### 10.3 Widget Gateway

**File: `apps/web/server/routes/widgetGateway.ts`**

This file exports two things:
1. An Express router for `POST /api/widget/init` (HTTP endpoint for init token generation)
2. A WebSocket upgrade handler for `wss://smartaihub.app/widget/v1/ws`

#### Init Token Endpoint: `POST /api/widget/init`

Request body:
```typescript
{ widgetId: string }
```

Processing:
1. Look up widget by ID in `chat_widgets` table
2. Verify `is_active === true`
3. Check `chatWidget` feature flag for the widget's tenant
4. Validate request Origin header against widget's `allowed_origins` array. If `allowed_origins` is empty, reject all requests (deny-by-default).
5. Generate a visitor session ID (UUID v4)
6. Create HMAC-signed token payload:
   ```typescript
   {
     tenantId: string,
     widgetId: string,
     visitorSessionId: string,
     iat: number,  // Unix timestamp
     exp: number   // iat + 86400 (24 hours)
   }
   ```
7. Sign: `HMAC-SHA256(WIDGET_HMAC_SECRET, JSON.stringify(payload))` where `WIDGET_HMAC_SECRET` is derived from `LLM_ENCRYPTION_KEY` (e.g., `HMAC-SHA256(LLM_ENCRYPTION_KEY, "widget-token-v1")`)
8. Return `{ token: base64url(JSON.stringify(payload)) + "." + base64url(signature) }`

#### WebSocket Handler: `/widget/v1/ws`

The WebSocket upgrade handler is registered on the HTTP server (not Express) using the `ws` library, following the same pattern used elsewhere in the codebase.

Connection flow:
1. On upgrade request, validate Origin header against a broad allowlist (actual per-widget origin validation happens after token exchange)
2. Accept WebSocket connection
3. First message from client must be `{ type: "auth", token: "<init-token>" }`
4. Validate token:
   - Parse `payload.signature` from the token string
   - Recompute HMAC and compare with `crypto.timingSafeEqual()`
   - Check `exp > Date.now() / 1000`
   - Load widget from DB, verify `is_active`
5. If invalid: close with code `4001` ("Unauthorized")
6. If valid: associate connection with `{ tenantId, widgetId, visitorSessionId }`
7. On subsequent messages (`{ type: "message", text: "..." }`):
   - Rate limit check: Redis INCR on `widget:rate:{visitorSessionId}` with TTL = 60s. If count > widget.`rate_limit_per_minute`, close with code `4003`
   - Credit cap checks (see widgetService)
   - Route through `channelGateway.ingest()`:
     ```typescript
     channelGateway.ingest({
       eventId: uuid(),
       eventType: "user_message",
       tenantId: session.tenantId,
       userId: systemUserId,  // from widgetService.getOrCreateSystemUser()
       conversationId: session.conversationId,
       conversationType: widget.target_type,  // 'chat' or 'agency'
       channel: {
         type: "widget",
         connectionId: session.widgetId,
       },
       message: { text: msg.text, attachments: [] },
       idempotencyKey: `widget:${session.visitorSessionId}:${Date.now()}`,
     });
     ```
   - Return assistant response back through WebSocket
8. Lazy initialization: do not create a conversation until the first actual message (not on connection)

#### Origin Validation

Both the HTTP init endpoint and the WebSocket handler validate origins:
- Init endpoint: checks `req.headers.origin` against `widget.allowed_origins`
- WebSocket: checks `req.headers.origin` during upgrade
- postMessage (client-side): both parent page and iframe validate `event.origin`

If `allowed_origins` is an empty array, deny all requests. This is the safe default.

### 10.3b Anonymous User Strategy (System User)

**File: `apps/web/server/services/widgetService.ts`**

The widget service manages the per-tenant system user that acts as the "sender" for all anonymous widget visitors within a tenant.

#### `getOrCreateSystemUser(tenantId: string): Promise<{ userId: number }>`

1. Query `users` table for `email = 'widget-system@{tenantId}.internal'`
2. If found, return the user ID
3. If not found, create a new user:
   ```typescript
   {
     email: `widget-system@${tenantId}.internal`,
     username: `Widget System (${tenantId})`,
     password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
     role: 'user',  // Not 'system' — that role does not exist in roleEnum
     currentTenantId: tenantId,
     isActive: true,
   }
   ```
4. The random bcrypt-hashed password ensures this account can never be logged into via password

#### Login Prevention

Add a check in the login flow (wherever password authentication happens) to reject emails matching the pattern `widget-system@*.internal`. This is an application-level check, not a database constraint. The check should use a regex: `/^widget-system@.+\.internal$/`.

Specific file to modify: the login procedure in the auth router (likely `apps/web/server/routers/auth.ts` or similar). Add the rejection check before password verification to avoid unnecessary bcrypt computation.

#### Credit Deduction

When `credit_source` is `'tenant'`:
1. Load the tenant's `ownerId` from the `tenants` table
2. If `ownerId` is null, throw a TRPCError with code `PRECONDITION_FAILED` and message indicating the tenant has no owner configured for widget billing
3. Call `creditService.deductCredits({ userId: ownerId, amount, description: 'Widget chat', sourceType: 'widget', ... })`

The `sourceType: 'widget'` value must be added to the `CreditSourceType` union in `creditService.ts` and to the `creditSourceTypeEnum` in the database (handled by section-01-database migration).

#### Per-Visitor Rate Caps

All caps use Redis atomic operations:

**Session cap** (`max_credits_per_visitor_session`):
- Key: `widget:session:{visitorSessionId}`
- On each message: `INCRBY key creditCost`. If result > cap, reject.
- TTL: 1 hour (sessions are ephemeral)

**Daily cap** (`max_credits_per_visitor_day`):
- Key: `widget:daily:{widgetId}:{hashedVisitorIp}:{YYYY-MM-DD}`
- Hash the IP with SHA-256 for privacy (no raw IPs in Redis)
- On each message: `INCRBY key creditCost`. If result > cap, reject.
- TTL: 86400 seconds (24 hours)

**Monthly budget** (`monthly_credit_budget`):
- Key: `widget:monthly:{widgetId}:{YYYY-MM}`
- On each message: `INCRBY key creditCost`. If result > budget, reject.
- TTL: 32 days (covers month boundary)

All cap checks happen before the message is processed. If any cap is exceeded, the WebSocket sends a structured error message `{ type: "error", code: "RATE_LIMIT_EXCEEDED" }` and does not close the connection (allows the visitor to see the error and potentially wait).

### 10.4 Widget Admin UI

**File: `apps/web/client/src/pages/AdminWidgets.tsx`**

A React page accessible to `domain_admin` and `admin` roles. Registered in the app router at path `/admin/widgets`.

Features:
1. **Widget List**: Table showing all widgets for the current tenant with columns: name, target type, status (active/inactive), monthly usage, created date
2. **Create/Edit Form**: Modal or drawer with fields:
   - Name (text, required)
   - Target type (select: 'chat' or 'agency')
   - Target agency (select, shown when target_type is 'agency')
   - Default persona (select, optional)
   - Allowed origins (tag input, each entry validated as a URL pattern)
   - Rate limit per minute (number, default 10)
   - Max conversation length (number, default 100)
   - Require email (checkbox, default false)
   - Credit source (select: 'tenant' or 'visitor')
   - Monthly credit budget (number, nullable)
   - Max credits per visitor session (number, default 50)
   - Max credits per visitor day (number, default 100)
   - Theme customization (color picker for primary color, background, text color)
3. **Embed Code Generator**: Read-only textarea showing the embed snippet:
   ```html
   <script src="https://smartaihub.app/widget/v1/embed.js"
     data-widget-id="<WIDGET_UUID>"
     data-position="bottom-right">
   </script>
   ```
   With a "Copy to clipboard" button.
4. **Theme Customization**: Validate theme keys against an allowlist (`primaryColor`, `backgroundColor`, `textColor`, `fontFamily`, `borderRadius`, `headerText`). Sanitize all string values (strip HTML tags, limit to 200 chars each). Store as JSONB in `chat_widgets.theme`.
5. **Conversation Viewer**: List of recent widget conversations with message preview. Links to full conversation view.

### Widget tRPC Router

**File: `apps/web/server/routers/widget.ts`**

Procedures:
- `widget.list` — Returns all widgets for caller's tenant. Input: none. Protected: domain_admin+.
- `widget.getById` — Returns single widget with full config. Input: `{ widgetId: string }`. Validates tenant ownership.
- `widget.create` — Creates new widget. Input: Zod schema matching chat_widgets columns. Calls `widgetService.getOrCreateSystemUser()` on first widget creation. Protected: domain_admin+.
- `widget.update` — Updates widget config. Input: `{ widgetId: string, ...fields }`. Validates tenant ownership. Sanitizes theme values.
- `widget.delete` — Sets `is_active = false` (soft delete). Input: `{ widgetId: string }`. Validates tenant ownership.
- `widget.getEmbedCode` — Returns the embed HTML snippet. Input: `{ widgetId: string }`.
- `widget.getUsageStats` — Returns monthly credit usage for a widget. Input: `{ widgetId: string, month?: string }`.

All procedures check `chatWidget` feature flag before executing. Add this as a middleware or inline check at the start of each procedure.

### Nginx Configuration

**File: `nginx/conf.d/dev-host.conf`** (modify)

Add a location block for the Widget WebSocket:

```nginx
# Widget WebSocket
location /widget/v1/ws {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 600s;  # Widget sessions can be long-lived
}

# Widget static assets and init endpoint
location /widget/v1/ {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

### Channel Type Extension

**File: `apps/web/shared/channelTypes.ts`** (modify)

Add `'widget'` to the channel type union in `ChatIngressEvent.channel.type`:

```typescript
channel: {
  type: "web" | "telegram" | "widget";
  // ...
};
```

Similarly update `ChatEgressTarget.channelType` to include `'widget'`.

### Server Registration

**File: `apps/web/server/_core/index.ts`** (modify)

1. Import the widget gateway routes and WebSocket handler
2. Register the HTTP routes: `app.use('/api/widget', widgetRouter)`
3. Register the WebSocket upgrade handler on the HTTP server instance for path `/widget/v1/ws`
4. Serve widget static assets from `dist/public/widget/v1/` at the `/widget/v1/` path

**File: `apps/web/server/routers/index.ts`** (modify)

Add the widget tRPC router to the `appRouter` merge:

```typescript
import { widgetRouter } from "./widget";

export const appRouter = router({
  // ... existing routers
  widget: widgetRouter,
});
```

---

## Security Considerations

1. **HMAC Token Integrity**: The init token is signed with `HMAC-SHA256` derived from `LLM_ENCRYPTION_KEY`. Token validation must use `crypto.timingSafeEqual()` to prevent timing attacks.
2. **Origin Validation**: Empty `allowed_origins` means deny-all (not allow-all). Both HTTP and WebSocket endpoints check origins. postMessage handlers on both sides validate `event.origin`.
3. **System User Login Prevention**: The `widget-system@*.internal` pattern is blocked at the application level in the login flow. The random bcrypt password provides defense-in-depth.
4. **Credit Exhaustion Protection**: Per-visitor caps (session + daily) prevent a single visitor from draining tenant credits. Monthly budget provides a hard ceiling for the entire widget.
5. **Rate Limiting**: WebSocket message rate limiting via Redis INCR with TTL prevents abuse. Default: 10 messages/minute (configurable per widget).
6. **Theme Sanitization**: Theme values are validated against a key allowlist and sanitized (HTML stripped, length limited) before storage.
7. **No Sensitive Data in Token**: The init token contains only IDs and timestamps. No API keys, passwords, or PII are included in the token payload.
8. **Feature Flag Gating**: All widget endpoints check the `chatWidget` feature flag. When false: admin UI hidden, init endpoint returns 403, WebSocket connections rejected, existing widget data preserved.

## Implementation Checklist

1. Write all test files (4 files listed above)
2. Create `apps/web/client/widget/` directory structure with `main.tsx`, `WidgetChat.tsx`, `embed.ts`, `index.html`
3. Create `apps/web/vite.config.widget.ts` for separate widget build
4. Create `apps/web/server/services/widgetService.ts` with system user management and credit cap logic
5. Create `apps/web/server/routes/widgetGateway.ts` with init endpoint and WebSocket handler
6. Create `apps/web/server/routers/widget.ts` with tRPC procedures
7. Create `apps/web/client/src/pages/AdminWidgets.tsx` with widget management UI
8. Modify `apps/web/shared/channelTypes.ts` to add `'widget'` channel type
9. Modify `apps/web/server/_core/index.ts` to register widget routes and WebSocket
10. Modify `apps/web/server/routers/index.ts` to add widget router
11. Modify `nginx/conf.d/dev-host.conf` to add widget WebSocket proxy
12. Add login prevention check for `widget-system@*.internal` in auth flow
13. Add `build:widget` script to `apps/web/package.json`
14. Run all tests, verify widget build produces bundle under 50KB gzipped
15. Verify end-to-end: embed script on test page -> init token -> WebSocket connection -> message round-trip through channelGateway