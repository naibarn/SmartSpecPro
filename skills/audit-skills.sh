#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

python3 - <<'PY'
from pathlib import Path
import importlib.util
import json
import re
import sys

root = Path("skills")
errors: list[str] = []
warnings: list[str] = []

sys.dont_write_bytecode = True
portable_spec = importlib.util.spec_from_file_location("portable_install", root / "portable_install.py")
portable_install = importlib.util.module_from_spec(portable_spec)
assert portable_spec and portable_spec.loader
portable_spec.loader.exec_module(portable_install)

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
    required_result_fields = [
        "`status`",
        "`files_changed`",
        "`findings`",
        "`blockers`",
        "`next_steps`",
        "`quality_gate_results`",
    ]
    security_specialists = {
        "security-trpc.md",
        "security-fastapi.md",
        "security-frontend.md",
        "security-review.md",
    }
    required_task_packet_fields = [
        "| TASK |",
        "| DOMAIN |",
        "| FILES |",
        "| CONTEXT |",
        "| CONSTRAINTS |",
        "| CONTRACT |",
        "| OUTPUT |",
        "| QUALITY GATE |",
    ]
    for agent_file in agent_files:
        agent_name = agent_file.removesuffix(".md")
        agent_path = sub_agents_dir / agent_file
        agent_text = agent_path.read_text(encoding="utf-8")
        if f"`{agent_file}`" not in readme_text:
            errors.append(f"skills/sub-agents/README.md: missing registry row for {agent_file}")
        if agent_name not in dispatch_text:
            errors.append(f"skills/orchestra/references/sub-agent-dispatch.md: missing mapping for {agent_name}")
        for field in required_result_fields:
            if field not in agent_text:
                errors.append(f"{agent_path}: Output Contract missing standard Result Report field {field}")
        if agent_file in security_specialists:
            for field in required_task_packet_fields:
                if field not in agent_text:
                    errors.append(f"{agent_path}: security Task Packet input contract missing {field}")
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
            expected_native = portable_install.claude_agent_text(agent_path)
            if native_text != expected_native:
                errors.append(f"{native_path}: generated native agent content drift; run skills/generate-claude-agents.sh")

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
        "Review Convergence Gate",
    ]:
        if required_gate not in quality_gates_text:
            errors.append(f"skills/orchestra/references/quality-gates.md: missing gate {required_gate}")

required_orchestra_refs = [
    "meta-activation.md",
    "worktree-discipline.md",
    "verification-before-completion.md",
    "review-convergence.md",
    "tdd-discipline.md",
    "branch-finishing.md",
    "skill-behavior-tests.md",
    "skill-behavior-scenarios.json",
    "ui-ux-planning-contract.md",
    "ui-browser-verification.md",
    "design-token-extraction.md",
    "ui-review-report-template.md",
    "visual-regression-policy.md",
]
for ref in required_orchestra_refs:
    ref_path = root / "orchestra" / "references" / ref
    if not ref_path.exists():
        errors.append(f"{ref_path}: missing orchestra reference")

ui_contract_checker = root / "deep-plan" / "scripts" / "checks" / "check-ui-contracts.py"
if not ui_contract_checker.exists():
    errors.append(f"{ui_contract_checker}: missing UI contract validator")

routing_path = root / "orchestra" / "references" / "installed-skill-routing.md"
if routing_path.exists():
    routing_text = routing_path.read_text(encoding="utf-8")
    for manifest_skill in [
        line.strip()
        for line in (root / "mirrored-skills.txt").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]:
        if f"| `{manifest_skill}` |" not in routing_text:
            errors.append(f"{routing_path}: missing routing table row for installed skill {manifest_skill}")
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
        "`security-gate`",
        "If the project goal is clear, do not add a brainstorming step",
    ]:
        if required_planning_marker not in route_decision_text:
            errors.append(f"{route_decision_path}: missing brainstorming/deep-project order marker: {required_planning_marker}")
    for required_parallel_marker in [
        "parallelization preflight",
        "multi-agent-waves",
        "Dispatch `visual-ui-requirement-analyzer`",
        "dispatch `visual-ux-reviewer`, `accessibility-reviewer`, and",
    ]:
        if required_parallel_marker not in route_decision_text:
            errors.append(f"{route_decision_path}: missing parallel-default routing marker: {required_parallel_marker}")

