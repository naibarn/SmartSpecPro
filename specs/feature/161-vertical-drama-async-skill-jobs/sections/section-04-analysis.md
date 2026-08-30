# Section 04 — Source, location, and character analysis jobs

Move source vision analysis out of the request path and let the worker own queued/running/succeeded/failed transitions in `vertical_drama_source_analyses`. Convert location detection, character variant/twin detection, and duplicate analysis to typed jobs. Keep merge/apply actions as user-confirmed DB operations. Update each panel/dialog to poll durable state and recover after refresh.

Tests cover missing source data, provider failure, retry, tenant ownership, exact selected model, and no direct LLM invocation from the public mutation.
