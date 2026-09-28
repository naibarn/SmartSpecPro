# Production-grade section index

| Section | Focus | Depends on | Exit signal |
|---|---|---|---|
| 01 | Redis reliability | — | delayed restore and `/readyz` proof |
| 02 | Worker operation manifest/adapters | 01 | claim matrix and adapter health proof |
| 03 | R2 resumable ingest | 01, 02 | single/multi upload resume proof |
| 04 | Tenant/revision durability | 01–03 | CAS and stale-result proof |
| 05 | Timeline/transform correctness | 04 | 20-track and keyframe fixtures |
| 06 | Heavy media adapters | 02, 04, 05 | per-operation staging proof |
| 07 | Render/export/QC | 02, 04–06 | Auto/manual/GPU/MP3/still proof |
| 08 | Browser UX/a11y/recording | 04–07 | responsive and device matrix |
| 09 | Security/credits/observability | 01–08 | audit and alert runbooks |
| 10 | Rollout and acceptance | 01–09 | canary, rollback and sign-off |

<!-- SECTION_MANIFEST
section-01-redis-reliability
section-02-worker-capability-adapters
section-03-r2-resumable-ingest
section-04-tenant-revision-durability
section-05-timeline-transform
section-06-heavy-adapters
section-07-render-export
section-08-browser-ux
section-09-security-observability
section-10-rollout-proof
END_MANIFEST -->
