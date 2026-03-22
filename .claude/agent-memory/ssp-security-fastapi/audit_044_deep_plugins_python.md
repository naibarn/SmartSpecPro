---
name: deep-plugins python script security audit
description: Security audit of all Python scripts across deep-plan 0.3.0, deep-project 0.2.1, and deep-implement 0.2.1 Claude Code plugins
type: project
---

Audit conducted 2026-03-16. All Python scripts are read-only filesystem/task-management utilities
with no FastAPI/Celery surface. No SQL, no HTTP endpoints, no LLM prompt injection risk.

Key findings:
- F01 HIGH: subprocess.run with no PATH restriction in review.py (gcloud) and setup_implementation_session.py (git)
- F02 HIGH: CLAUDE_ENV_FILE write without path validation in all three capture-session-id.py hooks
- F03 HIGH: task_list_id used as directory name without sanitization in task_storage.py (write_tasks)
- F04 MEDIUM: transcript_path from stdin used to read files in write-section-on-stop.py with no validation
- F05 MEDIUM: prompt_file_path derived from user transcript data without path containment check in write-section-on-stop.py
- F06 MEDIUM: print() used for all output (not a structured logger) across all scripts
- F07 LOW: setup_implementation_session.py exposes project_config (test_command, runtime) in stdout JSON
- F08 LOW: section names from user-controlled manifest passed to Path() without validate_path_safety in deep-implement/sections.py

**Why:** These are Claude Code plugin scripts, not SmartSpecPro FastAPI backend code.
**How to apply:** If any of these plugins are ever ported to the backend or wrapped in an HTTP API layer, the path traversal and subprocess risks become CRITICAL.
