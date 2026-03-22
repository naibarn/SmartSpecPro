# Feature 048: Interview Transcript

## Q1: User API keys in sessionStorage — are they actively used?
**Answer:** UI exists but is NOT active yet. The backend does not currently use user-provided keys for LLM calls — only admin-configured provider keys are used.

**Implications:**
- Phase 2 (API key migration) is lower urgency since no production data at risk
- Can design the encrypted storage cleanly without backward compatibility concerns
- No migration of existing sessionStorage keys needed (none in production use)

## Q2: Tauri desktop app — still in use?
**Answer:** Yes, actively used. Must preserve Tauri secure store compatibility.

**Implications:**
- Cannot simply delete all localStorage/Tauri code paths
- Must maintain `hasTauri()` branching in authService.ts
- Browser-only changes: remove localStorage fallback but keep Tauri secure store path
- Desktop app needs Bearer token since it cannot use httpOnly cookies across webview boundary

## Q3: Deploy strategy — separate phases or together?
**Answer:** Separate phases. Phase 1 (localStorage JWT removal) first.

**Implications:**
- Phase 1 can be a small, focused PR
- Phase 2 (DB encrypted storage) ships independently later
- Reduces risk — each phase can be validated separately
- Phase 1 has no schema changes (no migration needed)

## Q4: Backward compatibility for existing sessions?
**Answer:** Re-login is OK. Users can be required to log in again after deployment.

**Implications:**
- Can clear localStorage on startup without migration logic
- No need for dual-read (cookie + localStorage) transition period
- Simplifies implementation significantly
- Can add a simple cleanup function that runs once on app startup
