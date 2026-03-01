Good, sandbox is not yet configured. Now I have all the information needed. Let me produce the section content.

# Section 04: F04 -- Canvas / AI Artifacts

## Overview

This section implements the Canvas / AI Artifacts feature (F04), which allows the LLM to produce structured artifact blocks (code, charts, tables, interactive components) that are parsed, stored, versioned, and rendered in a dedicated side pane alongside the chat. It builds on an existing inline artifact viewer (`LLMArtifactViewer.tsx`) and the `messages.artifacts` JSONB column, extending the system with a new `conversationArtifacts` table for versioned/interactive types, a server-side artifact parser, tRPC endpoints, a sandboxed iframe renderer for untrusted HTML/React, and a resizable canvas pane UI.

**Feature flag:** `canvas` -- all canvas functionality is gated behind `tenants.settings.featureFlags.canvas === true`.

## Dependencies

- **section-01-database** must be completed first. It creates:
  - The `conversationArtifacts` table (Section 1.5) with columns: `id` (varchar 36 PK), `conversationId` (integer FK to conversations), `messageId` (integer FK to messages), `artifactType` (CHECK constraint), `title`, `content` (TEXT, 500KB app limit), `language`, `version` (integer default 1), `parentArtifactId` (self-referential FK), `metadata` (JSONB), `createdAt`.
  - The `conversations.tenantId` column with backfill (Section 1.2).
  - The `messages.traceId` column (Section 1.3).
- **section-14-feature-flags** provides the `canvas` feature flag toggle mechanism (but the flag check logic described here is self-contained).

## Artifact Type Mapping (Definitive)

This mapping determines where each artifact type is stored:

| Artifact Type | Storage Location | Reason |
|---------------|-----------------|--------|
| `code` | `messages.artifacts` | Simple display, no versioning needed |
| `markdown` | `messages.artifacts` | Simple render, no interactivity |
| `mermaid` | `messages.artifacts` | Static diagram, no editing |
| `svg` | `messages.artifacts` | Static image, no editing |
| `react` | `conversationArtifacts` table | Interactive, needs sandboxing + versioning |
| `html` | `conversationArtifacts` table | Interactive, needs sandboxing + versioning |
| `chart` | `conversationArtifacts` table | Users may edit data, needs versioning |
| `table` | `conversationArtifacts` table | Users may sort/filter/edit, needs versioning |

When the artifact parser encounters an artifact, it checks the type against this mapping to determine the storage destination.

## Tests (Write First)

All tests use Vitest. Write these test files before implementing the corresponding modules.

### 4.1 Artifact Parser Tests

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/artifactParser.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
// import { parseArtifactBlocks } from "../artifactParser";

describe("artifactParser", () => {
  describe("parseArtifactBlocks", () => {
    it("parses single artifact:chart block from response text", () => {
      /** Input text containing one ```artifact:chart ... ``` fenced block.
       *  Expect: array with one entry, type='chart', content extracted. */
    });

    it("parses multiple artifact blocks from single response", () => {
      /** Input text with two different artifact blocks (code + table).
       *  Expect: array with two entries, correct types and content. */
    });

    it("returns empty array for response with no artifact blocks", () => {
      /** Plain text input with no artifact markers.
       *  Expect: empty array. */
    });

    it("handles malformed artifact blocks gracefully (logs warning, returns raw text)", () => {
      /** Input with unclosed or malformed artifact fence.
       *  Expect: empty array or partial result, no thrown error.
       *  Verify: auditLogger.warn called. */
    });

    it("extracts title from artifact metadata if present", () => {
      /** Input: ```artifact:code title="My Script" ... ```
       *  Expect: parsed artifact has title='My Script'. */
    });

    it("extracts language for code-type artifacts", () => {
      /** Input: ```artifact:code language="python" ... ```
       *  Expect: parsed artifact has language='python'. */
    });
  });
});
```

### 4.2 Artifact Storage Tests

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/artifactStorage.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";

describe("artifactStorage", () => {
  it("code artifact stored in messages.artifacts (simple type)", () => {
    /** When a 'code' artifact is processed, it should be added to
     *  the messages.artifacts JSONB array, not the conversationArtifacts table. */
  });

  it("react artifact stored in conversationArtifacts table (versioned type)", () => {
    /** When a 'react' artifact is processed, it should INSERT into
     *  conversationArtifacts with version=1. */
  });

  it("chart artifact stored in conversationArtifacts table", () => {
    /** When a 'chart' artifact is processed, it should INSERT into
     *  conversationArtifacts with version=1. */
  });

  it("artifact version increments on edit", () => {
    /** When updateArtifact is called on an existing artifact,
     *  a new row is inserted with version = previous + 1. */
  });

  it("parent_artifact_id correctly links version chain", () => {
    /** After creating version 2 of an artifact, the new row's
     *  parentArtifactId should point to the version 1 row's id. */
  });

  it("artifact content over 500KB is rejected", () => {
    /** Content string exceeding 500KB should throw a validation error. */
  });
});
```

