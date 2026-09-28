# Section 03 - Release and production proof

Ownership: Worker App version files, desktop version gate tests, installer
artifact, and production verification.

- Set desktop Hermes minimum to 0.1.132 without changing the central worker.
- Build and publish the Windows installer using the existing release workflow.
- Restart only required services and verify health/release checksum.
- Observe the live worker upgrade, job transitions, device-code event presence
  without reading its payload, user browser consent, authorization, and probe.
- Do not mark OAuth complete before the user approves xAI in their browser.

