# Security Badge (Proxy Posture)

This repo publishes a `security` badge using a Shields endpoint JSON hosted on the `badges` branch.

## What it represents

It is a *heuristic* derived from secure defaults in the OpenAI-compatible proxy source:
- `LLM_PROXY_LOCALHOST_ONLY` default is **ON**
- `LLM_PROXY_AUTO_APPROVE_NONSTREAM` default is **OFF**
- default approval tools include `workspace_write_file`

Badge meanings:
- **strict**: all secure defaults found
- **permissive**: one or more secure defaults missing

> This badge does not guarantee runtime configuration, but helps detect accidental changes to defaults.

## Files

- Generator: `scripts/ci/security_badge.py`
- Published JSON: `badges/security.json` on the `badges` branch
