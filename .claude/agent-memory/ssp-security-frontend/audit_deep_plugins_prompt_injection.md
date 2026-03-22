---
name: deep-plugins-prompt-injection-audit
description: 2026-03-16 read-only security audit of deep-plan/deep-project/deep-implement plugins for LLM prompt injection and subagent isolation gaps
type: project
---

Audit date: 2026-03-16
Auditor: CMD-6 (Frontend Security Auditor, read-only)
Scope: deep-plan 0.3.0, deep-project 0.2.1, deep-implement 0.2.1

**Why:** These skills read user-supplied .md files and pass their content as prompts to LLMs and subagents. Malicious content in spec/requirements files could hijack the autonomous workflow.

**How to apply:** Use this record when revisiting plugin security or when these plugins are updated.

## Findings Summary

8 findings total: 3 HIGH, 5 MEDIUM. No CRITICAL XSS/auth-token issues (those are React frontend concerns not applicable here). Primary risks are prompt injection via user-controlled files and privilege escalation through subagent isolation gaps.
