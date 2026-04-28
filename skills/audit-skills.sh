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
warnings: list[str] = []

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

for text_file in sorted(root.rglob("*")):
    if text_file.is_dir() or any(part in {".venv", ".pytest_cache", "__pycache__"} for part in text_file.parts):
        continue
    if text_file.suffix.lower() not in {
        ".md",
        ".txt",
        ".json",
        ".yaml",
        ".yml",
        ".sh",
        ".py",
        ".toml",
    }:
        continue
    text = text_file.read_text(encoding="utf-8", errors="ignore").lower()
    forbidden_terms = [
        "smart" + "spec" + "pro",
        "smart" + "ai" + "hub",
        "smart" + "spec",
        "/home/dev/projects/" + "smart" + "spec" + "pro",
    ]
    for forbidden in forbidden_terms:
        if forbidden in text:
            errors.append(f"{text_file}: forbidden project-specific reference: {forbidden}")

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
        if claude_agents_dir.exists() and not native_path.exists():
            warnings.append(
                f"{native_path}: missing optional native Claude compatibility definition for {agent_file}"
            )

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
        "Visual Polish Gate",
        "Accessibility Gate",
        "Responsive Gate",
        "Component State Gate",
    ]:
        if required_gate not in quality_gates_text:
            errors.append(f"skills/orchestra/references/quality-gates.md: missing gate {required_gate}")

required_orchestra_refs = [
    "meta-activation.md",
    "worktree-discipline.md",
    "verification-before-completion.md",
    "tdd-discipline.md",
    "branch-finishing.md",
    "skill-behavior-tests.md",
    "skill-behavior-scenarios.json",
]
for ref in required_orchestra_refs:
    ref_path = root / "orchestra" / "references" / ref
    if not ref_path.exists():
        errors.append(f"{ref_path}: missing orchestra reference")

visual_skill_dir = root / "visual-ui-enhancement"
if visual_skill_dir.exists():
    for required in [
        "SKILL.md",
        "README.md",
        "VERSION",
        "LICENSE",
        "references/visual-polish-checklist.md",
        "references/accessibility-qa.md",
        "references/responsive-qa.md",
        "references/component-states.md",
    ]:
        if not (visual_skill_dir / required).exists():
            errors.append(f"{visual_skill_dir / required}: missing visual UI skill file")
    if (visual_skill_dir / "integrations" / "openai-agents-python").exists():
        errors.append("skills/visual-ui-enhancement: active package must not include openai-agents-python integration")
    forbidden_runtime_patterns = [
        "python -m venv",
        "source .venv",
        "pip install -r requirements.txt",
        "export OPENAI_API_KEY",
    ]
    for text_file in visual_skill_dir.rglob("*.md"):
        text = text_file.read_text(encoding="utf-8")
        for pattern in forbidden_runtime_patterns:
            if pattern in text:
                errors.append(f"{text_file}: forbidden runtime setup pattern: {pattern}")

scenario_path = root / "orchestra" / "references" / "skill-behavior-scenarios.json"
if scenario_path.exists():
    try:
        scenario_data = json.loads(scenario_path.read_text(encoding="utf-8"))
    except Exception as exc:
        errors.append(f"{scenario_path}: invalid JSON: {exc}")
        scenario_data = {}
    scenarios = scenario_data.get("scenarios", []) if isinstance(scenario_data, dict) else []
    if len(scenarios) < 5:
        errors.append(f"{scenario_path}: expected at least 5 behavior scenarios")
    known_agents = {path.stem for path in sub_agents_dir.glob("*.md")} if sub_agents_dir.exists() else set()
    known_gates = (root / "orchestra" / "references" / "quality-gates.md").read_text(encoding="utf-8") if (root / "orchestra" / "references" / "quality-gates.md").exists() else ""
    for scenario in scenarios:
        for field in ["id", "user_message", "expected_owner", "expected_route", "why"]:
            if not scenario.get(field):
                errors.append(f"{scenario_path}: scenario missing {field}: {scenario}")
        for agent in scenario.get("expected_agents", []):
            if agent not in known_agents:
                errors.append(f"{scenario_path}: scenario {scenario.get('id')} references unknown agent {agent}")
        for gate in scenario.get("expected_gates", []):
            if gate not in known_gates and gate not in {
                "Verification Before Completion",
                "Skill Behavior Tests",
            }:
                errors.append(f"{scenario_path}: scenario {scenario.get('id')} references unknown gate {gate}")

if errors:
    print("skill audit failed")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

for warning in warnings:
    print(f"warning: {warning}")

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
