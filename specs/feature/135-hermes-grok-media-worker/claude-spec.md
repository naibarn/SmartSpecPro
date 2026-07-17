# Synthesized Spec: Feature 135 Hermes Grok Media Worker

Date: 2026-07-16
Mode: deep-plan synthesis
Source files: `spec.md` (v1.4 — normative, 4 review passes), `claude-research.md`, `claude-interview.md`

> `spec.md` v1.4 is the authoritative requirements document (1,400+ lines,
> codebase-verified). This synthesis records the deltas that research and
> the interview added on top of it, plus a condensed objective/scope for
> plan writers. Where this file and spec.md disagree, spec.md wins except
> for the four interview decisions below, which refine spec.md's
> configurable defaults.

## Objective

Let SmartSpecPro users generate images and videos with their Grok
subscription (SuperGrok / X Premium+) by driving the pinned Hermes Agent
CLI as a controlled worker process. Ship it as a third media transport
(`hermes_worker`) selectable in the normal media model picker next to
gateway and MCP models, integrated into every Vertical Drama generation
surface (10 resolvers + 2 fail-closed remediations), running in two
deployment modes: a shared server worker (separate systemd unit on the
existing production host) and a private worker inside the Smart AI Hub
Worker App (Windows first, macOS next).

## Primary User Value

- Spend an existing Grok subscription instead of platform credits for
  image/video generation.
- Zero CLI/OAuth-token handling: connect via official xAI device-code
  pages; results land in the Library automatically with full lineage.
- Works everywhere models are picked today — Drama Series panels, Media
  Studio — with honest capability gating.

## Interview Decisions (refine spec.md defaults)

1. **Fee policy:** platform fee applies to `server_shared` pool jobs only
   (admin-configurable amount); `server_personal` and `private_worker`
   jobs charge 0 credits. Fee reserve/reconcile via workerBillingService
   is therefore a launch path, exercised only for shared-pool jobs.
2. **Both server scopes are launch-blocking:** `server_personal` AND
   `server_shared` must both work in V1 production validation (neither is
   deferrable), each behind its own flag.
3. **Deployment:** shared worker runs on the existing production host as
   `smartspec-hermes-worker.service` with MemoryMax/CPUQuota — no new
   infrastructure.
4. **Worker App order:** Windows first, macOS second, same feature.

## Research-Locked Technical Decisions (from claude-research.md)

- Pin `hermes-agent==0.18.2` (PyPI, Python 3.11 via uv venv); never
  self-update in production.
- Isolation: native Hermes profiles (`-p conn_<connectionId>`) rooted in a
  worker-owned `HERMES_HOME`; invocation via `hermes -z` +
  `--ignore-user-config` + argv arrays.
- Output collection trust order: result-marker block → workspace scan →
  `MEDIA:<url>` tags → `$HERMES_HOME/cache/{images,videos}` scan.
- Media toolsets are opt-in AND credential-gated — the capability probe
  must authorize before checking tool availability; the documented
  403-entitlement-after-login case makes the entitlement probe mandatory.
- Namespace: `hermesMedia*` / `hermes_media_*` everywhere (the codebase
  already has an unrelated `queueHermesWorkerJob` agent-gateway lane).
- Templates to copy (file-level): `queueVerticalDramaFfmpegAssemblyJob` /
  `queueDesktopVideoAssemblyJob` (enqueue), `inlineRenderWorker` +
  `renderWorkerSettings` (tick loop + toggle), `userMcpConnections` +
  `mcpConnections` router + `McpConnectionPicker` (connections),
  `mcpMediaAdapter` (task projection + reconciler), Worker App
  `runtime_manifest`/`worker_executor` (desktop runtime module),
  `seed-media-models-mcp-providers.ts` (model seeding),
  `smartspec-web.service` (systemd unit).

## In Scope (phases 1–4 of spec.md §18, all committed)

1. Foundation: `hermes_provider_connections` (camelCase, migration run
   immediately), transport union + VD helper generalization,
   `hermesMediaScheduler`, admission control (per-connection semaphore=1,
   rate limits, queue caps, limit-coherence invariant), `media.getTask`
   `hermes_` branch + monitor/fee glue, shared worker unit + token
   provisioning, OAuth connect flow (both server scopes) + consent notice,
   capability probe, text-to-image, Library registration, admin UI.
2. Image surfaces: 1–3 ref edit + mapping validation; VD rows 1–8 + row 10
   ad-banner remediation; `HermesConnectionPicker` + panel wiring +
   per-episode/per-series model memory.
3. Video: t2v, i2v, long-job UX, ffprobe validation; VD `generateVideoClip`
   incl. `maxReferenceImages` trimming, `grok` formatter family, and the
   row-9 `resolveEpisodeVideoModel` fail-closed remediation.
4. Private worker: Worker App Hermes runtime module (Windows→macOS),
   private scope end-to-end, sequentially gated after 1–3 validate.

## Out of Scope For This Deep-Plan

- Reference-to-video (capability-gated, phase 5), the FULL quotas dashboard
  (history/charts — a minimal read-only quota view IS pulled forward into
  section-12 for shared-pool operability), canary Hermes upgrades, group
  sharing of `server_personal` connections, xAI API-key fallback adapter,
  audio/research/TTS operations, Prometheus exporter, claim-time pool
  rebalancing.

## Key Technical Constraints (top-of-mind for every section)

- Fail closed everywhere: flags off → disabled option + rejected submit;
  no silent fallback between transports/models/connections (single-pass
  connection resolution); the two VD silent-fallback remediations are part
  of this feature.
- Job `runtimeType` follows the assigned worker
  (`desktop_zeroclaw_managed` for Worker App, `hermes_agent_gateway` for
  the shared unit); hermes-ness = jobType + required claim capability
  (`HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY`, remotion precedent).
- References travel as assetId+sha256; presigned URLs minted at claim time
  + refresh endpoint; sha256 verified after download.
- Tokens live only in Hermes profiles on worker hosts; DB stores metadata
  only; ≤4 chars of any token in diagnostics.
- Effective capability = min(model row, connection manifest).
- Thai + English user-safe copy for all 22 error codes (spec §13.7).
- Every schema change completes its migration cycle immediately.

## Acceptance Summary

spec.md §20 acceptance criteria verbatim, highlighted: all 10 VD surfaces
work end-to-end with a Hermes model on both deployment modes; both
silent-fallback paths removed; shared pool limits reject excess load with
typed Thai/English errors while the web service stays healthy; private
jobs only claimable by the owner's worker; no OAuth token anywhere in
DB/logs/API/frontend; kie.ai "Grok Imagine" vs "Grok via Hermes" always
distinguishable; shared-pool jobs charge the admin-configured fee while
personal/private jobs charge zero.
