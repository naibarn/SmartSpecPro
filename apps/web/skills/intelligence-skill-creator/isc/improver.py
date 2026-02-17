from __future__ import annotations
import difflib
import datetime as _dt
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Protocol, Dict, Any

from .models import EvaluationReport, PatchProposal
from .registry import read_text
from .llm import load_llm_config_from_env, merge_llm_config, OpenAICompatibleClient
from .validator import validate_patch
from .orchestrator import Orchestrator, OrchestratorConfig

class BaseImprover(Protocol):
    def propose_patch(self, skill_name: str, report: EvaluationReport) -> PatchProposal:
        ...

@dataclass
class HeuristicImprover:
    def propose_patch(self, skill_name: str, report: EvaluationReport) -> PatchProposal:
        original = read_text(skill_name, "skill.py")
        failed = [r for r in report.results if not r.passed]
        if not failed:
            return PatchProposal(skill_name, _dt.datetime.utcnow().replace(microsecond=0).isoformat()+"Z",
                                 "All tests passed; no patch proposed.", "")
        patched = original
        if "ISC AUTO PATCH" not in patched:
            patched += """\n\n# --- ISC AUTO PATCH (heuristic) ---\n\ndef _isc_format_steps(steps):\n    return '\\n'.join([f'{i+1}. {s}' for i, s in enumerate(steps)])\n"""

        diff = "".join(difflib.unified_diff(
            original.splitlines(True), patched.splitlines(True),
            fromfile=f"skills/{skill_name}/skill.py (before)",
            tofile=f"skills/{skill_name}/skill.py (after)",
        ))
        return PatchProposal(skill_name, _dt.datetime.utcnow().replace(microsecond=0).isoformat()+"Z",
                             f"Heuristic patch. Failed tests: {[r.test_id for r in failed]}", diff)

@dataclass
class LLMImprover:
    ask_user: bool = False
    allow_test_expansion: bool = False
    research_cfg: Optional[Dict[str, Any]] = None
    safety_cfg: Optional[Dict[str, Any]] = None
    llm_override: Optional[dict] = None

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
        proposal = orch.propose_patch(skill_name, report)

        vr = validate_patch(skill_name, proposal.unified_diff,
            restrict_under_skills=bool(scfg.get("restrict_paths_under_skills", True)),
            disallow_new_deps_in_skill_py=bool(scfg.get("disallow_new_deps_in_skill_py", True)),
            require_respond_signature=bool(scfg.get("require_respond_signature", True)),
        )
        if not vr.ok:
            raise RuntimeError("Patch failed validator: " + "; ".join(vr.errors))
        return proposal

def apply_diff(project_root: Path, unified_diff: str) -> None:
    res = subprocess.run(["patch","-N","-r","-","-p0"], input=unified_diff, text=True,
                         capture_output=True, cwd=str(project_root))
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or res.stdout.strip() or "patch failed")
