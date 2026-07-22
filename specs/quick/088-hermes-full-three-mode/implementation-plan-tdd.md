# TDD Plan

1. Add pairing-script tests for secure env-file output and token non-printing.
2. Add UI tests for:
   - shared button disabled when the scope/worker is unavailable;
   - central, server-personal, and private descriptions;
   - Worker App setup/download action;
   - Thai and English copy.
3. Extend availability/service tests if worker readiness is added to the
   response.
4. Run existing connection, pairing, token-leak, runtime-manifest, and Worker
   App Hermes tests before and after implementation.
5. Run operational doctor/pair/start checks only after code tests pass.
6. Build runtime and installer, verify checksums and public HTTP headers.
