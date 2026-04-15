# Section 03: Local File Intelligence and Workspace Manager

## Ownership

This section owns:

- managed local roots
- indexing and previews
- staged file retrieval
- workspace/container policy generation

## Target files and modules

- `apps/tauri-shell/src-tauri/src/file_commands.rs`
- `apps/tauri-shell/src-tauri/src/docker_commands.rs`
- `apps/tauri-shell/src-tauri/src/local_file_service.rs`
- `apps/tauri-shell/src-tauri/src/desktop_runtime_capabilities.rs`
- `apps/tauri-shell/src-tauri/src/local_file_index.rs`
- `apps/tauri-shell/src-tauri/src/workspace_manager.rs`
- `apps/tauri-shell/src-tauri/src/audit_sink.rs`
- `apps/tauri-shell/src-tauri/resources/litert-lm-runtime/parse_document.py`
- `apps/web/server/routes/desktopHost.ts`
- `apps/web/server/services/desktopPolicyService.ts`
- `apps/web/client/src/features/desktop-host/local-files/*`
- `apps/tauri-shell/src-tauri/tests/local_file_service_tests.rs`
- `apps/tauri-shell/src-tauri/tests/workspace_manager_tests.rs`

## Scope

- replace raw absolute-path discovery with consented local roots
- add metadata, full-text, preview, thumbnail, and optional vector index flows
- add search, snippet, preview, and staged-attachment APIs
- define managed workspace profiles on top of current Docker primitives
- define read/write/writeback policy modes for local roots
- define retention, purge, and storage-protection rules for derived preview and index data

## Implementation notes

- keep raw `file_commands.rs` and `docker_commands.rs` as host implementation helpers where useful, but route managed product flows through:
  - path-to-root resolution
  - root allowlists
  - policy-tagged workspace profiles
  - audit events
- workspace profile generation should own:
  - mounts
  - network class
  - CPU/memory limits
  - temporary output folders
  - connector sidecar access
- writeback policy should be explicit, with at least:
  - read/search only
  - write into managed output folders
  - user-confirmed writeback into approved roots
  - advanced local mode override
- local file intelligence should expose stable host APIs for:
  - `searchFiles`
  - `getMetadata`
  - `getPreview`
  - `getSnippets`
  - `stageIntoWorkspace`
  - `listRelatedFiles`
- preview cache, snippet cache, full-text indexes, and vector indexes should live in OS-protected or encrypted-at-rest locations where supported
- root removal and device offboarding should purge or invalidate derived local-file stores according to policy

## TDD expectations

- add root-allowlist tests before indexer or preview work
- add workspace-profile policy tests before container execution wiring
- add sensitive-root deny/default-warning tests
- add writeback-mode tests separately from read/search tests
- add root-removal purge tests for preview and index stores
- add offboarding cleanup tests for derived local-file data

## Acceptance checks

- managed runtimes can search approved roots without raw whole-disk scanning
- workspace containers receive only approved mounts and network policy
- users can see and manage indexed roots explicitly
- current Tauri raw path and Docker surfaces are no longer the primary managed UX contract
- derived local-file stores are cleaned up when a root is removed or the device is offboarded under cleanup policy

## Risks and coordination notes

- parser safety and preview extraction should be isolated enough that hostile files cannot take over the desktop host
- indexing scope must remain clearly user-visible or the trust model will fail
- derived file-intelligence stores can become a shadow data-retention surface if purge and storage-protection rules are not explicit

## Implementation status

- Implemented managed-root, derived-store, and purge helpers in:
  - `apps/tauri-shell/src-tauri/src/local_file_index.rs`
  - `apps/tauri-shell/src-tauri/src/local_file_service.rs`
  - `apps/tauri-shell/src-tauri/src/workspace_manager.rs`
  - `apps/tauri-shell/src-tauri/src/audit_sink.rs`
- Added isolated rich-document parser worker in:
  - `apps/tauri-shell/src-tauri/resources/litert-lm-runtime/parse_document.py`
- Added desktop capability reporting for parser isolation posture in:
  - `apps/tauri-shell/src-tauri/src/local_file_service.rs`
  - `apps/tauri-shell/src-tauri/src/desktop_runtime_capabilities.rs`
- Implemented server policy and lifecycle builders in:
  - `apps/web/server/services/desktopPolicyService.ts`
  - `apps/web/server/routes/desktopHost.ts`
- Added user-visible local-root rendering in:
  - `apps/web/client/src/features/desktop-host/local-files/LocalFileRootsPanel.tsx`
- Added TDD coverage in:
  - `apps/web/shared/__tests__/desktopHostPolicies.test.ts`
  - `apps/web/server/services/__tests__/desktopPolicyService.test.ts`
  - `apps/tauri-shell/src-tauri/tests/local_file_service_tests.rs`
  - `apps/tauri-shell/src-tauri/tests/desktop_runtime_capabilities_tests.rs`
  - `apps/tauri-shell/src-tauri/tests/workspace_manager_tests.rs`

## Final status

- Section 03 is implemented for managed roots, workspace profiles, derived-store retention, purge/offboarding hooks, and isolated rich-document parsing for PDF, legacy and OpenXML Office (`doc`, `docx`, `docm`, `odt`, `ppt`, `pptx`, `pptm`, `odp`, `xls`, `xlsx`, `xlsm`, `ods`), and image preview/snippet extraction through a bundled worker.
- The parser now supports optional stronger render-and-OCR fallbacks when trusted host tools such as `pdftotext`, `pdftoppm` or `mutool`, `pdfinfo`, `soffice`, and `tesseract` are available, while keeping bounded/fail-closed behavior when they are absent.
- The parser now surfaces basic macro-presence inspection, embedded-media counting, worksheet counting for spreadsheet packages, and layout-analysis posture alongside multi-page rendering/OCR limits so managed diagnostics can report the actual complex-document posture of a given desktop runtime.
- The local parser posture is surfaced as a first-class Desktop Host capability report so web settings and policy diagnostics can show the actual isolation mode, supported formats, bounded limits, PDF extractor backend, OCR provider, render backend, office renderer, rendered preview formats, multi-page rendering posture, maximum rendered pages, OCR layout mode, macro/media inspection posture, layout analysis mode, and complex-document support class reported by desktop.
- Residual hardening still pending: document extraction remains bounded and fail-closed, but it is not yet a full deep macro analysis, embedded-content extraction, or advanced structural OCR/layout stack for the most complex files.
