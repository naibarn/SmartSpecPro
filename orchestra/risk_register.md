# Risk Register
Last updated: 2026-05-08T07:31:23Z
Session: completeness and maximum-security review for current SmartAIHub changes
Verdict: PASS WITH EXTERNAL FOLLOW-UPS

## Findings

| ID | Severity | Category | File | Line | Description | Status |
|----|----------|----------|------|------|-------------|--------|
| R001 | HIGH | Dependency vulnerability | apps/web/package-lock.json | n/a | `xlsx` remains vulnerable to prototype pollution and ReDoS with no npm audit fix; the package is used in both server file parsing and client Excel viewing. | remediated: removed dependency/imports; XLSX parse/preview now disabled with download fallback |
| R002 | HIGH | Sensitive logging | apps/web/server/services/emailService.ts | 99 | Email verification flow logs recipient email and verification code to console. In production logs this can become account-verification bypass material. | remediated: production suppresses code logging; emails are masked |
| R003 | HIGH | TLS verification disabled | apps/web/server/services/emailService.ts | 87 | SMTP transporter sets `tls.rejectUnauthorized: false`, allowing MITM of SMTP connections when an attacker can intercept traffic. | remediated: TLS verification enabled by default; dev-only override gated by env |
| R004 | MEDIUM | Host header / canonical poisoning | apps/web/server/routers/publicSitemap.ts | 26 | Public sitemap/robots/llms base URL is derived from request Host / forwarded proto when tenant lookup is absent. Cloudflare rejected a spoofed production Host, but app-level canonical allowlisting would be safer. | remediated: fallback uses configured/canonical SmartAIHub URL |
| R005 | MEDIUM | Host header / canonical poisoning | apps/web/server/_core/vite.ts | 17 | Prerender canonical/OG URL generation can use request Host / forwarded proto; should prefer known tenant domain or trusted public base URL. | remediated: prerender base URL uses configured/canonical SmartAIHub URL, localhost only in dev |
| R006 | MEDIUM | CSP hardening | apps/web/server/_core/index.ts | 235 | Live production CSP includes `unsafe-inline` and `unsafe-eval`. Existing headers are otherwise strong, but highest-security posture needs nonce/hash-based scripts and removal of eval. | open |
| R007 | MEDIUM | SSRF redirect hardening | apps/web/server/routers/fileParseTool.ts | 57 | File parser validates the initial URL host and size-limits downloads, but `fetch()` may follow redirects without revalidating each redirect target. | remediated: manual redirect handling revalidates every hop |

## Positive Signals

- Bundled secret scanner scanned 12,339 files and reported no findings.
- Targeted high-risk pattern scan over changed files found no `eval`, `new Function`, raw `.innerHTML =`, unsafe query raw usage, command execution, weak hash usage, or browser token storage additions.
- Production Host header spoof probe using `Host: evil.example` returned Cloudflare 403.
- Targeted tests, TypeScript check, and production build passed.
- `npm audit --omit=dev` now reports `found 0 vulnerabilities`.
- Dashboard preview OG asset reduced from 5.4 MB to 1.1 MB; favicon is now an actual ICO resource.

## Verdict Rationale

No confirmed CRITICAL issue was found in the current changed files. High-priority repo-local findings were remediated. Remaining maximum-security work is CSP nonce/hash hardening and production/Cloudflare verification after deploy.

---

# Risk Register Addendum
Last updated: 2026-05-08T08:40:00Z
Session: skill maintenance apply failure implementation
Verdict: TARGETED PASS

## Findings

| ID | Severity | Category | File | Line | Description | Status |
|----|----------|----------|------|------|-------------|--------|
| R008 | MEDIUM | Path containment | apps/web/server/services/skillStudioService.ts | n/a | ISC JSON proposal application writes files from generated proposal content and therefore must reject absolute paths, traversal, empty paths, metadata proposals, and proposals outside the canonical proposal root. | remediated: basename proposal resolution, canonical proposal containment, relative path validation, and traversal tests added |
| R009 | MEDIUM | Runtime path pollution | apps/web/server/services/skillExecutor.ts | n/a | `intelligence-skill-creator` could inherit a copied workspace path as its runtime root, causing nested `/runs/workspaces/` paths and failed apply runs. | remediated: canonical root precedence and workspace artifact rejection added in TypeScript and Python runner paths |
| R010 | LOW | Historical run interpretation | apps/web/server/services/skillUpgradeApplier.ts | n/a | Existing no-patch/no-change ISC runs could be displayed as failures even when the skill completed successfully without proposal output. | remediated: no-change completion evidence now finalizes as completed no-change; workspace-root failures remain distinct diagnostics |

## Positive Signals

- Targeted proposal apply tests cover JSON discovery, safe writes, and traversal rejection.
- Admin diagnostics distinguish workspace-root pollution from no-change normalization candidates.
- TypeScript check and targeted impacted test suites passed.
