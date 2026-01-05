# Kilo Code CLI Research Notes

**Source:** https://kilo.ai/docs/cli

## Overview

Kilo Code CLI is a terminal-based AI coding agent that:
- Orchestrates agents from the terminal
- Uses the same underlying technology as the IDE extensions
- Supports multiple modes: architect, code, debug, ask, orchestrator

## Installation

```bash
npm install -g @kilocode/cli
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `kilocode` | Start interactive session |
| `kilocode --mode <mode>` | Start with specific mode (architect, code, debug, ask, orchestrator) |
| `kilocode --workspace <path>` | Start with specific workspace |
| `kilocode --continue` | Resume last conversation |
| `kilocode --parallel` | Run in parallel mode (separate git branch) |
| `kilocode --auto` | Run in autonomous mode |
| `kilocode config` | Open configuration editor |

## Slash Commands (Interactive Mode)

| Command | Description |
|---------|-------------|
| `/mode` | Switch between modes |
| `/model list` | List available models |
| `/model select` | Select a model |
| `/checkpoint list` | List checkpoints |
| `/checkpoint restore <hash>` | Restore checkpoint |
| `/tasks` | View task history |
| `/tasks search <query>` | Search tasks |
| `/tasks select <id>` | Switch to task |
| `/config` | Open config editor |
| `/new` | Start new task |
| `/help` | List commands |
| `/exit` | Exit CLI |

## Skills System

Skills are discovered from:
- **Global skills**: `~/.kilocode/skills/` (available in all projects)
- **Project skills**: `.kilocode/skills/` (project-specific)

Skill structure:
```
your-project/
└── .kilocode/
    ├── skills/               # Generic skills
    │   └── skill-name/
    │       └── SKILL.md
    └── skills-code/          # Mode-specific skills
        └── skill-name/
            └── SKILL.md
```

SKILL.md format:
```markdown
---
name: skill-name
description: Skill description
---

# Skill Content
Instructions and guidelines...
```

## Checkpoint Management

- Kilo automatically creates checkpoints as you work
- Checkpoints are git commits
- `/checkpoint list` - View checkpoints
- `/checkpoint restore <hash>` - Restore (destructive, performs git hard reset)

## Auto-Approval Configuration

Config file: `~/.kilocode/config.json`

```json
{
  "autoApproval": {
    "enabled": true,
    "read": { "enabled": true, "outside": false },
    "write": { "enabled": true, "outside": false, "protected": false },
    "execute": {
      "enabled": true,
      "allowed": ["npm", "git", "pnpm"],
      "denied": ["rm -rf", "sudo"]
    },
    "browser": { "enabled": false },
    "mcp": { "enabled": true },
    "mode": { "enabled": true },
    "subtasks": { "enabled": true }
  }
}
```

## Parallel Mode

```bash
# Run multiple instances in parallel
kilocode --parallel "task description"
```

- Creates separate git branches for each instance
- Changes committed on /exit

## Autonomous Mode

```bash
kilocode --auto "task description"
```

- Non-interactive execution
- Uses auto-approval settings
- Supports JSON output mode

## Key Integration Points for SmartSpec

1. **Session Management**
   - Start/stop Kilo sessions
   - Track session state
   - Handle checkpoints

2. **Skill Injection**
   - Create project-specific skills
   - Inject SmartSpec context as skills
   - Mode-specific skill loading

3. **Command Execution**
   - Execute tasks via CLI
   - Handle auto-approval
   - Process results

4. **Checkpoint Sync**
   - Sync Kilo checkpoints with SmartSpec state
   - Track git commits
   - Support rollback

5. **Task History**
   - Query task history
   - Search and filter tasks
   - Resume previous tasks


## Autonomous Mode Details

### Command Syntax

```bash
# Standard autonomous mode
kilocode --auto "Implement feature X"

# With piped input
echo "Fix the bug in app.ts" | kilocode --auto

# With timeout (seconds)
kilocode --auto "Run tests" --timeout 300

# With JSON output for structured parsing
kilocode --auto --json "Implement feature X"
```

### Autonomous Mode Behavior

1. **No User Interaction**: All approval requests handled automatically
2. **Auto-Approval/Rejection**: Based on auto-approval settings
3. **Follow-up Questions**: AI makes autonomous decisions
4. **Automatic Exit**: CLI exits when task completes or times out

### JSON Output Mode

- Use `--json` flag with `--auto`
- Output sent to stdout as structured JSON
- Ideal for CI/CD pipelines and automated workflows

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success (task completed) |
| `124` | Timeout (task exceeded time limit) |
| `1` | Error (initialization or execution failure) |

### CI/CD Integration Example

```yaml
# GitHub Actions example
- name: Run Kilo Code
  run: |
    echo "Implement the new feature" | kilocode --auto --timeout 600
```

### Session Continuation

```bash
# Resume last conversation
kilocode --continue
# or
kilocode -c
```

## Environment Variables

Kilo CLI supports environment variable overrides for configuration.

## Implementation Plan for SmartSpec

### Phase 2.1: KiloSessionManager

```python
class KiloSessionManager:
    """Manages Kilo Code CLI sessions."""
    
    async def start_session(
        self,
        workspace: str,
        mode: str = "code",
        auto: bool = False,
        timeout: int = 300,
    ) -> KiloSession
    
    async def execute_task(
        self,
        session: KiloSession,
        prompt: str,
        json_output: bool = True,
    ) -> KiloResult
    
    async def stop_session(self, session: KiloSession) -> None
    
    async def get_checkpoints(self, session: KiloSession) -> List[Checkpoint]
    
    async def restore_checkpoint(
        self,
        session: KiloSession,
        checkpoint_hash: str,
    ) -> bool
```

### Phase 2.2: CLI Execution

- Execute `kilocode` commands via subprocess
- Parse JSON output in autonomous mode
- Handle exit codes
- Manage timeouts

### Phase 2.3: Skill Injection

- Create `.kilocode/skills/` directory in project
- Generate SKILL.md files from SmartSpec context
- Inject user preferences, project facts, coding standards

### Phase 2.4: State Synchronization

- Sync Kilo checkpoints with SmartSpec execution state
- Track task history
- Support checkpoint restoration