orchestra_skill_path = root / "orchestra" / "SKILL.md"
if orchestra_skill_path.exists():
    orchestra_skill_text = orchestra_skill_path.read_text(encoding="utf-8")
    for required_parallel_marker in [
        "Sub-Agent-First Default",
        "Parallel opportunity scan",
        "parallel_default",
        "Agent-tool availability check",
        "dispatch them in one",
    ]:
        if required_parallel_marker not in orchestra_skill_text:
            errors.append(f"{orchestra_skill_path}: missing sub-agent-first marker: {required_parallel_marker}")

wave_planning_path = orchestra_ref_dir / "wave-planning.md"
if wave_planning_path.exists():
    wave_planning_text = wave_planning_path.read_text(encoding="utf-8")
    for required_parallel_marker in [
        "Parallelization Preflight Checklist",
        "dispatch_mode",
        "sequential_reason",
        "parallel_batch",
        "parallel_with_worktree",
    ]:
        if required_parallel_marker not in wave_planning_text:
            errors.append(f"{wave_planning_path}: missing parallel wave-planning marker: {required_parallel_marker}")

platform_compat_path = orchestra_ref_dir / "platform-compat.md"
if platform_compat_path.exists():
    platform_compat_text = platform_compat_path.read_text(encoding="utf-8")
    for required_parallel_marker in [
        "Detect dispatch capability",
        "dispatch-capability.md",
        "parallel-agent-tool",
        "Inline execution in Standard mode is a last resort",
    ]:
        if required_parallel_marker not in platform_compat_text:
            errors.append(f"{platform_compat_path}: missing dispatch capability marker: {required_parallel_marker}")

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
        "ui-browser-verification.md",
        "async/data-fetching UI",
    ]:
        if required_help_marker not in quality_gates_text_for_help:
            errors.append(f"{quality_gates_path}: missing code-aware help quality marker: {required_help_marker}")

    for required_ui_marker in [
        "Copy Contract",
        "390x844",
        "768x1024",
        "1440x900",
        "skipped browser evidence",
    ]:
        combined_ui_refs = "\n".join(
            (orchestra_ref_dir / name).read_text(encoding="utf-8")
            for name in [
                "ui-ux-planning-contract.md",
                "ui-browser-verification.md",
                "visual-regression-policy.md",
            ]
            if (orchestra_ref_dir / name).exists()
        )
        if required_ui_marker not in combined_ui_refs:
            errors.append(f"{orchestra_ref_dir}: missing UI contract marker: {required_ui_marker}")

review_convergence_path = orchestra_ref_dir / "review-convergence.md"
if review_convergence_path.exists():
    review_convergence_text = review_convergence_path.read_text(encoding="utf-8")
    for required_convergence_marker in [
        "Minimum clean rounds",
        "Maximum rounds",
        "Review Round Algorithm",
        "Stop Rules",
        "stale gates",
        "second-order impact closure",
    ]:
        if required_convergence_marker not in review_convergence_text:
            errors.append(f"{review_convergence_path}: missing review convergence marker: {required_convergence_marker}")

