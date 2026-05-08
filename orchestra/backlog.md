# Orchestra Backlog

1. Rotate/revoke exposed TLS private key and API-key-like values, then remove `nginx/ssl/smartaihub.app.key` and `smartspecpro_backup.sql` from the repository and git history with a coordinated secret-response plan.
2. Upgrade vulnerable Node dependencies and lockfiles; prioritize `protobufjs`, `@aws-sdk/*`, `axios`, `multer`, `drizzle-orm`, and replace/isolate `xlsx` because audit reported no fix.
3. Make Kie webhook/callback endpoints fail closed when `KIE_AI_WEBHOOK_SECRET` is missing outside local dev.
4. Disable automatic redirect following for provider media downloads and re-validate every redirect target.
5. Pin third-party GitHub Actions to commit SHAs.
6. Replace direct Docker socket mounts with a least-privilege socket proxy or isolated/rootless daemon.
7. Redact media callback logs and raw webhook payload retention.
8. Harden production CSP by removing `unsafe-eval` and moving inline scripts/styles toward nonces/hashes.
9. Verify `/api/voice/session` auth middleware wiring and add per-user rate limiting to voice-agent session material endpoints.
