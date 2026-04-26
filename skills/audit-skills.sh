#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

python3 - <<'PY'
from pathlib import Path
import json
import re

root = Path("skills")
errors: list[str] = []

for skill_file in sorted(root.rglob("SKILL.md")):
    text = skill_file.read_text(encoding="utf-8")
    rel = str(skill_file)
    if not text.startswith("---\n"):
        errors.append(f"{rel}: missing YAML frontmatter")
        continue
    try:
        _, frontmatter, body = text.split("---", 2)
    except ValueError:
        errors.append(f"{rel}: malformed frontmatter fence")
        continue
    if not re.search(r"^name:\s*\S+", frontmatter, re.M):
        errors.append(f"{rel}: missing name")
    if not re.search(r"^description:", frontmatter, re.M):
        errors.append(f"{rel}: missing description")
    if len(body.strip()) < 100:
        errors.append(f"{rel}: body looks too short")

for json_file in sorted(root.rglob("*.json")):
    if any(part in {".venv", ".pytest_cache", "__pycache__"} for part in json_file.parts):
        continue
    try:
        json.loads(json_file.read_text(encoding="utf-8"))
    except Exception as exc:
        errors.append(f"{json_file}: invalid JSON: {exc}")

for path in root.rglob("*"):
    if any(part in {".venv", ".pytest_cache", "__pycache__"} for part in path.parts):
        errors.append(f"{path}: runtime artifact present; run skills/clean-runtime-artifacts.sh")
        break

sub_agents_dir = root / "sub-agents" / "agents"
sub_agents_readme = root / "sub-agents" / "README.md"
claude_agents_dir = Path(".claude") / "agents"

if sub_agents_dir.exists() and sub_agents_readme.exists():
    readme_text = sub_agents_readme.read_text(encoding="utf-8")
    dispatch_text = (root / "orchestra" / "references" / "sub-agent-dispatch.md").read_text(encoding="utf-8")
    task_packet_text = (root / "orchestra" / "references" / "task-packet-format.md").read_text(encoding="utf-8")
    quality_gates_text = (root / "orchestra" / "references" / "quality-gates.md").read_text(encoding="utf-8")
    agent_files = sorted(path.name for path in sub_agents_dir.glob("*.md"))
    for agent_file in agent_files:
        agent_name = agent_file.removesuffix(".md")
        if f"`{agent_file}`" not in readme_text:
            errors.append(f"skills/sub-agents/README.md: missing registry row for {agent_file}")
        if agent_name not in dispatch_text:
            errors.append(f"skills/orchestra/references/sub-agent-dispatch.md: missing mapping for {agent_name}")
        native_path = claude_agents_dir / f"ssp-{agent_name}.md"
        if not native_path.exists():
            errors.append(f"{native_path}: missing native Claude agent definition for {agent_file}")

    registry_agents = set(re.findall(r"\| `([^`]+\.md)` \|", readme_text))
    missing_files = sorted(registry_agents - set(agent_files))
    for missing in missing_files:
        errors.append(f"skills/sub-agents/README.md: registry row has no agent file: {missing}")

    for required_domain in [
        "CMD-0 Product UX",
        "CMD-8E E2E",
        "CMD-9 Performance",
        "CMD-10 CI Release",
        "CMD-11 Supply Chain",
    ]:
        if required_domain not in task_packet_text:
            errors.append(f"skills/orchestra/references/task-packet-format.md: missing domain {required_domain}")

    for required_gate in [
        "E2E Browser Tests",
        "Performance Gate",
        "CI/Release Gate",
        "Dependency/Supply-Chain Gate",
    ]:
        if required_gate not in quality_gates_text:
            errors.append(f"skills/orchestra/references/quality-gates.md: missing gate {required_gate}")

if errors:
    print("skill audit failed")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("skill structure audit passed")
PY

bash skills/verify-installed-skills-sync.sh

for skill in deep-implement deep-project deep-plan; do
  if [[ -f "skills/${skill}/pyproject.toml" ]]; then
    echo "running tests for ${skill}"
    (cd "skills/${skill}" && uv run --extra dev pytest)
  fi
done

echo "skill audit passed"
