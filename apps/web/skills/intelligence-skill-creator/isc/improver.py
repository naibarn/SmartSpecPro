from __future__ import annotations
import datetime as _dt
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Protocol, Dict, Any

from .models import EvaluationReport, PatchProposal
from .registry import read_text, resolve_skill_files
from .llm import load_llm_config_from_env, merge_llm_config, OpenAICompatibleClient
from .proposals import apply_patch_payload
from .validator import validate_patch
from .orchestrator import Orchestrator, OrchestratorConfig

class BaseImprover(Protocol):
    def propose_patch(self, skill_name: str, report: EvaluationReport) -> PatchProposal:
        ...

@dataclass
class HeuristicImprover:
    def propose_patch(self, skill_name: str, report: EvaluationReport) -> PatchProposal:
        files = resolve_skill_files(skill_name)
        if files.code_path is None:
            original = read_text(skill_name, "skill.py")
            rel_path = "skill.py"
        else:
            original = files.code_path.read_text(encoding="utf-8")
            rel_path = files.code_path.relative_to(files.bundle_dir).as_posix()

        failed = [r for r in report.results if not r.passed]
        if not failed:
            return PatchProposal(skill_name, _dt.datetime.utcnow().replace(microsecond=0).isoformat()+"Z",
                                 "All tests passed; no patch proposed.", "")
        patched = original
        if "ISC AUTO PATCH" not in patched:
            if rel_path.endswith(".py"):
                patched += """\n\n# --- ISC AUTO PATCH (heuristic) ---\n\ndef _isc_format_steps(steps):\n    return '\\n'.join([f'{i+1}. {s}' for i, s in enumerate(steps)])\n"""
            else:
                patched += """\n\n// --- ISC AUTO PATCH (heuristic) ---\n\nfunction _iscFormatSteps(steps) { return steps.map((s, i) => `${i+1}. ${s}`).join('\\n'); }\n"""

        import json
        payload = json.dumps({rel_path: patched})
        return PatchProposal(skill_name, _dt.datetime.utcnow().replace(microsecond=0).isoformat()+"Z",
                             f"Heuristic patch. Failed tests: {[r.test_id for r in failed]}", payload)

@dataclass
class LLMImprover:
    ask_user: bool = False
    allow_test_expansion: bool = False
    research_cfg: Optional[Dict[str, Any]] = None
    safety_cfg: Optional[Dict[str, Any]] = None
    llm_override: Optional[dict] = None
    improvement_request: str = ""

    def propose_patch(self, skill_name: str, report: EvaluationReport) -> PatchProposal:
        env_cfg = load_llm_config_from_env()
        cfg = merge_llm_config(env_cfg, self.llm_override)
        if not cfg:
            raise RuntimeError("LLM config missing. Set env ISC_LLM_* or pass overrides.")
        llm = OpenAICompatibleClient(cfg)

        rcfg = self.research_cfg or {"max_topics":10,"max_results_per_topic":3,"max_snippet_chars":6000}
        scfg = self.safety_cfg or {"restrict_paths_under_skills":True,"disallow_new_deps_in_skill_py":True,"require_respond_signature":True}

        orch = Orchestrator(llm, OrchestratorConfig(
            max_topics=int(rcfg.get("max_topics",10)),
            max_results_per_topic=int(rcfg.get("max_results_per_topic",3)),
            max_snippet_chars=int(rcfg.get("max_snippet_chars",6000)),
            allow_test_expansion=bool(self.allow_test_expansion),
            ask_user=bool(self.ask_user),
            safety=scfg
        ))
        proposal = orch.propose_patch(skill_name, report, self.improvement_request)

        vr = validate_patch(skill_name, proposal.patch_payload,
            restrict_under_skills=bool(scfg.get("restrict_paths_under_skills", True)),
            disallow_new_deps_in_skill_py=bool(scfg.get("disallow_new_deps_in_skill_py", True)),
            require_respond_signature=bool(scfg.get("require_respond_signature", True)),
        )
        if not vr.ok:
            raise RuntimeError("Patch failed validator: " + "; ".join(vr.errors))
        return proposal

def apply_diff(skill_dir: Path, patch_payload: str) -> None:
    apply_patch_payload(skill_dir, patch_payload)
