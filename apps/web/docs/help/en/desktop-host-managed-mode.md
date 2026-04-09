# Desktop Host Managed Mode

SmartSpecPro Desktop Host is the managed local execution surface for SmartSpecPro.

## What it means

- Web remains the control plane.
- Desktop remains the execution-rich surface.
- Managed local execution still enforces gateway-only LLM routing.
- Local roots replace raw whole-disk discovery in managed mode.
- Pi and Agency Swarm runs stay policy-bound, auditable, and truthfully labeled.

## Truthful execution labels

- `Local` means raw inputs stayed on the device.
- `Hybrid` means the run executed on desktop but some data or tool access crossed into server-managed systems.
- `Server` means the run executed in a server-controlled runtime.
- `External` means the run executed in an external worker surface such as OpenClaw gateway routing.

## Rollout gates

Managed rollout must stay blocked when any required gate is missing:

- proof-of-possession device binding
- signed package verification
- signed update verification
- managed local roots as the default discovery path
- Pi gateway-only startup
- Agency Swarm gateway-only startup
- offboarding cleanup readiness

## What the settings surface should show

- enrolled desktop devices with health, last-seen time, and proof-of-possession posture
- attestation/storage mode as reported by desktop
- isolated rich-document parser posture, including supported formats, extractor backend, render backend, office renderer, OCR provider, rendered-preview coverage, and bounded limits
- disabled devices should surface as disabled and stop passing managed execution gates after the next policy refresh
- the settings surface may expose a governed disable-device action that triggers offboarding cleanup on the next device contact

## Current limits

- cryptographic device proof is live, and Desktop Host now reports whether the active device key is software-backed, OS-protected, OS-attested, or hardware-backed when supported helpers or deployment hints are present; universal platform-attested key brokers remain a later hardening step
- rich-document parsing supports bounded PDF, legacy/OpenXML Office, and image flows, and can opportunistically use `pdftotext`, `pdftoppm` or `mutool`, `soffice`, and `tesseract` when available, but it is not yet a full multi-page OCR/rendering pipeline for the most complex files

## Compatibility note

The legacy localhost proxy path from Feature 004 remains compatibility-only during migration. It is not the long-term managed Desktop Host contract.
