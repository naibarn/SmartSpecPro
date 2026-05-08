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
    project_name = "".join(chr(code) for code in [115, 109, 97, 114, 116, 115, 112, 101, 99, 112, 114, 111])
    project_short = project_name[:-3]
    legacy_domain = project_short + "aihub"
    legacy_tool_name = "".join(chr(code) for code in [117, 108, 116, 114, 97, 115, 104, 105, 112])
    fake_source_url = "github.com/" + "portable " + "skill " + "source"
    fake_source_name = "portable " + "skill " + "source"
    plugin_config_phrase = "plugin configure " + "portable-" + "skill-" + "pack"
    forbidden_terms = [
        project_name,
        legacy_domain,
        project_short,
        str(Path.home() / "dev" / "projects" / project_name),
        legacy_tool_name,
        fake_source_url,
        fake_source_name,
        plugin_config_phrase,
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

for portable_script in [
    root / "portable_install.py",
    root / "install-portable-skills.sh",
    root / "generate-claude-agents.sh",
]:
    if not portable_script.exists():
        errors.append(f"{portable_script}: missing portable install support")

if sub_agents_dir.exists() and sub_agents_readme.exists():
    readme_text = sub_agents_readme.read_text(encoding="utf-8")
    dispatch_text = (root / "orchestra" / "references" / "sub-agent-dispatch.md").read_text(encoding="utf-8")
    task_packet_text = (root / "orchestra" / "references" / "task-packet-format.md").read_text(encoding="utf-8")
    quality_gates_text = (root / "orchestra" / "references" / "quality-gates.md").read_text(encoding="utf-8")
    shared_discipline_text = (root / "sub-agents" / "references" / "shared-operational-discipline.md").read_text(encoding="utf-8")
    if "Cross-Project Portability" not in shared_discipline_text:
        errors.append("skills/sub-agents/references/shared-operational-discipline.md: missing Cross-Project Portability rules")
    agent_files = sorted(path.name for path in sub_agents_dir.glob("*.md"))
    for agent_file in agent_files:
        agent_name = agent_file.removesuffix(".md")
        if f"`{agent_file}`" not in readme_text:
            errors.append(f"skills/sub-agents/README.md: missing registry row for {agent_file}")
        if agent_name not in dispatch_text:
            errors.append(f"skills/orchestra/references/sub-agent-dispatch.md: missing mapping for {agent_name}")
        native_path = claude_agents_dir / f"ssp-{agent_name}.md"
        if claude_agents_dir.exists() and not native_path.exists():
            errors.append(
                f"{native_path}: missing native Claude compatibility definition for {agent_file}; run skills/generate-claude-agents.sh"
            )
        if native_path.exists():
            native_text = native_path.read_text(encoding="utf-8")
            if f"name: ssp-{agent_name}" not in native_text:
                errors.append(f"{native_path}: native agent name mismatch")
            if f"skills/sub-agents/agents/{agent_file}" not in native_text:
                errors.append(f"{native_path}: missing source file pointer")

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

routing_path = root / "orchestra" / "references" / "installed-skill-routing.md"
if routing_path.exists():
    routing_text = routing_path.read_text(encoding="utf-8")
    for required_skill in [
        "gpt-image-2",
        "kb-retriever",
        "web-design-engineer",
        "web-video-presentation",
    ]:
        if f"`{required_skill}`" not in routing_text:
            errors.append(f"{routing_path}: missing routing entry for {required_skill}")
    for required_help_marker in [
        "Code-Aware Help And Tutorial Workflow",
        "script.md",
        "outline.md",
        "host-native Codex image tool/auth",
        "web-video-presentation",
    ]:
        if required_help_marker not in routing_text:
            errors.append(f"{routing_path}: missing code-aware help marker: {required_help_marker}")
    for required_planning_marker in [
        "Planning Skill Order",
        "`brainstorming` first only when product direction is not yet chosen",
        "`deep-project` first when the project/module/system goal is already concrete",
        "`brainstorming` -> `deep-project`",
        "Skip `brainstorming` when the user explicitly provides a direction",
    ]:
        if required_planning_marker not in routing_text:
            errors.append(f"{routing_path}: missing planning skill order marker: {required_planning_marker}")

orchestra_ref_dir = root / "orchestra" / "references"
route_decision_path = orchestra_ref_dir / "routing-decision.md"
task_analysis_path = orchestra_ref_dir / "task-analysis.md"
quality_gates_path = orchestra_ref_dir / "quality-gates.md"

if route_decision_path.exists():
    route_decision_text = route_decision_path.read_text(encoding="utf-8")
    for required_help_marker in [
        "code-aware-help-flow",
        "script.md",
        "outline.md",
        "Codex-native",
    ]:
        if required_help_marker not in route_decision_text:
            errors.append(f"{route_decision_path}: missing code-aware help routing marker: {required_help_marker}")
    for required_planning_marker in [
        "brainstorming-prelude",
        "Use this route before any deep-* planning chain",
        "`full-pipeline`",
        "If the project goal is clear, do not add a brainstorming step",
    ]:
        if required_planning_marker not in route_decision_text:
            errors.append(f"{route_decision_path}: missing brainstorming/deep-project order marker: {required_planning_marker}")

if task_analysis_path.exists():
    task_analysis_text = task_analysis_path.read_text(encoding="utf-8")
    for required_help_marker in [
        "code-aware product help",
        "อ่าน code ของหน้านี้แล้วทำ help/tutorial/video demo",
        "ทำ script.md + outline.md จาก feature/page จริง",
    ]:
        if required_help_marker not in task_analysis_text:
            errors.append(f"{task_analysis_path}: missing code-aware help trigger marker: {required_help_marker}")
    for required_planning_marker in [
        "Brainstorming vs Deep-Project Decision",
        "Open idea space -> `brainstorming-prelude`",
        "Chosen project needing decomposition -> `full-pipeline` / `deep-project`",
        "ช่วยคิดระบบใหม่",
        "แตกงานระบบนี้",
    ]:
        if required_planning_marker not in task_analysis_text:
            errors.append(f"{task_analysis_path}: missing brainstorming/deep-project trigger marker: {required_planning_marker}")

if quality_gates_path.exists():
    quality_gates_text_for_help = quality_gates_path.read_text(encoding="utf-8")
    for required_help_marker in [
        "Source-grounding",
        "Image routing",
        "Video readiness",
        "Side-effect safety",
        "Product polish",
    ]:
        if required_help_marker not in quality_gates_text_for_help:
            errors.append(f"{quality_gates_path}: missing code-aware help quality marker: {required_help_marker}")

gpt_image_skill = root / "gpt-image-2"
if gpt_image_skill.exists():
    gpt_skill_text = (gpt_image_skill / "SKILL.md").read_text(encoding="utf-8")
    gpt_shared_text = (gpt_image_skill / "scripts" / "shared.js").read_text(encoding="utf-8")
    if "host-native Codex image tool/auth" not in gpt_skill_text:
        errors.append("skills/gpt-image-2/SKILL.md: missing Codex-native default image routing")
    if "SKILLPACK_ALLOW_CUSTOM_OPENAI_BASE_URL" not in gpt_shared_text:
        errors.append("skills/gpt-image-2/scripts/shared.js: missing custom base URL safety gate")

video_skill = root / "web-video-presentation"
if video_skill.exists():
    scaffold_text = (video_skill / "scripts" / "scaffold.sh").read_text(encoding="utf-8")
    synth_text = (video_skill / "templates" / "scripts" / "synthesize-audio.sh").read_text(encoding="utf-8")
    if "--yes" not in scaffold_text:
        errors.append("skills/web-video-presentation/scripts/scaffold.sh: missing side-effect confirmation flag")
    if "--yes" not in synth_text:
        errors.append("skills/web-video-presentation/templates/scripts/synthesize-audio.sh: missing TTS confirmation flag")
    for text_file in video_skill.rglob("*"):
        if text_file.is_dir() or any(part in {".venv", ".pytest_cache", "__pycache__"} for part in text_file.parts):
            continue
        if text_file.suffix.lower() not in {".md", ".sh", ".ts", ".tsx", ".js", ".json"}:
            continue
        text = text_file.read_text(encoding="utf-8", errors="ignore")
        for risky_pattern in ["sk-" + "xxxxx", "rm " + "-rf"]:
            if risky_pattern in text:
                errors.append(f"{text_file}: forbidden high-risk example pattern: {risky_pattern}")

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
    scenario_ids = {scenario.get("id") for scenario in scenarios if isinstance(scenario, dict)}
    if "HELP-001" not in scenario_ids:
        errors.append(f"{scenario_path}: missing code-aware help behavior scenario HELP-001")
    for required_scenario_id in ["PLANORDER-001", "PLANORDER-002"]:
        if required_scenario_id not in scenario_ids:
            errors.append(f"{scenario_path}: missing planning order behavior scenario {required_scenario_id}")
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
