# Code Review: Section 15 — Security Checklist, Resource Optimization, Nginx Configuration

## HIGH

### 1. redisSemaphore.ts: Non-atomic INCR+EXPIRE race condition
INCR and EXPIRE are two separate Redis round-trips. A process crash between incr() returning 1 and expire() completing leaves the key with no TTL — permanently stuck. Fix: use a Lua script to atomically combine INCR and EXPIRE.

### 2. redisSemaphore.ts: DECR on TTL-expired key silently corrupts counter
When a session runs to full TTL duration and Redis deletes the key, release() calls decr() which creates the key at -1. Next incr() moves to 0 then 1, triggers EXPIRE, and silently resets — potentially granting an extra concurrent slot.

### 3. redisSemaphore.ts: Multi-slot keys give later acquirers truncated TTL
Only first acquisition calls EXPIRE. A second slot acquired at T=250s of a 300s TTL key gets only 50s of crash-recovery protection. When key expires, release() decrements a deleted key (creating -1).

### 4. nginx: Voice WebSocket routing bug in port-80 server block
/api/voice/stream was added AFTER /api/ in the port-80 block. Nginx prefix matching picks /api/ first, routing voice WebSocket requests to Python backend (:8000) instead of Node.js (:3000). Voice works over HTTPS (port-443 block correct) but fails over HTTP.

### 5. securityChecklist.test.ts: Three security tests are expect(true).toBe(true) placeholders
Lines 92-119 unconditionally pass. Should be `it.todo()` so CI marks them pending rather than passing green, clearly signaling they require manual verification.

### 6. securityChecklist.test.ts: HMAC static assertion tests nothing
Verifies only `typeof crypto.timingSafeEqual === 'function'` — always true. None of the six adapter files the plan required auditing are inspected. A regression to === string comparison would not be caught.

## MEDIUM

### 7. nginx: X-Frame-Options ALLOW-FROM is dead in modern browsers
Chrome dropped ALLOW-FROM in v40 (2015), Firefox in v70 (2019). Browsers silently ignore it. CSP frame-ancestors already enforces framing. Should be removed or replaced with SAMEORIGIN/DENY (not applicable for sandbox) or just rely on CSP.

### 8. nginx: /widget/v1/ blocks missing proxy_http_version 1.1 and X-Forwarded-Proto
Both port-80 and port-443 /widget/v1/ location blocks omit proxy_http_version 1.1 and proxy_set_header X-Forwarded-Proto $scheme. Without X-Forwarded-Proto the widget init endpoint cannot determine HTTPS context for Secure cookie enforcement.

### 9. resourceLimits.test.ts: Missing test for incr succeeds + expire throws
No test covers partial failure where incr() returns 1 and expire() throws — slot acquired with no TTL safety net.

### 10. nginxConfig.test.ts: Timeout assertions validate only first server block
config.match() returns first occurrence only. If port-443 block were missing proxy_read_timeout 300s the test would pass.

## LOW

### 11. Placeholders in securityChecklist should use it.todo()
The placeholder tests with `expect(true).toBe(true)` give false confidence. `it.todo()` is more honest.

### 12. Part A security verification pass not evidenced
Plan Part A requires documented verification of 5 hard requirements across sections (no auth_type=none, no template engines, RBAC in agency_call_tool.py, no executeScript in browser_tool.py, voice one-time token). No evidence of this cross-section audit.
