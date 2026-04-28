# Codex Install Guide

## Repo-local install

```bash
mkdir -p .agents/skills
cp -R visual-ui-enhancement .agents/skills/visual-ui-enhancement
```

Expected structure:

```text
your-project/
└── .agents/
    └── skills/
        └── visual-ui-enhancement/
            ├── SKILL.md
            ├── README.md
            ├── agents/openai.yaml
            ├── references/
            └── templates/
```

## User-global install

```bash
mkdir -p ~/.agents/skills
cp -R visual-ui-enhancement ~/.agents/skills/visual-ui-enhancement
```

## Optional installer script

From the folder that contains `visual-ui-enhancement/`:

```bash
./visual-ui-enhancement/scripts/install-codex.sh --repo
# or
./visual-ui-enhancement/scripts/install-codex.sh --global
```
