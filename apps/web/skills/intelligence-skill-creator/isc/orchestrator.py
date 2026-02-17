from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any

from .models import EvaluationReport, PatchProposal
from .llm import OpenAICompatibleClient
from .researcher import plan_research_topics, run_research, format_research_snippets
from .agents import triage_failures, plan_patch_strategy, rank_research_snippets
from .validator import validate_patch
from .registry import read_text
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

    def propose_patch(self, skill_name: str, report: EvaluationReport) -> PatchProposal:
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

        manifest = read_text(skill_name, "manifest.json")
        skill_code = read_text(skill_name, "skill.py")
        tests = read_text(skill_name, "tests.json")

        failed = [r for r in report.results if not r.passed]
        failure_block = "\n".join([f"- {r.test_id}: missing={r.missing} output={r.output}" for r in failed]) or "(all passed)"

        system = f"You are an expert engineer. Output ONLY a unified diff that edits files under skills/{skill_name}/. No markdown, no explanations."
        user = f"""manifest.json:
{manifest}

CURRENT skill.py:
{skill_code}

tests.json:
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

TEST POLICY:
{test_policy}

Hard requirements:
- Keep respond(input_text: str, context=None) -> str
- skill.py uses stdlib only
- Make tests pass
Return unified diff ONLY.
"""

        diff = self.llm.chat([{"role":"system","content":system},{"role":"user","content":user}]).strip()

        scfg = self.cfg.safety
        vr = validate_patch(skill_name, diff,
            restrict_under_skills=bool(scfg.get("restrict_paths_under_skills", True)),
            disallow_new_deps_in_skill_py=bool(scfg.get("disallow_new_deps_in_skill_py", True)),
            require_respond_signature=bool(scfg.get("require_respond_signature", True)),
        )
        if not vr.ok:
            fix = f"""Patch validation failed.
Errors: {vr.errors}
Warnings: {vr.warnings}

Revise the patch to satisfy validation. Return unified diff ONLY.
Original patch:
{diff}
"""
            diff = self.llm.chat([{"role":"system","content":"Return unified diff only."},{"role":"user","content":fix}]).strip()

        return PatchProposal(
            skill_name=skill_name,
            created_at_iso=__import__("datetime").datetime.utcnow().replace(microsecond=0).isoformat()+"Z",
            rationale=f"orchestrated patch; strategy={strategy}; triage={triage.categories}; topics={topics[:self.cfg.max_topics]}",
            unified_diff=diff
        )
