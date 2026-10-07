# SPEC-306 R2.2 — 70-PASS Audit & Delta

**Date:** 2026-10-07
**Result:** PASS

## Audit count
- R2.0: 30 passes
- R2.1: +20 passes
- R2.2: +20 passes
- **Cumulative: 70 passes**
- Structural validation: **70/70 PASS**

## New gaps closed in R2.2
1. Channel confidentiality/E2EE semantics.
2. Sensitive-result redaction/link/deny policy.
3. Google OAuth failure in unsupported embedded user-agents.
4. Secure one-time return route after channel-originated signup.
5. Identity-link conflict and explicit recovery.
6. Provider account production-readiness state.
7. Token/permission/deauthorization lifecycle.
8. Send-permission vs cost/free-window separation.
9. Ad click/conversation start vs marketing consent separation.
10. Deep-link/referral integrity and replay protection.
11. Telegram Mini App / LINE LIFF launch-context verification.
12. Quiet-hours timezone and DST semantics.
13. WhatsApp 3P Agent maturity gate.
14. WhatsApp 3P Agent age/privacy eligibility.
15. Channel-account business ownership and disaster recovery.
16. Tenant/provider messaging cost allocation.
17. Conversion-event idempotency and provider reconciliation.
18. Provider backpressure and per-tenant fairness.
19. Mainland-China production-readiness gate.
20. Market × provider release certification matrix.

## Important current-policy confirmations used
- WhatsApp Business Platform currently states service messages are not charged, utility responses to users are not charged, and eligible click-to-WhatsApp/Facebook CTA entry can create a 72-hour no-charge period.
- WhatsApp Business Solution Terms currently restrict general-purpose AI-provider use of the Business Solution except the stated regional exception.
- WhatsApp Third-Party Agent Terms are a distinct surface and explicitly state 3P Agent conversations are not equivalent to personal E2EE chats.
- Telegram currently supports OIDC login and documents bot initiation/broadcast constraints.
- LINE currently documents push eligibility including friend/group/recent-inbound cases and one-time 10-minute account-link tokens.
- Messenger currently documents the standard 24-hour recipient condition unless an applicable outside-window agreement exists.
- Instagram messaging currently requires an eligible Professional account and user-initiated messaging relationship.
- Google documents `disallowed_useragent` for unsupported embedded OAuth user-agents.

## Release posture
R2.2 is implementation-ready at specification level, but individual provider/market cells remain gated by live provider readiness and the new certification matrix.
