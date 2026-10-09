# Windows Runner 0.2.29 Credential-Rotation Acceptance

Status: `WAITING_FOR_UNSIGNED_REVIEW_ARTIFACT_AND_WINDOWS_OPERATOR`

This procedure verifies the merged SPEC-205 credential-rotation fix on a real
Windows host. It does not authorize replacing an active Runner session,
publishing a trusted release, deploying the backend, or dispatching a protected
job. Keep SPEC-224 protected dispatch denied throughout.

## Candidate provenance

- Workflow: [SmartAIHub Runner desktop review build, run 37948652961](https://github.com/naibarn/SmartSpecPro/actions/runs/37948652961)
- Requested candidate: Windows x64, version `0.2.29`, `unsigned-review`
- Requested source ref: `79805356f9252e1ba6858d993dbcc42476788745`
- Dispatch run head: `db3f0dfc366a8984fcf89447a9faeb315799f3fa`
- Do not install until the completed workflow's `manifest.json` reports the
  requested source commit and the installer SHA-256 matches both
  `manifest.json` and `SHA256SUMS`.
- The run's head SHA is not proof of the checked-out source ref. The manifest's
  `sourceRef` and `sourceCommit` are authoritative for artifact provenance.

## Operator procedure

1. Wait for the Windows x64 job to complete. Download the unsigned review
   artifact from the workflow run. Verify its version, target, source commit,
   signing status, installer filename and SHA-256 against the manifest and
   `SHA256SUMS`. Record the artifact ID and hash.
2. Use a separate authorized Windows test host or an approved maintenance
   window. Preserve the currently active Runner session; do not replace or
   reconnect it just to test this candidate.
3. Install the exact verified candidate and record the installed version and
   Windows host identity. Start the Runner through its supported Desktop flow.
4. Verify ordinary authenticated Control Plane session health and capability
   acknowledgement through the authorized read-only interface. Record Runner
   ID, session ID, capability snapshot/revision, acknowledgement time, and
   backend source SHA. Redact all credentials and authentication assertions.
5. Allow a normal credential refresh to occur while the Runner remains active.
   Do not manually reconnect or restart at the refresh boundary. Export the
   sanitized Runner Debug report from Desktop and retain the JSON privately.
6. Confirm the report has a higher `credentialRevision`,
   `runtimeCredentialUpdated=true`, a non-null
   `runtimeCredentialUpdatedAt`, `wssTransportRecreated=true`, and a WSS
   authentication acknowledgement after the rotation. Confirm a subsequent
   capability acknowledgement is recorded and `lastFailureCode` is null.
   If refresh does not occur during the window, record `NOT_OBSERVED`; do not
   force a credential rotation for this test.
7. Record any typed failure and timestamp. Never attach raw access/refresh
   tokens, private keys, device proofs, authorization headers, or unredacted
   debug output to an issue or handoff.
8. Do not submit a protected DevelopmentRun. Codex capability readiness and
   ordinary session continuity do not grant dispatch authority.

## Acceptance result template

```text
Candidate version:
Artifact ID and SHA-256:
Manifest sourceCommit / sourceRef:
Windows host and test window:
Installed version:
Runner ID / session ID:
Backend source SHA:
Capability snapshot/revision and acknowledged-at:
Credential revision before/after:
Runtime credential update observed-at:
WSS transport recreated / authenticated-at:
Capability acknowledgement after rotation:
lastFailureCode / timestamp:
Result: PASS | FAIL | NOT_OBSERVED
Evidence location (sanitized):
Protected dispatch: DENY (unchanged)
```

PASS requires all post-rotation session and capability acknowledgements on the
exact installed candidate. A successful build, local Codex probe, screenshot,
or pre-refresh session is not acceptance evidence.
