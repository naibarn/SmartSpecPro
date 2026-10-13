# UI Browser Verification

Browser review is valuable **after a development build is available**. It is not a universal prerequisite for merging ordinary UI/UX code into the protected development branch unless an actual repository-required check mandates it.

Test the authorized development URL, authenticated tenant and primary user flow when they exist. Check relevant mobile/tablet/desktop layouts and interaction states; collect screenshots and console errors only where they help diagnose or demonstrate behavior. Use existing browser tooling or a remote authorized browser; do not assume a browser on another machine shares Debian `localhost`.

If browser execution is not available, mark the result `NOT_RUN` and continue independent implementation and integration. Do not claim UAT passed. Record the route, build/runtime SHA, observed behavior, unfinished UI gaps and retest action in the existing HandOff.

## SmartAIHub authenticated development UAT

When working on SmartAIHub UI, auth, tenant permissions, Mini Apps, or Gateway
integration, run the existing authenticated UAT profile as part of development
verification. Direct Codex over SSH is supported; Runner provisioning is not a
prerequisite. From `apps/web`, run `npm run test:uat` against the approved
development tunnel. The browser origin must remain `https://smartaihub.app` and
the test setup must verify TLS and the configured Cloudflare Tunnel targets
before issuing a synthetic `.invalid` test identity.

The local-only session broker must use the existing session signing and
revocation code, a verified local development database, and isolated UAT
tenants. Never expose it as an application route or enable it in a deployed
production runtime. Tests must fail closed when the tunnel, database scope,
tenant authorization, or Gateway setup cannot be verified. The browser may call
SmartAIHub's authorized Gateway endpoints; provider credentials and provider
API requests remain server-side behind that Gateway.

Run focused functional navigation and tenant-boundary checks first. Run the
real Gateway/provider test only when the development Gateway has an authorized
synthetic identity, bounded credits, and test-safe provider configuration. The
fixture renews a short-lived session per test, captures and scrubs Playwright
trace evidence, screenshot, console and network details, and revokes the session
afterward. Record Functional UAT and Gateway Integration UAT separately; a
skipped or unavailable provider call is not a Gateway pass.
