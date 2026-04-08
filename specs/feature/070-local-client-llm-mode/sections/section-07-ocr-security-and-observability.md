# Section 07: OCR, Security, and Observability

## Purpose

Define the backend OCR boundary, asset-origin security controls, privacy semantics, revocation handling, and minimal telemetry needed to ship Local AI safely.

## Ownership

- backend OCR boundary rules
- model asset allowlist and integrity policy
- SSRF and untrusted-URL protections
- privacy semantics and truthful labels
- minimal Local AI observability

## Target files

- `apps/web/server/_core/index.ts`
- `apps/web/server/services/localAiAssetPolicy.ts`
- `apps/web/server/services/localAiObservability.ts`
- `apps/web/server/services/ocrProviderPolicy.ts`
- relevant OCR upload or document-processing routers/services under `apps/web/server/`

## Implementation notes

1. Keep document-grade OCR on a backend/provider path.
   - Typhoon OCR remains server-mediated.
   - Client code never holds Typhoon OCR secrets.
   - Local LLM OCR stays best-effort only.

2. Define safe OCR ingress rules.
   OCR or asset-processing jobs should accept:
   - uploaded files
   - SmartSpecPro-managed storage keys
   - SmartSpecPro-generated signed URLs
   They should reject arbitrary third-party URLs by default.

3. Centralize model asset-origin policy in a server-owned config/service.
   - Maintain an allowlist of asset origins.
   - Validate manifest metadata before install.
   - Feed this allowlist to browser/Tauri clients rather than letting clients invent origins.

4. Tighten network policy where feasible.
   - Update CSP or related outbound fetch policy in `apps/web/server/_core/index.ts` so approved asset origins are explicit.
   - Do not rely only on a broad `https:` policy for sensitive asset downloads.

5. Make revocation operational, not only conceptual.
   - If a model profile is revoked, later sections must route away from it immediately.
   - The settings surface should explain that the installed bundle is no longer usable and offer removal or replacement.

6. Define truthful privacy semantics used across UI and telemetry.
   Distinguish:
   - processed on-device before provider submission
   - processed by SmartSpecPro backend
   - processed by a third-party provider
   Never imply that data stayed on-device when raw input already traversed the backend.

7. Add minimal Local AI telemetry.
   Suggested events:
   - feature enabled
   - install started/completed/failed
   - local attempt succeeded / fell back
   - profile revoked
   - preparation and response latency
   Exclusions:
   - raw prompt bodies
   - derived local text artifacts
   - sensitive payload snapshots by default

## TDD expectations

- Add tests proving OCR routes reject arbitrary third-party URLs.
- Add tests proving asset-origin policy rejects non-allowlisted model origins.
- Add tests proving analytics payloads omit raw prompt content and sensitive derived artifacts.
- Add tests proving revoked profiles are surfaced as unusable even if files remain installed.

## Acceptance checks

- OCR remains backend-mediated and does not expose provider secrets in clients.
- Asset downloads are constrained to server-approved origins with manifest validation.
- Revoked profiles stop routing immediately.
- Telemetry remains minimal and privacy-safe.
- UI and persisted metadata never overstate `Local` processing for the canonical v1 chat path.

## Coordination notes

- Section 03 provides catalog and revocation inputs.
- Section 02 and section 06 should surface revoked-profile and policy-block explanations using the signals defined here.
- Section 04 provides authoritative runtime metadata persistence.
- Section 08 carries these guardrails into Team Room and workflow surfaces.
- Section 09 owns the cross-cutting regression suite that proves these guardrails hold.
