# Interview Notes - Marketplace Capture Extension

The user explicitly asked to continue deep-plan and finish without waiting for further confirmation. No interactive interview was performed.

## Assumptions Locked For Planning

1. The product direction is accepted: hybrid user-assisted capture, not a crawler.
2. Shopee Thailand is MVP platform. TikTok Shop is a later adapter using the same contracts.
3. The Chrome extension must show a local review panel before upload:
   - extracted product fields can be edited locally
   - screenshots can be selected or discarded
   - image candidates can be selected, moved between main/description/excluded, reordered, and marked as cover
   - upload summary is shown before any evidence leaves the browser
4. SmartSpecPro web preview remains mandatory before final product save.
5. Existing `/marketplace` route is reserved for the skill marketplace; this feature uses `/marketplace-capture`.
6. Extension auth uses one-time pairing and revocable scoped tokens, not permanent API keys.
7. Extension REST routes are bearer-token routes with strict origin/CORS rules.
8. Backend remote image mirroring is disabled by default unless marketplace CDN allowlists and SSRF controls are configured.
9. Raw marketplace DOM/HTML/screenshots/images/LLM output are untrusted evidence and must be rendered as text/sandboxed evidence.
10. Implementation should be phased and TDD-oriented, with security tests as release blockers.

## Open Questions Deferred To Implementation

- Exact production SmartSpecPro domain and Chrome extension ID for allowlist env values.
- Whether remote marketplace images should be copied in MVP or left as original URLs until CDN allowlists are approved.
- Exact retention period for unconfirmed raw evidence in production; plan defaults to 30 days unless product/security chooses shorter.
- Whether marketplace capture products should later sync into an existing catalog/library model or remain standalone product intelligence records in MVP.

## Non-Negotiable Decisions

- No CAPTCHA bypass, cookie capture, hidden multi-page crawler, or marketplace credential handling.
- No permanent SmartSpecPro API key in the extension.
- No screenshot-only extraction as the source of truth.
- No LLM result is saved as a product without user confirmation.

