# Browser Provider Adapter, Run Continuity and Human Handoff

## Native Rust and Cloudflare boundary

Moli is implemented in Rust, but that does not make it suitable for bundling in a Cloudflare Worker. Run it as an isolated native executor on Debian/Runner or suitable compute, with the same job authority. Chromium/Playwright may use Debian or managed Cloudflare Browser Run. Each is an **optional** capability and publishes observed features at runtime. Selection policy uses capabilities, app requirements, cost, reliability and data location—not branding.

## Session vs Job

| Object | Lifetime | Source of truth |
|---|---|---|
| `jobId` | Durable through disconnection and worker restart | PostgreSQL existing `worker_jobs` |
| `browserSessionId` | Ephemeral; may end due to idle/resource/provider limits | Browser provider, with bounded metadata in job |
| `artifactId` | Durable, immutable versions | Existing artifact metadata + R2 pointer |
| `browserViewGrant` | Short lived, revocable | Core authenticated control plane |

Closing user Chat must not cancel a job. Browser active session may expire; resuming requires a new session and safe re-navigation. External form submit or purchase is never automatically repeated without checking actual outcome; use explicit `OUTCOME_UNKNOWN` if needed.

## Per-provider capabilities

```ts
interface BrowserSessionProvider {
  discover(): Promise<{ providerId: string; version: string; capabilities: string[] }>;
  acquire(input: {jobId: string; tenantId: string; actorId: string; profileId?: string; budgetRef: string}): Promise<{ sessionId: string }>;
  navigate(sessionId: string, url: string): Promise<unknown>;
  act(sessionId: string, action: unknown): Promise<unknown>;
  inspect(sessionId: string): Promise<unknown>;
  screenshot(sessionId: string): Promise<{ artifactId: string }>;
  liveView(sessionId: string): Promise<{ viewGrantRef: string; expiresAt: string } | { unavailable: string }>;
  handoffToHuman(sessionId: string, actorId: string): Promise<{ handoffId: string } | { unavailable: string }>;
  checkpoint(sessionId: string): Promise<{ progressRef: string }>;
  close(sessionId: string): Promise<void>;
}
```

`viewGrantRef` is resolved server-side; never put raw CDP or Cloudflare signed viewer tokens into persistent chat text. Whitelist/inspect navigation URLs to prevent SSRF, private-network access and cross-tenant credentials. Agent tools should consume structured DOM evidence before screenshots where practical but MUST fall back when observed compatibility fails.

## Safe user handoff

1. Agent/browser task reports `NEEDS_HUMAN` and a concise reason (MFA, CAPTCHA, confirm purchase, unfamiliar flow).
2. Authenticated owner opens a time-limited, scoped Live View; the session is paused or otherwise coordinated with agent to avoid competing input.
3. User finishes the step; system receives real completion/error signal, revokes remote control and resumes executor on the same job.
4. If unavailable, user can open the verified URL in their own browser but must complete login independently. Resulting external state is reconciled via reliable external receipt or callback, never assumed.

## Deployment preference

First pilot: Chromium/Playwright with Debian currently available; use Cloudflare Browser Run for managed sessions when remote view/handoff and cost fit. Moli is evaluated on an isolated set of DOM-heavy tasks and never blocks Chromium UAT. Browser runtime code must not be included in Hono Core worker bundles.

## Sources

- https://github.com/lexmount/moli
- https://developers.cloudflare.com/browser-run/
- https://developers.cloudflare.com/browser-run/features/live-view/
- https://developers.cloudflare.com/browser-run/features/human-in-the-loop/

## R1.3 clarification — Headless-first does not mean Moli is production-ready

SPEC-208 revision 9 documents unresolved Moli production Runner isolation and security findings. Hence **Chromium remains the compatible qualified route**; Moli is eligible only after verified isolation and protocol tests. Kitesurf is a Cloudflare stateless beta headless alternative with no Live View or persistent sessions; its WebMCP permission/origin controls are incomplete, so forbid high-impact actions on that path. Clef is a typed decision model, not a browser. See `COMPUTER-USE-CLEF-BROWSER-ROUTING-ADR.md`.