### 4.3 tRPC Endpoint Tests

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/artifact.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";

describe("artifact tRPC endpoints", () => {
  describe("getArtifacts", () => {
    it("validates conversation ownership (tenantId + userId)", () => {
      /** Call getArtifacts with a valid conversationId.
       *  Verify the query checks both tenantId and userId. */
    });

    it("rejects request for other user's conversation artifacts", () => {
      /** Call getArtifacts with a conversationId owned by a different user.
       *  Expect: FORBIDDEN error. */
    });
  });

  describe("getArtifactVersions", () => {
    it("returns version chain in order", () => {
      /** Given an artifact with 3 versions, expect results ordered by
       *  version ASC with correct parentArtifactId chain. */
    });
  });

  describe("updateArtifact", () => {
    it("creates new version, does not modify existing", () => {
      /** Call updateArtifact with new content.
       *  Verify: original row unchanged, new row created with version+1. */
    });
  });
});
```

## Implementation Details

### 4.1 Artifact Parser

**Create file:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/artifactParser.ts`

This module parses AI response text for code fence blocks with `artifact:TYPE` markers. The format used by the LLM is:

````
```artifact:TYPE title="Title" language="lang"
content here
```
````

The parser should:

1. Use a regex to find all `` ```artifact:TYPE ... ``` `` fenced blocks in the response text.
2. Extract `TYPE` from the fence opener (e.g., `artifact:chart` yields type `chart`).
3. Extract optional metadata attributes (`title`, `language`) from the same line.
4. Return an array of structured objects:

```typescript
export interface ParsedArtifact {
  type: "code" | "markdown" | "mermaid" | "svg" | "react" | "html" | "chart" | "table";
  content: string;
  title?: string;
  language?: string;
}

export function parseArtifactBlocks(responseText: string): ParsedArtifact[];
```

**Error handling:** On parse failure (malformed block), log a warning via the audit logger, skip the malformed block, and continue parsing. Never crash the response due to parsing issues. Return the successfully parsed artifacts.

**Relationship to existing parser:** The existing `parseArtifacts()` in `LLMArtifactViewer.tsx` uses XML tag format (`<artifact identifier="..." type="..." title="...">...</artifact>`). The new server-side parser uses code fence format. Both can coexist -- the server-side parser is authoritative for the canvas feature; the existing client-side parser continues to work for the current inline artifact viewer. Over time, the LLM prompt should be updated to use the code fence format exclusively when the canvas feature flag is enabled.

### 4.2 Chat Context Modification

**Modify file:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/chatService.ts`

In `buildChatContext()` (line 647), when the canvas feature flag is enabled for the tenant, inject an instruction into the system prompt explaining the artifact format:

```typescript
// Inside buildChatContext(), after existing system prompt injection:
// Check canvas feature flag for the tenant
if (tenantFeatureFlags?.canvas) {
  context.push({
    role: "system",
    content: `When generating charts, tables, code, or interactive content, use the artifact format:
\`\`\`artifact:TYPE title="Title" language="lang"
content
\`\`\`
Supported types: code, markdown, mermaid, svg, react, html, chart, table.
Use 'react' for interactive React components, 'chart' for data visualizations (JSON format), 'table' for structured data.`,
  });
}
```

This requires passing the tenant's feature flags to `buildChatContext()`. The function signature currently takes `(conversationId, userId, systemPrompt?)`. Add an optional `options` parameter or pass `tenantId` so the function can look up the tenant's feature flags.

To get the tenant's feature flags, query the conversation's `tenantId` (added by section-01-database), then load `tenants.settings.featureFlags` from the database.

### 4.3 Artifact Storage Service

**Create file:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/artifactStorageService.ts`

