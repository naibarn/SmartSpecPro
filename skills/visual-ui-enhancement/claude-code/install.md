# Claude Code Install Guide

## Repo-local install

```bash
mkdir -p .claude/skills
cp -R visual-ui-enhancement .claude/skills/visual-ui-enhancement
```

Expected structure:

```text
your-project/
└── .claude/
    └── skills/
        └── visual-ui-enhancement/
            ├── SKILL.md
            ├── README.md
            ├── references/
            ├── templates/
            └── claude-code/
```

## User-global install

```bash
mkdir -p ~/.claude/skills
cp -R visual-ui-enhancement ~/.claude/skills/visual-ui-enhancement
```

## Optional installer script

From the folder that contains `visual-ui-enhancement/`:

```bash
./visual-ui-enhancement/scripts/install-claude-code.sh --repo
# or
./visual-ui-enhancement/scripts/install-claude-code.sh --global
```

## Optional subagent templates

For repo-local agents:

```bash
mkdir -p .claude/agents
cp .claude/skills/visual-ui-enhancement/claude-code/agents/*.md .claude/agents/
```

For global skill install:

```bash
mkdir -p .claude/agents
cp ~/.claude/skills/visual-ui-enhancement/claude-code/agents/*.md .claude/agents/
```
