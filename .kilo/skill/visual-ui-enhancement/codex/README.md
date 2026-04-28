# Codex Usage

Codex reads skills from `.agents/skills` in a repository or `~/.agents/skills` for user-global skills. This skill's core entrypoint is `SKILL.md`; Codex uses the `name` and `description` frontmatter to discover it and loads the full skill only when selected.

## Install

Repo-local:

```bash
mkdir -p .agents/skills
cp -R visual-ui-enhancement .agents/skills/visual-ui-enhancement
```

User-global:

```bash
mkdir -p ~/.agents/skills
cp -R visual-ui-enhancement ~/.agents/skills/visual-ui-enhancement
```

## Invoke

Use `$visual-ui-enhancement`:

```text
$visual-ui-enhancement

Review and improve app/dashboard/page.tsx using Tailwind CSS + shadcn/ui.
Make it premium, modern, responsive, accessible, and dark-mode friendly.
```

## Subagent workflow

For larger UI work, ask Codex explicitly to use subagents. See `codex/subagent-orchestrator-prompt.md`.

## Slash command note

`$visual-ui-enhancement` activates this skill. `/visual-ui-enhancement` is only a slash command if you create a separate command with that name. See `codex/slash-command-note.md`.