This service handles the dual-store logic:

```typescript
/** Types that go into messages.artifacts JSONB (simple, no versioning) */
const SIMPLE_TYPES = new Set(["code", "markdown", "mermaid", "svg"]);

/** Types that go into conversationArtifacts table (versioned, interactive) */
const VERSIONED_TYPES = new Set(["react", "html", "chart", "table"]);

export function isSimpleArtifact(type: string): boolean;
export function isVersionedArtifact(type: string): boolean;

/**
 * Store parsed artifacts from an LLM response.
 * - Simple types: append to messages.artifacts JSONB array
 * - Versioned types: INSERT into conversationArtifacts with version=1
 */
export async function storeArtifacts(
  conversationId: number,
  messageId: number,
  artifacts: ParsedArtifact[]
): Promise<void>;

/**
 * Create a new version of an existing artifact.
 * INSERTs a new row with parentArtifactId pointing to the latest version,
 * version incremented by 1.
 * Rejects content over 500KB.
 */
export async function createArtifactVersion(
  artifactId: string,
  newContent: string,
  userId: number
): Promise<{ id: string; version: number }>;
```

**Content size limit:** Reject artifact content over 500KB (512,000 bytes) with a descriptive error. This prevents abuse and keeps the database healthy.

**Integration point:** After the LLM response is received and before it is sent to the client, call `parseArtifactBlocks()` on the response text and then `storeArtifacts()`. This happens in the chat message creation flow in `chatService.ts` or wherever the assistant message is persisted.

### 4.4 tRPC Endpoints

**Create file:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/artifact.ts`

Alternatively, add these procedures to the existing `chatRouter` in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/chat.ts`. Given the size of chat.ts, a separate router is recommended.

```typescript
export const artifactRouter = router({
  /**
   * List artifacts for a conversation (both simple from messages and versioned from table).
   * MUST validate: conversation.userId === ctx.user.id AND conversation.tenantId === ctx.tenantId.
   * Never allow artifact retrieval by ID alone — always go through conversation ownership.
   */
  getArtifacts: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => { /* ... */ }),

  /**
   * Get version history for a specific artifact chain.
   * Returns all versions ordered by version ASC.
   * Validates ownership through the conversation.
   */
  getArtifactVersions: protectedProcedure
    .input(z.object({ artifactId: z.string().uuid() }))
    .query(async ({ ctx, input }) => { /* ... */ }),

  /**
   * Create a new version of a versioned artifact.
   * Does NOT modify existing rows — always inserts a new row.
   * Validates ownership, content size (500KB), and feature flag.
   */
  updateArtifact: protectedProcedure
    .input(z.object({
      artifactId: z.string().uuid(),
      content: z.string().max(512000),
      title: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => { /* ... */ }),
});
```

**Register the router:** Add `artifact: artifactRouter` to the merged tRPC router in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/index.ts` (or wherever routers are merged in the `_core/index.ts` file).

**Security:** All three endpoints must validate conversation ownership by checking both `userId` and `tenantId`. The `getArtifacts` query should JOIN through the `conversations` table to enforce this. Admin users may bypass the userId check but must still match tenantId (or be a platform admin).

### 4.5 Sandbox Domain Setup

**Nginx configuration for `sandbox.smartaihub.app`**

This is a separate origin from the main app, used to render untrusted HTML and React artifacts inside a sandboxed iframe. The separate origin ensures that even if the artifact content is malicious, it cannot access the main application's cookies, localStorage, or DOM.

**Create/modify file:** `/home/dev/projects/SmartSpecPro/nginx/conf.d/sandbox.conf`

The Nginx server block should:
- Listen on port 443 (SSL) for `sandbox.smartaihub.app`
- Serve a minimal HTML shell (the sandbox renderer page) from a static directory
- Set strict CSP headers on all responses:

```
Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
```

Key CSP directives:
- `script-src 'unsafe-inline'` -- needed for the artifact code to execute within the iframe
- `connect-src 'none'` -- prevents the artifact from making any network requests
- `form-action 'none'` -- prevents form submission to external URLs (important since iframe sandbox uses `allow-forms`)

**Create the sandbox HTML shell:** `/home/dev/projects/SmartSpecPro/apps/web/public/sandbox.html`

This is a minimal HTML page with a `postMessage` listener. The parent window sends artifact content to it, and it renders the content in the page. It reports height and errors back to the parent via `postMessage`. The shell should include:
- A `message` event listener that validates `event.origin` matches the expected parent origin (`https://smartaihub.app`)
- Logic to render the received content based on artifact type (inject HTML, mount React via a bundled minimal React runtime, or render chart data)
- Error boundary that catches rendering errors and reports them back

