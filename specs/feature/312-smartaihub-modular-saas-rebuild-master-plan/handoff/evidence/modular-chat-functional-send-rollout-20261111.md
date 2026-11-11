# SPEC-312 Chat rollout update — 2026-11-11

The modular Chat implementation advanced from model-catalog-only to a server-backed conversation path in `smartaihub-platform/main@824c2a3b1c247b675353c783e8979ede9aaaa488`. The Core API reads the existing provider configuration server-side, and scoped conversation/message functions use the canonical `smartspec` database records. No second identity, wallet, message or worker-job authority was introduced.

The additive development migration `0423_modular_chat_scoped_persistence` was applied to `smartspec`. Core, Shell and Chat exact-source builds plus Wrangler dry-runs passed. Chat tests (28), SaaS Core tests (85), and Core/Chat package typechecks passed. Full release details, package digests, health probes, limitations and remaining tests are recorded in [SPEC-317 Chat release evidence](../../../317-smartaihub-progressive-module-migration/handoff/evidence/modular-chat-functional-send-release-20261111.md).

The release controller returned `DEPLOYED_AND_VERIFIED` for `modular-debian-dev` / `https://aimarkethubs.com` at `2026-11-11T11:02:22.095199+00:00`. Public Shell and Chat health/manifest probes returned 200; unauthenticated Chat session returned 401. `smartaihub.app` was not changed, and production `smartsihub.com` remains inactive.

This is a scoped implementation/deployment checkpoint, not SPEC-312 acceptance. Human authenticated confirmation of a real provider response, persistence after reload, and desktop/tablet/mobile behavior remains open. Chat turn append also needs idempotent request handling before automatic retries; Agent/cloud execution and Browser Pilot remain unavailable until their approved runtime and canonical job contracts exist.
