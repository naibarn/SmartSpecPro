# Kilo Code CLI Research Notes

**Date:** January 2, 2026

## Overview

Kilo Code CLI เป็น command-line tool สำหรับ orchestrate AI coding agents จาก terminal โดยใช้เทคโนโลยีเดียวกับ IDE extensions

## Key Features

### 1. Installation & Basic Usage
```bash
npm install -g @kilocode/cli
kilocode                          # Start interactive session
kilocode --mode architect         # Start with specific mode
kilocode --workspace /path/to/project
kilocode --continue               # Resume last conversation
```

### 2. Available Modes
- **Architect** - สำหรับวางแผนและออกแบบ
- **Code** - สำหรับเขียนโค้ด
- **Debug** - สำหรับ debug
- **Ask** - สำหรับถามคำถาม
- **Orchestrator** - สำหรับ orchestrate tasks
- **Custom agent modes** - สร้าง mode เองได้

### 3. CLI Commands
| Command | Description |
|---------|-------------|
| `/mode` | Switch between modes |
| `/model` | Switch between LLMs |
| `/model list` | List available models |
| `/checkpoint list` | List checkpoints |
| `/checkpoint restore` | Restore to checkpoint |
| `/tasks` | View task history |
| `/tasks search` | Search tasks |
| `/tasks select` | Switch to task |
| `/config` | Open configuration |
| `/new` | Start new task |

### 4. Agent Skills System
- **Global skills:** `~/.kilocode/skills/` (available in all projects)
- **Project skills:** `.kilocode/skills/` (project-specific)
- Skills can be generic or mode-specific
- Each skill has `SKILL.md` with YAML frontmatter

### 5. Checkpoint Management
- Auto-creates checkpoints as you work
- Uses git commit hashes
- Can restore to previous states
- **Warning:** Restoration is destructive (git hard reset)

### 6. Task History
- View, search, navigate task history
- Pagination (10 tasks per page)
- Sort by: newest, oldest, most-expensive, most-tokens
- Filter by: current workspace, favorites

### 7. Parallel Mode
```bash
kilocode --parallel "improve xyz"  # Terminal 1
kilocode --parallel "improve abc"  # Terminal 2
```
- Multiple instances work in parallel
- Changes on separate git branches
- Pairs with `--auto` mode

### 8. Auto-Approval Settings
```json
{
  "autoApproval": {
    "enabled": true,
    "read": { "enabled": true, "outside": false },
    "write": { "enabled": true, "outside": false, "protected": false },
    "execute": { "enabled": true, "allowed": ["npm", "git"], "denied": ["rm -rf", "sudo"] },
    "browser": { "enabled": false },
    "mcp": { "enabled": true },
    "mode": { "enabled": true },
    "subtasks": { "enabled": true }
  }
}
```

### 9. Autonomous Mode
- Non-interactive mode for CI/CD
- JSON output mode available
- Exit codes for automation

### 10. MCP (Model Context Protocol) Support
- Supports MCP tools
- Can integrate with external services

## Integration Points for SmartSpec

### 1. Direct CLI Invocation
```python
import subprocess

result = subprocess.run(
    ["kilocode", "--mode", "code", "--auto", "--workspace", workspace_path],
    input=prompt,
    capture_output=True,
    text=True
)
```

### 2. Skills Integration
- Create SmartSpec-specific skills in `.kilocode/skills/`
- Share project conventions, coding standards
- Mode-specific skills for different workflows

### 3. Checkpoint Integration
- Use Kilo's checkpoint system for version control
- Integrate with SmartSpec's state management

### 4. Task History Integration
- Sync Kilo's task history with SmartSpec's workflow history
- Use for episodic memory

### 5. Parallel Execution
- Use `--parallel` for concurrent code changes
- Integrate with SmartSpec's orchestrator for parallel steps

## Dependencies
- Node.js (for npm install)
- Git (for checkpoints and parallel mode)
- Optional: MCP servers for extended capabilities