### 4.6 Frontend Components

#### CanvasPane

**Create file:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/canvas/CanvasPane.tsx`

Main container component for the canvas feature:
- Integrates with the existing Chat page layout as a resizable right panel (replacing or augmenting the current `rightPanel` state in Chat.tsx)
- Shows the latest artifact or user-selected artifact from history
- Only renders when at least one artifact exists in the conversation AND the canvas feature flag is enabled
- Contains a header with artifact title, type badge, version selector, and close button
- The resizable split is achieved using a CSS-based drag handle or a library like `react-resizable-panels`

**Modify file:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Chat.tsx`

Add `"canvas"` to the `RightPanel` union type. When a canvas artifact is selected, set `rightPanel = "canvas"` and render `<CanvasPane>` in the right panel slot. The existing `ArtifactPanel` continues to work for the `"artifacts"` panel type.

#### Per-Type Renderers

**Create directory:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/canvas/renderers/`

Each renderer is a React component that accepts `{ content: string; language?: string; metadata?: Record<string, unknown> }` props.

- **`CodeRenderer.tsx`** -- Syntax highlighting with copy button. Reuse the existing `CodeArtifact.tsx` component or extend it with line numbers and a download button.
- **`ChartRenderer.tsx`** -- Parses JSON content and renders a Recharts visualization. The JSON structure should describe the chart type (bar, line, pie, area) and data series. Falls back to raw JSON display on parse error.
- **`MermaidRenderer.tsx`** -- Renders Mermaid diagrams. Uses `mermaid.render()` to produce SVG from the Mermaid text content. Wraps in an error boundary for malformed diagrams.
- **`TableRenderer.tsx`** -- Renders structured data as a sortable, filterable table. Parses JSON or CSV content. Uses existing Radix table primitives or TanStack Table.
- **`MarkdownRenderer.tsx`** -- Rich markdown rendering with LaTeX support. Wraps the existing `SafeMarkdown` component.
- **`SvgRenderer.tsx`** -- SVG viewer with zoom/pan. Sanitizes SVG content via DOMPurify before rendering.

Each renderer should have a consistent loading state and error boundary.

#### ArtifactSandbox

**Create file:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/canvas/ArtifactSandbox.tsx`

For `react` and `html` artifact types that contain untrusted executable code:

- Creates an `<iframe>` with `sandbox="allow-scripts allow-forms"` attributes
  - Explicitly NO `allow-same-origin` -- this is critical for security
  - Explicitly NO `allow-top-navigation` -- prevents navigation attacks
- Points `src` to `https://sandbox.smartaihub.app/sandbox.html` or uses a `blob:` URL as fallback for development
- Communicates via `window.postMessage` with strict origin validation on both sides:
  - Parent sends: `{ type: "render", artifactType, content }` to the iframe
  - Sandbox reports back: `{ type: "rendered", height }` or `{ type: "error", message }`
- The parent validates `event.origin === "https://sandbox.smartaihub.app"` before processing any messages from the iframe
- Handles the case where the sandbox domain is unavailable gracefully (show a "Cannot render interactive content" message)

#### Artifact Chips in Chat Messages

