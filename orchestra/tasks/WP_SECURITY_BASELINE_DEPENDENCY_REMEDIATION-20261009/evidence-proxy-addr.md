# Critical `proxy-addr` remediation evidence

- Candidate SHA before change: `aae75ee4a18574fa67421a7688f28f7ce8adc715`.
- Dependency before: `express@4.22.2 -> proxy-addr@2.0.7`; advisory GHSA-jqcg-44mw-7w3h / CVE-2026-90711; patched release 2.0.8.
- Upstream fix commit: `jshttp/proxy-addr@780911d84d18e2c5fa008ed0c0d387631ec11965`; it canonicalizes IPv4-mapped candidates and rejects cross-family matching unless the prefix covers the mapped marker. This is within the existing `proxy-addr` 2.x dependency family and preserves the repository's Express 4.22.2 version.
- Repository change: narrow pnpm override `express>proxy-addr: 2.0.8`; lock resolution changes from 2.0.7 to 2.0.8 and keeps `forwarded@0.2.0`, `ipaddr.js@1.9.1` unchanged.
- Regression source: `apps/web/server/_core/__tests__/proxyAddrTrustRegression.test.ts`.
- Isolated compatibility command: temporary `/tmp/security-proxy-addr-2.0.8` install of Express 4.22.2, proxy-addr 2.0.8, and Supertest; direct checks covered short-prefix rejection, valid `/104` mapped trust, plain IPv4 trust, `::/1` rejection, Express spoofed XFF rejection under the bad subnet, and unchanged one-hop numeric trust. Result: 7 assertions PASS.
- `pnpm install --lockfile-only --ignore-scripts --no-frozen-lockfile`: PASS; resolved 1,823 lock entries; no repository dependency installation or scripts run.
- `pnpm audit --prod --json` before: exit 1, 85 total (1 Critical, 38 High, 37 Moderate, 9 Low).
- Same command after: exit 1, 84 total (0 Critical, 38 High, 37 Moderate, 9 Low). Exit 1 is expected because the remaining advisories still fail the mandatory gate.
- `git diff --check`: PASS. Repository Vitest and typecheck: NOT RUN locally; CI required. Local full typecheck remains prohibited by AGENTS.md.

Upstream advisory/fix links: [GitHub advisory GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [upstream patch commit](https://github.com/jshttp/proxy-addr/commit/780911d84d18e2c5fa008ed0c0d387631ec11965).
