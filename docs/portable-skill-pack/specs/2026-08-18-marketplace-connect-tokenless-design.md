# Marketplace Connect Tokenless UI Design

Date: 2026-08-18
Status: Implemented locally; production deployment pending

## Goal

Allow the authenticated Marketplace Capture connect page to pair the installed
SmartAIHub Companion without rendering the short-lived bearer token in the
browser UI. The page will show connection state and expiry metadata only.

## Chosen approach

Keep the existing protected `issueExtensionToken` contract and device/origin
binding. The page requests the token, immediately sends it through the existing
canonical-first Companion external-message helper, and retains it only in the
mutation callback long enough to complete delivery. Remove the token textarea
and all copy/paste instructions from the page. On transport or receiver failure,
show a retryable error without exposing the token as a fallback.

The extension continues storing the token in its protected extension storage,
where the existing authenticated API calls already read it. The existing
extension-side manual token editor remains available for recovery from the
extension itself; this change removes the web page's highest-risk display path.

## Alternatives considered

1. Mask or collapse the token textarea: rejected because the credential remains
   present in the DOM and can be copied or captured by browser tooling.
2. Implement a new Worker-style one-time device-code exchange: more isolated,
   but requires new server state/endpoints and a second pairing protocol. Keep as
   a follow-up if the browser message path cannot be made reliable.

## UI and failure contract

- The primary action is `Connect SmartAIHub Companion`.
- During delivery, disable the action and show a non-secret progress message.
- On success, show connected state and token expiry timestamp only.
- On failure, show a generic actionable retry message; never include token data
  in text, attributes, URL, logs, or error fallback content.
- No manual token copy instruction appears on the page.

## Verification

- Focused page tests prove successful auto-delivery and that token values are
  absent from rendered DOM/text.
- Existing delivery-helper tests continue to prove canonical-first and legacy
  transport fallback boundaries.
- TypeScript and focused web tests run after the patch. Production build and
  restart remain separate deployment actions.
