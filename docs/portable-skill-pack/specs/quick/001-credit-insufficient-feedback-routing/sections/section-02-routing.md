# Section 02: Server Routing

Ownership: auto-report, tRPC hook, media-job helper, and admin priority preservation.

Targets: `systemAutoReportService.ts`, `_core/index.ts`, `routers/mediaJobs.ts`, `virtualAdmin/feedbackProcessor.ts`.

Use the classifier before ticket creation. Ordinary user failures notify the owner only; suspicious/provider failures use existing ticket storage and admin fan-out with the correct priority. Keep tenant scoping, deduplication, and best-effort behavior.

Acceptance: no ordinary user-credit ticket/admin notification; suspicious/provider escalation has expected priority and metadata.
