from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any

from .models import EvaluationReport, PatchProposal
from .llm import OpenAICompatibleClient
from .researcher import plan_research_topics, run_research, format_research_snippets
from .agents import triage_failures, plan_patch_strategy, rank_research_snippets
from .validator import validate_patch
from .registry import read_manifest_text, read_text, resolve_skill_files
from .decider import ChoiceQuestion, ask_choice

@dataclass
class OrchestratorConfig:
    max_topics: int = 10
    max_results_per_topic: int = 3
    max_snippet_chars: int = 6000
    allow_test_expansion: bool = False
    ask_user: bool = False
    safety: Dict[str, Any] = None

class Orchestrator:
    def __init__(self, llm: OpenAICompatibleClient, cfg: OrchestratorConfig):
        self.llm = llm
        self.cfg = cfg
        self.cfg.safety = self.cfg.safety or {
            "restrict_paths_under_skills": True,
            "disallow_new_deps_in_skill_py": True,
            "require_respond_signature": True
        }

    def propose_patch(self, skill_name: str, report: EvaluationReport, improvement_request: str = "") -> PatchProposal:
        triage = triage_failures(report)
        strategy = plan_patch_strategy(self.llm, triage)

        topics = plan_research_topics(skill_name, report, max_topics=self.cfg.max_topics, llm=self.llm)
        hits = run_research(topics, max_results_per_topic=self.cfg.max_results_per_topic)
        snippets = format_research_snippets(hits, max_chars=self.cfg.max_snippet_chars)
        ranked = rank_research_snippets(self.llm, snippets)

        test_policy = "do-not-edit-tests"
        if self.cfg.allow_test_expansion and self.cfg.ask_user:
            choice = ask_choice(ChoiceQuestion(
                question="ให้ ISC สามารถแก้/เพิ่ม tests.json เพื่อกัน edge case ได้ไหม?",
                choices=["no, keep tests as-is", "yes, allow editing tests.json (carefully)"],
                allow_other=True
            ))
            if choice.startswith("yes"):
                test_policy = "allow-edit-tests"
            elif choice.startswith("no"):
                test_policy = "do-not-edit-tests"
            else:
                test_policy = f"custom: {choice}"

        try:
            manifest = read_manifest_text(skill_name)
        except FileNotFoundError:
            try:
                manifest = read_text(skill_name, "manifest.json")
            except FileNotFoundError:
                manifest = "Manifest missing."

        files = resolve_skill_files(skill_name)
        if files.code_path is not None:
            skill_code = files.code_path.read_text(encoding="utf-8")
        else:
            try:
                skill_code = read_text(skill_name, "skill.py")
            except FileNotFoundError:
                skill_code = "Code missing."
                    
        try:
            tests = read_text(skill_name, "tests/tests.json")
        except FileNotFoundError:
            try:
                tests = read_text(skill_name, "tests.json")
            except FileNotFoundError:
                tests = "Tests missing."

        failed = [r for r in report.results if not r.passed]
        failure_block = "\n".join(
            [
                f"- {r.test_id}: categories={r.categories} reasons={r.reasons} missing={r.missing} output={r.output}"
                for r in failed
            ]
        ) or "(all passed)"

        system = (
            "You are an expert engineer. Output ONLY valid JSON. "
            "Keys must be file paths relative to the skill root (e.g. 'python/skill.py' "
            "or 'tests/tests.json'), values are the FULL replacement string for that file. "
            "No markdown, no unified diffs, no explanations."
        )
        user = f"""skill manifest:
{manifest}

CURRENT skill.py:
{skill_code}

tests:
{tests}

FAILURES:
{failure_block}

TRIAGE:
categories={triage.categories}
hints={triage.hints}

STRATEGY:
{strategy}

RANKED RESEARCH:
{ranked}

REPORT DIMENSIONS:
{report.dimension_failures}

USER REQUEST:
{improvement_request or "(no additional user request provided)"}

TEST POLICY:
{test_policy}

Hard requirements:
- Keep a valid public respond(...) entrypoint intact
- skill code uses stdlib only
- Make tests pass
- Implement the user's requested improvement when provided
Return JSON ONLY. Do not use markdown code blocks.
"""

        payload = self.llm.chat([{"role":"system","content":system},{"role":"user","content":user}]).strip()
        payload = payload.removeprefix("```json").removeprefix("```").removesuffix("```").strip()

        scfg = self.cfg.safety
        vr = validate_patch(skill_name, payload,
            restrict_under_skills=bool(scfg.get("restrict_paths_under_skills", True)),
            disallow_new_deps_in_skill_py=bool(scfg.get("disallow_new_deps_in_skill_py", True)),
            require_respond_signature=bool(scfg.get("require_respond_signature", True)),
        )
        if not vr.ok:
            fix = f"""Patch validation failed.
Errors: {vr.errors}
Warnings: {vr.warnings}

Revise the patch to satisfy validation. Return JSON ONLY.
Original payload:
{payload}
"""
            payload = self.llm.chat([{"role":"system","content":"Return JSON only."},{"role":"user","content":fix}]).strip()
            payload = payload.removeprefix("```json").removeprefix("```").removesuffix("```").strip()

        return PatchProposal(
            skill_name=skill_name,
            created_at_iso=__import__("datetime").datetime.utcnow().replace(microsecond=0).isoformat()+"Z",
            rationale=f"orchestrated patch; strategy={strategy}; triage={triage.categories}; topics={topics[:self.cfg.max_topics]}",
            patch_payload=payload
        )
