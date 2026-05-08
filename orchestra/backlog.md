# Orchestra Backlog

1. Rotate/revoke exposed TLS private key and API-key-like values, then purge affected secrets and the removed SQL backup from git history with a coordinated secret-response plan.
2. Replace, sandbox, or isolate `xlsx`; npm audit reports a remaining high vulnerability and no fix is available.
3. Decide whether to force-upgrade `nodemailer` to the audit-recommended version or accept the moderate advisory after compatibility testing.
4. Replace direct Docker socket mounts with a least-privilege socket proxy or isolated/rootless daemon.
5. Harden production CSP by removing `unsafe-eval` and moving inline scripts/styles toward nonces/hashes.
6. Verify `/api/voice/session` auth middleware wiring before exposing the REST voice session route.
7. Replace reusable sample secrets in `.env.example` with generated placeholder guidance or required-env syntax.
8. Return generic external callback failure responses in `apps/web/server/routes/voiceAgentsElevenLabsCallback.ts`.
