# Claude Code Usage

Claude Code skills live in `.claude/skills/<skill-name>/SKILL.md` for a project or `~/.claude/skills/<skill-name>/SKILL.md` for a personal/global skill.

This skill is invoked as:

```text
/visual-ui-enhancement
```

## Install

Repo-local:

```bash
mkdir -p .claude/skills
cp -R visual-ui-enhancement .claude/skills/visual-ui-enhancement
```

User-global:

```bash
mkdir -p ~/.claude/skills
cp -R visual-ui-enhancement ~/.claude/skills/visual-ui-enhancement
```

## Invoke

```text
/visual-ui-enhancement app/dashboard/page.tsx

Make this dashboard premium, modern, responsive, accessible, and production-ready using Tailwind CSS + shadcn/ui.
```

## Optional custom subagents

Templates are included in `claude-code/agents/`. Install them into your project:

```bash
mkdir -p .claude/agents
cp .claude/skills/visual-ui-enhancement/claude-code/agents/*.md .claude/agents/
```

Then ask Claude Code to delegate to those agents explicitly during complex UI reviews.
