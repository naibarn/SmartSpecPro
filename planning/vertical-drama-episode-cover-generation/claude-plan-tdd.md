# TDD Plan: Vertical Drama Episode Cover Generation

## Test strategy

Tests are written before or alongside each implementation slice. Pure contract tests must not import router/provider modules. Server tests use the existing Vertical Drama router fixtures and mock provider/task/credit boundaries; no live paid generation is allowed. UI tests reuse the page's established test harness when available.

## Section 1: contracts and migration

### Shared contract stubs

```ts
describe("episode cover prompt", () => {
  it("emits the exact approved Thai template without extra instructions", () => {});
  it("omits empty synopsis and plot-beat sections without inventing text", () => {});
  it("normalizes legacy/malformed JSONB safely", () => {});
});

describe("approved Start Frame selection", () => {
  it("uses only approved, resolvable candidates and caps output at four", () => {});
  it("prefers narrative relevance while preserving story order", () => {});
  it("uses a deterministic evenly-spaced fallback on ties", () => {});
});
```

The migration check is additive/idempotent; it must not rewrite existing episode JSONB or introduce an index.

## Section 2: server cover lifecycle

### Service/router stubs

```ts
describe("generateEpisodeCover", () => {
  it("rejects a foreign series or episode", () => {});
  it("rebuilds prompt and references from current server data", () => {});
  it("rejects a stale/unsupported model before credit reservation", () => {});
  it("persists one generating task with idempotency metadata", () => {});
  it("returns the same task for an idempotent replay", () => {});
  it("does not submit or reserve twice for a different duplicate while pending", () => {});
});

describe("getEpisodeCoverStatus", () => {
  it("leaves pending tasks pending", () => {});
  it("imports and finalizes a completed result exactly once", () => {});
  it("persists a bounded failed state for failed or invalid results", () => {});
  it("ignores stale completion after upload or newer generation", () => {});
});

describe("setEpisodeCoverAsset", () => {
  it("accepts only an owned image asset", () => {});
  it("makes upload authoritative over an older generated task", () => {});
  it("does not mutate Start Frame or compiled-video fields", () => {});
});
```

## Section 3: list projection

```ts
describe("verticalDramaSeries.get cover projection", () => {
  it("returns a safe cover summary and no raw prompt/task payload", () => {});
  it("uses null cover URL when the asset is missing or unowned", () => {});
  it("preserves the existing Start Frame thumbnail fallback", () => {});
});
```

## Section 4: Episodes-tab UI

```tsx
describe("Episode cover controls", () => {
  it("remembers a valid model per series and clears a stale preference", () => {});
  it("renders no-cover, generating, ready, failed, and read-only states", () => {});
  it("polls only pending episodes and stops after terminal state/unmount", () => {});
  it("opens the lightbox and supplies the generated/uploaded URL to download", () => {});
  it("keeps the old cover after a failed upload and supports keyboard file selection", () => {});
  it("does not nest cover actions inside episode navigation", () => {});
});
```

If no stable page fixture exists, keep these assertions at the component/pure-helper level and document the browser-harness limitation in the validation report.

## Section 5: focused verification

Run the new shared/service/router tests, the nearest projection/UI tests, `git diff --check`, and the web TypeScript check. Treat unrelated dirty-worktree failures as baseline evidence, not as a reason to broaden this feature's patch.
