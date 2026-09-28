<!-- PROJECT_CONFIG
runtime: node-and-python
test_command: npm --workspace apps/web run test -- server/routes/slideRender.test.ts && python-backend/.venv/bin/python -m pytest -q python-backend/tests/test_presentation_render_task.py
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-node-media-refresh
section-02-python-render-retry
section-03-focused-verification
END_MANIFEST -->

# Sections

- `section-01-node-media-refresh`: verify and minimally adjust the managed URL
  refresh seam and route tests.
- `section-02-python-render-retry`: implement bounded per-slide retry for both
  screenshot and record-mode rendering.
- `section-03-focused-verification`: run focused tests, type/diff checks, and
  record runtime proof boundaries.
