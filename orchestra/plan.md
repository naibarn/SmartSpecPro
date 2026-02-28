# Orchestra Plan

## Task
Feasibility analysis for importing presentations from Google Slides and PowerPoint (.pptx)
into the SmartSpecPro Presentation Editor.

## Classification
- scope: large
- risk: high
- affected_domains: [frontend, backend-node, backend-python, schema, external-api]
- estimated_file_count: 20-28
- chosen_route: research-first → feasibility confirmed → spec → deep-plan
- task_summary: Add import capability for Google Slides (via native API) and PowerPoint (.pptx
  via python-pptx) into the Presentation Editor, mapping external formats to the internal
  PresentationSlideContent schema. The codebase already has DB tables, Google OAuth, and
  compatibility service designed for exactly this purpose.
- security_concerns: [Google OAuth2 scopes, file upload MIME validation, PPTX parsing sandbox,
  S3/R2 image re-upload, cross-tenant isolation]
- feasibility: CONFIRMED — all infrastructure prerequisites already exist

## Wave Plan (for when deep-plan executes)
Wave 1: Schema + Python service layer
  - DB migration (presentationImportJobs table if needed, or reuse presentationConversionRecords)
  - python-pptx importer (pptx_importer.py)
  - gslides_importer.py (extends google_content_extractor.py)
  - Celery task (presentation_import_tasks.py)

Wave 2: Node.js backend
  - tRPC router (presentationImport.ts)
  - Import service (presentationImportService.ts)

Wave 3: Frontend
  - Import dialog UI (ImportPresentationDialog.tsx)
  - PresentationEditor integration (import button in toolbar)

Wave 4: QA + Security
  - Python tests, TypeScript types check
  - Security review (file upload validation, OAuth scope check)
