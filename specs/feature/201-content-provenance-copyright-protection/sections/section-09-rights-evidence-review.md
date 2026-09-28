# Section 09 — Rights, certificates, cases, and reviewer links

Implement the persistence-backed Rights & Ownership tab, rights-holder claims,
creation certificate, evidence readiness panel, case lifecycle, evidence
package integrity hash, and expiring read-only external reviewer view. A
certificate requires a final artifact and verified manifest. Reports describe
technical provenance/match strength and include the legal-ownership disclaimer;
they never expose raw codewords, secrets, or unbounded logs. Preserve separate
first-observed, claimed-creation, trusted-timestamp, and publication times;
retain rotated public verification keys; and require explicit user review and
confirmation before any legal declaration or external submission.

Tests first: tenant-scoped rights CRUD, certificate guard, package integrity,
time-label separation, key-history verification, explicit legal confirmation,
case transitions, reviewer expiry/revocation, and output redaction.

## UI/UX Contract

### Target User / JTBD

Creators assemble ownership evidence; reviewers inspect a read-only package and
can distinguish technical evidence from legal determination.

### Surface Inventory

Rights & Ownership tab, certificate view, evidence readiness panel, cases, and
external reviewer link view.

### Component Map

Rights claim form/list, certificate summary, evidence readiness panel, case
timeline, and read-only reviewer view under the content-protection pages.

### State Matrix

Loading, empty, error, disabled, draft, ready, revoked, expired, inconclusive,
and read-only states must be explicit.

### Responsive Matrix

Forms and evidence cards support 390x844, 768x1024, and 1440x900; long hashes
wrap or provide copy buttons without horizontal page overflow.

### Accessibility Acceptance

Labels, field descriptions, keyboard focus, semantic table/list structure,
status announcements, contrast, and reduced motion are required.

### Copy Contract

Use cautious Thai/English copy: “technical provenance evidence” and “does not
by itself establish legal ownership”; never promise a legal verdict.

### Browser Evidence Required

Authenticated rights/certificate/case views plus an expired/revoked external
reviewer-link state.

## Implementation record

- Added tenant/owner-scoped rights-holder profiles, rights claims, evidence
  documents/components, creation certificate guard, cases, sealed evidence
  packages, and expiring/revocable reviewer links.
- Added explicit legal-declaration confirmation and technical-evidence/legal-
  ownership disclaimers in API and workspace copy.
- Added the public hashed reviewer route and public verification-key history
  endpoint with allowlisted, redacted fields.
