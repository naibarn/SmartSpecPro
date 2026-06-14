# HyperFrames Render Platform Design

Date: 2026-06-13
Status: Approved direction

## Purpose

SmartSpecPro must stop growing a parallel custom video renderer for
HyperFrames-style output. The custom Playwright/FFmpeg smoke path has useful
diagnostic value, but it is not feature-complete enough for production creative
work such as text overlays, timed captions, transitions, audio/SFX, layout
inspection, and future HyperFrames capabilities.

The target architecture is a centralized HyperFrames Render Platform that uses
official HyperFrames runtimes for production rendering and keeps SmartSpecPro's
own code focused on product truth, prompt intake, composition generation,
tenant safety, storage, rollout gates, and provenance.

## Product Decision

Production HyperFrames output must be rendered by an official HyperFrames
runtime:

- HyperFrames CLI for compatibility-first worker execution, diagnostics,
  fixture renders, and local/development parity.
- `@hyperframes/producer` or producer server for programmatic production control
  when the worker image, dependency audit, and rollout gates pass.

SmartSpecPro must not implement a production-equivalent renderer by recreating
HyperFrames behavior with bespoke Playwright, browser seeking, FFmpeg filters,
ASS overlays, or template-specific render code. Such code is allowed only for
health checks, fixture smoke tests, blocked-state diagnostics, and explicit
break-glass fallback when no user-facing feature is claimed as complete.

## Architecture

```text
SmartSpecPro Web / tRPC
  -> HyperFrames Render API
  -> Prompt-to-Composition Builder
  -> Asset Staging + Policy Validation
  -> Official HyperFrames Runtime Worker
       - CLI path: lint / inspect / snapshot / render
       - Producer path: createRenderJob / executeRenderJob or producer server
  -> Artifact Storage
  -> Version + Compatibility Registry
  -> Media Library / Storyboard Review / Media History
```

## Prompt-To-Composition Contract

User customization, including text overlays, captions, CTA, style, timing,
music, SFX, and aspect ratio, must become a HyperFrames composition project
rather than ad hoc render instructions.

The composition bundle must include:

- `index.html` with HyperFrames timing attributes and registered timelines;
- staged local assets;
- manifest with product/run/storyboard provenance;
- prompt/customization input, sanitized and redacted as needed;
- `frame.md` or equivalent SmartSpecPro video design guidance when applicable;
- runtime profile, template version, and content hashes.

Storyboard Review final composite UX must expose the exact HyperFrames render
brief/prompt before final render. Users must be able to edit the style brief,
hook text, per-shot overlay text, subtitle cues, audio presets, and source-shot
selection before the official HyperFrames render job is created. The visible
payload preview must be derived from the same state used to build
`HyperframesFinalCompositeConfig`; do not maintain a separate mock prompt path.

Render workers receive a composition directory and render configuration. They
do not receive arbitrary trusted HTML, marketplace HTML, raw signed URLs, or
unvalidated user JavaScript.

## Version Management

The platform owns one authoritative runtime compatibility registry. Each render
job must record:

- HyperFrames CLI version;
- `@hyperframes/*` package versions when used;
- Node version;
- Chrome/headless-shell version;
- FFmpeg/FFprobe versions;
- font/runtime profile hash;
- worker image digest or build id;
- template id/version/content hash;
- composition input hash and manifest hash.

Package versions must be pinned. Floating `latest` is allowed only in a
read-only update-detection job that opens a review artifact or PR; it must not
change production render behavior directly.

## Maintenance And Update Pipeline

When HyperFrames updates upstream, SmartSpecPro should run a controlled
compatibility pipeline:

1. Detect GitHub/npm release and compare with pinned runtime registry.
2. Produce an update report with package versions, changelog links, dependency
   changes, postinstall/native behavior, and expected feature impact.
3. Open a dependency/update PR or internal review artifact.
4. Run dependency audit and doctor.
5. Render the compatibility fixture suite with old and candidate official
   runtimes. Fixture manifests must include `officialRuntime: true`, pinned
   package versions, Node version, staged font evidence, playable MP4 probe, and
   `renderer` set to `hyperframes_cli_official` or
   `hyperframes_producer_official`.
6. Compare golden snapshots, playable MP4 probes, manifest hashes, duration,
   audio, Thai text, safe areas, CTA overlays, captions, and error rate.
7. Run seeded route E2E and Library/Media History handoff checks.
8. Promote to canary only after gates pass.
9. Promote to default only after canary metrics pass.
10. Keep rollback to the previous pinned runtime available.

## Compatibility Fixture Suite

The minimum fixture suite must cover:

- product intro with title overlay;
- long Thai product name and Thai subtitles;
- TikTok/Reels 9:16 safe areas;
- CTA and disclosure text;
- evidence-bound price/rating/spec copy;
- multi-scene transitions;
- generated clip plus overlay/caption composition;
- music and SFX;
- source audio preservation;
- high-contrast and reduced-motion variants;
- text overflow and clipped-container inspection.

## Rollout Modes

Runtime mode names should reflect production readiness:

- `official_runtime_blocked`: no user-facing HyperFrames render should be
  marked complete; only contracts, queue state, diagnostics, and disabled UI are
  allowed.
- `official_cli_ready`: dedicated worker can render with the HyperFrames CLI.
- `official_producer_ready`: dedicated worker can render with
  `@hyperframes/producer` or producer server.
- `canary`: a newer official runtime is allowed only for selected tenants/jobs.
- `rollback`: new jobs use the previous pinned official runtime while existing
  artifacts remain readable.

Older labels such as `smoke_only` may remain in legacy migrations or tests, but
new implementation and user-facing copy must not treat smoke output as a
feature-complete render mode.

## Non-Goals

- Do not build a hosted prompt-to-video clone of HyperFrames.
- Do not send marketplace credentials or arbitrary marketplace HTML to a render
  worker.
- Do not expose raw composition HTML, signed URLs, private storage keys, or full
  worker logs to normal users.
- Do not use UI-local state as the source of truth for render identity,
  selected media, captions, or final output links.

## Implementation Guardrails

- All production render paths must call official HyperFrames CLI/producer
  commands or APIs.
- The web/client bundle must not import `@hyperframes/*` runtime packages.
- Custom FFmpeg/Playwright paths must be named and reported as diagnostics or
  fallback, not as successful full HyperFrames production renders.
- Every feature that requires official runtime support must fail before credit
  reservation or queueing when runtime capability is blocked.
- Specs, section plans, tests, and docs must be updated together whenever the
  runtime direction changes.
