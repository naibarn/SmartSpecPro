# Visual UI Enhancement Skill — Multi-Platform Ready

A multi-platform Agent Skill for upgrading React/Next.js/Vite interfaces into polished, premium, accessible, responsive product UI using Tailwind CSS and shadcn/ui.

This package supports:

- **Codex app / Codex CLI / Codex IDE extension**
- **Claude Code**
- **Prompt/manual mode** in other coding agents

This package intentionally does **not** include the optional
external `openai-agents-python` orchestrator. The repo skill must work through
Codex/Claude skills and sub-agents without `.venv` or external LLM
API wiring.

## Package Philosophy

The core `SKILL.md` is platform-neutral. Platform-specific setup lives in separate folders:

```text
visual-ui-enhancement/
├── SKILL.md                         # shared core skill
├── agents/openai.yaml               # Codex UI metadata
├── codex/                           # Codex usage guides
├── claude-code/                     # Claude Code usage guides and subagent templates
├── references/                      # reusable checklists and guidelines
├── templates/                       # AGENTS.md / CLAUDE.md snippets and review templates
├── examples/                        # prompts for each platform
└── scripts/                         # optional local installer/validator helpers
```

## Install for Codex

Repo-local install:

```bash
mkdir -p .agents/skills
cp -R visual-ui-enhancement .agents/skills/visual-ui-enhancement
```

User-global install:

```bash
mkdir -p ~/.agents/skills
cp -R visual-ui-enhancement ~/.agents/skills/visual-ui-enhancement
```

Invoke in Codex:

```text
$visual-ui-enhancement

Review and improve app/dashboard/page.tsx using Tailwind CSS + shadcn/ui.
Make it premium, modern, responsive, accessible, and dark-mode friendly.
```

## Install for Claude Code

Repo-local install:

```bash
mkdir -p .claude/skills
cp -R visual-ui-enhancement .claude/skills/visual-ui-enhancement
```

User-global install:

```bash
mkdir -p ~/.claude/skills
cp -R visual-ui-enhancement ~/.claude/skills/visual-ui-enhancement
```

Invoke in Claude Code:

```text
/visual-ui-enhancement app/dashboard/page.tsx

Make this dashboard premium, modern, responsive, accessible, and production-ready using Tailwind CSS + shadcn/ui.
```

## Install optional Claude Code subagents

The skill includes subagent templates in `claude-code/agents/`. To install them for one repo:

```bash
mkdir -p .claude/agents
cp claude-code/agents/*.md .claude/agents/
```

These are optional. The main skill works without them.

## Use without Codex or Claude Code

Copy `SKILL.md` into your coding agent as instruction context and ask it to review or generate UI using the workflow.

## Repository Runtime Policy

This repo-local skill does not require `.venv`, `OPENAI_API_KEY`, or any
external LLM API integration. UI/UX orchestration is handled by the repo's
`orchestra` skill and repository sub-agent definitions.

## Invocation Summary

| Platform | Install path | Invoke |
|---|---|---|
| Codex repo-local | `.agents/skills/visual-ui-enhancement/` | `$visual-ui-enhancement` |
| Codex global | `~/.agents/skills/visual-ui-enhancement/` | `$visual-ui-enhancement` |
| Claude Code repo-local | `.claude/skills/visual-ui-enhancement/` | `/visual-ui-enhancement` |
| Claude Code global | `~/.claude/skills/visual-ui-enhancement/` | `/visual-ui-enhancement` |
| Other agents | Any readable folder | paste/read `SKILL.md` |

## Version

`3.0.0-multiplatform`
