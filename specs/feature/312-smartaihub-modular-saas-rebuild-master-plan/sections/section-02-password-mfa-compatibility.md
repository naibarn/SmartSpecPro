# Section 02 — Existing password and MFA compatibility

## Objective and requirement mapping

Verify the password and MFA values already stored for SmartAIHub accounts without changing, cloning or weakening them. Complete authentication only after required MFA succeeds.

**Canonical requirement:** `REQ-46847581892C` (partial implementation evidence only).

## Owned scope

Write scope in `smartaihub-platform/apps/saas-core`:

- `src/identity/password.ts`
- `src/identity/totp.ts`
- `src/identity/accountAuthentication.ts`
- associated focused tests and required Core dependency/lock changes.

Do not import Legacy server packages or `apps/web` code.

## Contracts

- Normalize email by trim + lowercase only; do not strip Gmail dots or plus tags. Verify bcrypt and Argon2 `i`/`d`/`id` formats with bounded, Worker-compatible verification. Accept bcrypt costs 4–16 and Argon2 PHC version 19 with m≤65536 KiB, t≤6 and p≤4. Keep one verification in flight per isolate and at most 8 queued waiters; fail closed on overflow. Keep original password hashes unchanged.
- Unknown email and wrong password have the same public response and run a fixed dummy verification. Reject passwordless/OAuth-only and disabled accounts; never create, sync or promote an account.
- Match the existing TOTP contract: AES-256-GCM encrypted secret at rest, hex `iv:authTag:ciphertext`, SHA-256-derived key from the narrow canonical account-data key, base32 secret, six digits, 30-second period and ±1-step tolerance. Reject malformed or legacy CBC data.
- Verify stored bcrypt recovery hashes and consume a successful recovery code exactly once through section 01's transaction boundary.
- A 2FA-enabled account gets a short-lived challenge; no session is issued until a valid TOTP or unused recovery code completes it.
- The shared TOTP decryption key is distinct from per-environment session keys and the DB role. Keep it out of the repository and logs.

## Prerequisites

Section 01's typed repository and account DTO must expose only fields needed for auth. Validate `hash-wasm` against synthetic bcrypt/Argon2 fixtures and target Worker bundling before accepting it. Bound Argon2 PHC parameters to safe Worker limits; if authentic stored hashes exceed verified limits or use another PHC version, fail closed and record the specific compatibility gap rather than skipping MFA or inspecting user rows.

## Acceptance and verification

- Bcrypt, Argon2 and bcrypt recovery fixtures pass known positive/negative vectors; unsupported parameter bounds reject before invoking WASM and concurrency limits hold under contention.
- TOTP matches legacy RFC-compatible vectors and accepts only the configured time window.
- AES-GCM decrypt matches a synthetic legacy ciphertext; altered tag/key, malformed format and CBC fail closed.
- Disabled/passwordless users never authenticate. MFA cannot be bypassed; concurrent recovery redemption consumes at most once.
- Tests and errors contain no real hash, password, submitted OTP, recovery code, decrypted TOTP secret or key.
- Local workerd is not Cloudflare CPU-limit evidence; future Cloudflare production auth requires a Paid Workers CPU budget or independently measured equivalent.
- The actual stored hash algorithm/cost/version distribution and a real existing-user login remain unverified; synthetic fixtures do not close that acceptance gap.

## Exposure, fallback and rollback

No public endpoint until section 03. Unsupported/corrupt records deny access and remain unchanged. Rollback removes only Core verifier code/dependencies and leaves canonical authentication records intact.

## Out of scope

Registration, email/phone verification, password reset/change, OAuth exchange, legacy activity-credit policy, profile mutation and credential rehash.
