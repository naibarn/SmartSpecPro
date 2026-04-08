<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-browser-gemma4-runtime
section-02-tauri-gemma4-litert-runtime
section-03-chat-memory-voice-integration
section-04-tauri-skill-execution-policy
section-05-security-regression-and-rollout
END_MANIFEST -->

# Gemma 4-First Sections Index

## Execution order

1. `section-01-browser-gemma4-runtime`
2. `section-02-tauri-gemma4-litert-runtime`
3. `section-03-chat-memory-voice-integration`
4. `section-04-tauri-skill-execution-policy`
5. `section-05-security-regression-and-rollout`

## Notes

- Section 01 and section 02 define the real runtime surfaces.
- Section 03 consumes those surfaces in chat/memory/voice flows.
- Section 04 extends the Tauri runtime into selected safe skill classes.
- Section 05 closes rollout, abuse, and non-regression gaps.