**Modify file:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/ChatView.tsx`

Below each AI message that contains artifacts, render clickable badge chips:
- Format: `[icon] [Title]` (e.g., `[chart icon] Sales Chart`, `[code icon] My Script`)
- Icon mapping: chart -> BarChart3, table -> Table2, code -> Code2, markdown -> FileText, react -> Component, html -> Globe, mermaid -> GitBranch, svg -> Image
- On click: set `rightPanel = "canvas"` and select the corresponding artifact in the `CanvasPane`
- This integrates with the existing inline artifact cards (lines ~2163-2181 of ChatView.tsx) -- either replace them with the new chips or augment the existing cards with a "Open in Canvas" action

### Integration with Existing Artifact System

The current codebase already has:

1. **`LLMArtifactViewer.tsx`** -- A fullscreen viewer that parses `<artifact>` XML tags and renders them. This continues to work as-is for backward compatibility.
2. **`ArtifactPanel.tsx`** -- A right-panel viewer for `messages.artifacts` JSONB data. This also continues to work.
3. **`parseArtifacts()` in LLMArtifactViewer.tsx** -- Client-side parser for XML-format artifacts. This is NOT replaced; the new server-side `artifactParser.ts` uses a different format (code fences).

The new canvas system runs alongside these existing components. When the canvas feature flag is enabled:
- The LLM is instructed (via `buildChatContext`) to use the code fence format
- The server-side parser processes artifacts before storage
- Versioned artifacts are stored in the `conversationArtifacts` table
- The `CanvasPane` provides a richer editing/versioning experience

When the canvas feature flag is disabled, the existing artifact system works unchanged.

### Existing Schema Context

The `messages.artifacts` column is already defined in the schema at `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` (line 1223):

```typescript
artifacts: json("artifacts").$type<Array<{
  id: string;
  type: "code" | "markdown" | "image" | "video" | "pdf" | "file" | "slideshow" | "chart" | "table";
  title?: string;
  content: string | string[];
  language?: string;
  metadata?: Record<string, any>;
}>>().default([]),
```

The type union needs to be extended to include the new artifact types: `"mermaid" | "svg" | "react" | "html"`. Update both the TypeScript type and the Zod schema (`artifactSchema` at line 202 of `chat.ts`).

The `conversationArtifacts` table is created by section-01-database with the following artifact type CHECK: `('code', 'react', 'chart', 'table', 'mermaid', 'html', 'markdown', 'svg')`.

The existing `conversations` table (line 1121 of schema.ts) does NOT yet have a `tenantId` column -- that is added by section-01-database. The artifact tRPC endpoints must account for this column being present after migration.

## File Summary

| Action | File Path |
|--------|-----------|
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/server/services/artifactParser.ts` |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/server/services/artifactStorageService.ts` |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/server/routers/artifact.ts` |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/artifactParser.test.ts` |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/artifactStorage.test.ts` |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/artifact.test.ts` |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/canvas/CanvasPane.tsx` |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/canvas/ArtifactSandbox.tsx` |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/canvas/renderers/CodeRenderer.tsx` |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/canvas/renderers/ChartRenderer.tsx` |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/canvas/renderers/MermaidRenderer.tsx` |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/canvas/renderers/TableRenderer.tsx` |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/canvas/renderers/MarkdownRenderer.tsx` |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/canvas/renderers/SvgRenderer.tsx` |
| **Create** | `/home/dev/projects/SmartSpecPro/apps/web/public/sandbox.html` |
| **Create** | `/home/dev/projects/SmartSpecPro/nginx/conf.d/sandbox.conf` |
| **Modify** | `/home/dev/projects/SmartSpecPro/apps/web/server/services/chatService.ts` -- inject artifact format instruction in `buildChatContext()` |
| **Modify** | `/home/dev/projects/SmartSpecPro/apps/web/server/routers/chat.ts` -- extend `artifactSchema` Zod type with new types |
| **Modify** | `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` -- extend `messages.artifacts` type union |
| **Modify** | `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` (or router merge point) -- register `artifactRouter` |
| **Modify** | `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Chat.tsx` -- add `"canvas"` to `RightPanel`, render `CanvasPane` |
| **Modify** | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/ChatView.tsx` -- add artifact chips below AI messages |

## Implementation Order

1. Write all test files (4.1, 4.2, 4.3 tests)
2. Implement `artifactParser.ts` -- make parser tests pass
3. Implement `artifactStorageService.ts` -- make storage tests pass
4. Create `artifact.ts` tRPC router and register it -- make endpoint tests pass
5. Modify `chatService.ts` `buildChatContext()` for artifact format injection
6. Integrate artifact parsing/storage into the message creation flow in chatService
7. Extend schema types (Zod + Drizzle) for new artifact types
8. Create frontend renderers (CodeRenderer, ChartRenderer, etc.)
9. Create `ArtifactSandbox.tsx` for interactive types
10. Create `CanvasPane.tsx` and integrate into Chat page
11. Add artifact chips to ChatView message rendering
12. Configure Nginx sandbox domain and create `sandbox.html`