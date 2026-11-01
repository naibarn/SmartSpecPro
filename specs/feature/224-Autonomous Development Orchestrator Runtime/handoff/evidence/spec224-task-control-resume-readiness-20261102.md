# SPEC-224 Task Control Resume Readiness UI

- Observed at: 2026-11-01T17:56:05Z
- Source SHA: `0e9a0f128afb1bb4d3ff25f6f07f564056770189`
- Status: `PARTIAL`

## Change and focused verification

Task Control now explains that an existing DevelopmentRun cannot resume until the tenant's internal run-budget ledger is configured. The inline admin action provisions/configures the system pair; it explicitly states this does not add or deduct user credits. After the query observes the configured pair, the existing “ทำงานเดิมต่อ” action becomes enabled. It does not automatically dispatch the Run.

Focused tests passed: `pnpm exec vitest run client/src/components/chat/Spec224WorkspacePanel.test.tsx -t "offers automatic internal run-budget setup|shows the missing ledger setup beside an existing run"` (2 passed).

The complete `Spec224WorkspacePanel.test.tsx` file was also attempted on this SHA and remains non-green (14 passed, 21 failed, plus a JSDOM `scrollIntoView` unhandled error). This evidence does not attribute all failures to this change and does not claim full SPEC-224 acceptance.

## Development deployment

The exact source SHA was promoted to the authorized `legacy-debian-dev` target (`https://smartaihub.app`), not Cloudflare. Release ID: `smartspec-web-0e9a0f128afb1bb4d3ff25f6f07f564056770189-c5eebfc94ae7`; generation `307`; artifact digest `sha256:9266648333bb84205ea2a0c6ad68fbdfa9c1f089ed4453311be9f427a6b69758`. The release receipt is `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/development-deployments/smartspec-web-0e9a0f128afb1bb4d3ff25f6f07f564056770189-c5eebfc94ae7-307.json`.

Post-promotion verification reported `smartspec-web.service` and `smartspec-node-worker.service` healthy at the exact source revision. `https://smartaihub.app/api/health` returned HTTP 200. The served `Spec224WorkspacePanel` chunk contained the new inline readiness explanation and automatic setup label.

This records a UI readiness improvement and development deployment only. No user Goal was resumed, no Runner execution/receipt was produced, and no user-credit settlement or end-to-end acceptance is claimed.
