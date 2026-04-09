# Section 03 status

- Status: implemented, uncommitted
- Completed this round:
  - managed local-root policy and sensitive-root blocking
  - derived-store retention / purge helpers
  - local search / metadata / preview / snippets / staging APIs
  - isolated parser worker for PDF, legacy/OpenXML Office, and image preview / snippet extraction
  - optional render / convert / OCR use when trusted host tools are present (`pdftotext`, `pdftoppm` or `mutool`, `soffice`, `tesseract`)
  - parser capability reporting for Desktop Host settings and diagnostics, including extractor backend, render backend, office renderer, rendered formats, and complex-document support posture
  - managed workspace profile generation
  - local audit redaction sink
- Residual hardening still pending:
  - richer multi-page rendering/OCR coverage for complex PDFs, macros, embedded media, and advanced image text/layout extraction
- Targeted tests passed:
  - `npm --prefix apps/web test -- server/services/__tests__/desktopPolicyService.test.ts`
  - `cargo test --manifest-path apps/tauri-shell/src-tauri/Cargo.toml --test local_file_service_tests --test desktop_runtime_capabilities_tests --test workspace_manager_tests`