if quality_gates_path.exists():
    quality_gates_text_for_convergence = quality_gates_path.read_text(encoding="utf-8")
    for required_convergence_marker in [
        "Review Convergence Gate",
        "Stale Gate Protocol",
        "A passing gate becomes stale",
        "review-convergence.md",
    ]:
        if required_convergence_marker not in quality_gates_text_for_convergence:
            errors.append(f"{quality_gates_path}: missing review convergence gate marker: {required_convergence_marker}")

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
    for required_scenario_id in ["VISUAL-002", "VISUAL-003"]:
        if required_scenario_id not in scenario_ids:
            errors.append(f"{scenario_path}: missing visual behavior scenario {required_scenario_id}")
    for required_scenario_id in [
        "LAUNCH-001",
        "DEPLOY-001",
        "RELEASE-001",
        "SECURITY-AUDIT-001",
        "SECRET-001",
        "PENTEST-001",
        "MIGRATION-001",
        "API-HEALTH-001",
        "PERF-001",
        "SEO-001",
        "GA4-001",
        "RESCUE-001",
        "CLAUDE-001",
        "SKILL-SYNC-001",
        "CONTRACT-001",
        "TENANT-001",
        "LLM-COST-001",
        "BROWSER-SANDBOX-001",
        "I18N-001",
        "OBS-001",
        "WORKTREE-001",
        "PARALLEL-DEFAULT-001",
        "SECURITY-PARALLEL-001",
        "UI-REVIEW-PARALLEL-001",
        "INLINE-FORBIDDEN-001",
        "SEQUENTIAL-EXCEPTION-001",
        "REVIEW-CONVERGENCE-001",
        "IMPACT-RIPPLE-001",
        "STALE-GATE-001",
    ]:
        if required_scenario_id not in scenario_ids:
            errors.append(f"{scenario_path}: missing expanded behavior scenario {required_scenario_id}")
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
                "Migration Checker",
                "API Smoke Test",
                "Health Check",
            }:
                errors.append(f"{scenario_path}: scenario {scenario.get('id')} references unknown gate {gate}")
        expected_agents = scenario.get("expected_agents", [])
        if len(expected_agents) > 1:
            dispatch_mode = scenario.get("expected_dispatch_mode")
            sequential_reason = scenario.get("sequential_reason")
            if not dispatch_mode and not sequential_reason:
                errors.append(
                    f"{scenario_path}: scenario {scenario.get('id')} has 2+ agents but no expected_dispatch_mode or sequential_reason"
                )
            if dispatch_mode in {"parallel_batch", "parallel_with_worktree", "mixed_parallel_waves"}:
                forbidden_execution = set(scenario.get("forbidden_execution", []))
                if "inline-with-agent-tool" not in forbidden_execution:
                    errors.append(
                        f"{scenario_path}: scenario {scenario.get('id')} parallel dispatch must forbid inline-with-agent-tool"
                    )
            if dispatch_mode == "sequential_exception" and not sequential_reason:
                errors.append(
                    f"{scenario_path}: scenario {scenario.get('id')} sequential_exception missing sequential_reason"
                )
        expected_waves = scenario.get("expected_waves")
        if expected_waves is not None:
            if not isinstance(expected_waves, list) or not all(isinstance(wave, list) for wave in expected_waves):
                errors.append(f"{scenario_path}: scenario {scenario.get('id')} expected_waves must be an array of arrays")
            else:
                wave_agents = {agent for wave in expected_waves for agent in wave}
                unknown_wave_agents = sorted(
                    agent for agent in wave_agents if agent not in known_agents and not agent.startswith("worker-")
                )
                for agent in unknown_wave_agents:
                    errors.append(f"{scenario_path}: scenario {scenario.get('id')} expected_waves references unknown agent {agent}")
        if scenario.get("id") in {"REVIEW-CONVERGENCE-001", "IMPACT-RIPPLE-001", "STALE-GATE-001"}:
            if "Review Convergence Gate" not in scenario.get("expected_gates", []):
                errors.append(f"{scenario_path}: scenario {scenario.get('id')} missing Review Convergence Gate")
            forbidden_execution = set(scenario.get("forbidden_execution", []))
            if scenario.get("id") == "REVIEW-CONVERGENCE-001" and "single-review-only" not in forbidden_execution:
                errors.append(f"{scenario_path}: REVIEW-CONVERGENCE-001 must forbid single-review-only completion")
            if scenario.get("id") == "IMPACT-RIPPLE-001" and "skip-impact-closure" not in forbidden_execution:
                errors.append(f"{scenario_path}: IMPACT-RIPPLE-001 must forbid skipping impact closure")
            if scenario.get("id") == "STALE-GATE-001" and "stale-gate-pass" not in forbidden_execution:
                errors.append(f"{scenario_path}: STALE-GATE-001 must forbid stale-gate-pass")

    def lightweight_route(message: str) -> tuple[str, str]:
        text = message.lower()
        if "ตรวจซ้ำจนมั่นใจ" in message or "convergence review" in text:
            return "orchestra", "multi-agent-waves"
        if "impact ripple" in text or "ผลกระทบตามมา" in message:
            return "orchestra", "multi-agent-waves"
        if "rerun stale gates" in text or "stale gate" in text:
            return "orchestra", "multi-agent-waves"
        if "dashboard summary" in text and "end-to-end" in text:
            return "orchestra", "multi-agent-waves"
        if "pre-merge security gate" in text:
            return "orchestra", "security-gate"
        if "review ux accessibility responsive" in text:
            return "visual-ui-enhancement", "visual-ui-flow"
        if "subagent tool" in text and "frontend" in text and "backend" in text:
            return "orchestra", "multi-agent-waves"
        if "database migration" in text and "git release checklist" in text:
            return "orchestra", "multi-agent-waves"
        if "อ่าน code" in message and ("help" in text or "walkthrough" in text):
            return "orchestra", "code-aware-help-flow"
        if "ยังไม่แน่ใจ" in message or "ช่วยคิดระบบใหม่" in message:
            return "orchestra", "brainstorming-prelude"
        if "แตกงานระบบ" in message or "marketplace module" in text:
            return "orchestra", "full-pipeline"
        if "ship readiness" in text or "launch" in text:
            return "ship", "installed-skill-flow"
        if "release" in text and ("npm publish" in text or "github release" in text or "bump version" in text):
            return "release", "installed-skill-flow"
        if "security-audit" in text or "owasp" in text or "hardening" in text:
            return "security-audit", "installed-skill-flow"
        if "scan secrets" in text or "secret" in text:
            return "secret-scanner", "installed-skill-flow"
        if "pentest" in text:
            return "pentest", "installed-skill-flow"
        if "migration" in text and "state" in text:
            return "migration-checker", "installed-skill-flow"
        if "deploy" in text:
            return "deploy", "installed-skill-flow"
        if "api-smoke" in text or "api smoke" in text:
            return "api-smoke-test", "installed-skill-flow"
        if "health-check" in text and "api-smoke" not in text:
            return "health-check", "installed-skill-flow"
        if "bundle" in text:
            return "bundle-tracker", "installed-skill-flow"
        if "profile backend" in text or "code-profiler" in text:
            return "code-profiler", "installed-skill-flow"
        if "seo-audit" in text or "sitemap" in text or "robots" in text or "llms.txt" in text:
            return "seo-audit", "installed-skill-flow"
        if "content score" in text:
            return "content-scorer", "installed-skill-flow"
        if "ga4" in text:
            return "ga4-client", "installed-skill-flow"
        if "production incident" in text or "site down" in text or "errors spiking" in text:
            return "rescue", "installed-skill-flow"
        if "claude.md" in text:
            return "revise-claude-md", "installed-skill-flow"
        if "skill publish" in text or "generated ssp agents" in text:
            return "orchestra", "installed-skill-flow"
        if any(token in text for token in ["gpt image 2", "generate ภาพ", "image"]):
            return "gpt-image-2", "installed-skill-flow"
        if "knowledge/" in text:
            return "kb-retriever", "installed-skill-flow"
        if "web video presentation" in text:
            return "web-video-presentation", "installed-skill-flow"
        if "contract drift" in text or "shared schema" in text:
            return "orchestra", "multi-agent-waves"
        if any(token in text for token in ["tenantid", "rbac", "user ownership", "private vault", "credit isolation"]):
            return "orchestra", "security-gate"
        if "llm provider" in text or "cost budget" in text or "prompt injection cost" in text:
            return "orchestra", "multi-agent-waves"
        if "browser automation sandbox" in text or "ssrf" in text or "network permission" in text:
            return "orchestra", "security-gate"
        if "i18n" in text or "thai/english copy" in text:
            return "orchestra", "multi-agent-waves"
        if "observability" in text or "logs traces metrics" in text or "incident evidence" in text:
            return "orchestra", "multi-agent-waves"
        if "parallel-with-worktree" in text:
            return "orchestra", "multi-agent-waves"
        if any(token in text for token in ["auth", "permission", "role"]):
            return "orchestra", "security-gate"
        if any(token in text for token in ["premium", "responsive", "accessible", "polish", "screenshot"]):
            return "visual-ui-enhancement", "visual-ui-flow"
        if "data-fetching" in text or "trpc hook" in text:
            return "orchestra", "multi-agent-waves"
        if "typo" in text:
            return "direct-edit", "direct-edit"
        if "routing decision" in text:
            return "orchestra", "multi-agent-waves"
        if "วางแผน" in message and "ทำต่อ" in message:
            return "orchestra", "quick-plan-chain"
        return "orchestra", "multi-agent-waves"

    level2_checked = 0
    for scenario in scenarios:
        if not isinstance(scenario, dict):
            continue
        expected_owner = scenario.get("expected_owner")
        expected_route = scenario.get("expected_route")
        owner, route = lightweight_route(scenario.get("user_message", ""))
        level2_checked += 1
        if owner != expected_owner or route != expected_route:
            errors.append(
                f"{scenario_path}: Level 2 route mismatch for {scenario.get('id')}: "
                f"expected {expected_owner}/{expected_route}, got {owner}/{route}"
            )
    if level2_checked < 5:
        errors.append(f"{scenario_path}: Level 2 behavior validation checked too few scenarios")

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
