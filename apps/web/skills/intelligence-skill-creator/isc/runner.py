from __future__ import annotations
import shutil
import datetime as _dt
from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional, Dict, Any

from .evaluator import evaluate_from_path
from .models import EvaluationReport, PatchProposal
from .improver import HeuristicImprover, LLMImprover, apply_diff
from .registry import resolve_skill_dir

@dataclass
class RunResult:
    workspace: Path
    final_report: EvaluationReport
    proposals: List[PatchProposal]


def resolve_repo_root(start: Path | None = None) -> Path:
    """Find the SmartSpec repo root regardless of whether ISC is running from a copied workspace."""
    probe = (start or Path(__file__)).resolve()
    if probe.is_file():
        probe = probe.parent

    for candidate in (probe, *probe.parents):
        if (candidate / "apps" / "web" / "package.json").exists() and (candidate / ".git").exists():
            return candidate

    for candidate in (probe, *probe.parents):
        if (candidate / "apps" / "web" / "package.json").exists():
            return candidate

    return probe if probe.is_dir() else probe.parent


def make_workspace(project_root: Path, skill_name: str) -> Path:
    ts = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%d_%H%M%S")
    ws = project_root / "runs" / "workspaces" / skill_name / ts
    ws.mkdir(parents=True, exist_ok=True)
    src = resolve_skill_dir(skill_name)
    dst = ws / "skills" / skill_name
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(
        src,
        dst,
        dirs_exist_ok=True,
        ignore=shutil.ignore_patterns("runs", "__pycache__", ".git", ".venv", "venv", "node_modules"),
    )
    return ws

def iterate_improve(project_root: Path, skill_name: str, mode: str="auto", rounds: int=3,
                   ask_user: bool=False, allow_test_expansion: bool=False,
                   llm_override: Optional[dict]=None,
                   research_cfg: Optional[Dict[str, Any]]=None,
                   safety_cfg: Optional[Dict[str, Any]]=None,
                   improvement_request: str="") -> RunResult:
    ws = make_workspace(project_root, skill_name)
    skill_dir = ws / "skills" / skill_name
    proposals: List[PatchProposal] = []
    report = evaluate_from_path(skill_dir)

    for _ in range(max(1, rounds)):
        if report.pass_rate >= 1.0:
            break
        if mode == "heuristic":
            proposal = HeuristicImprover().propose_patch(skill_name, report)
        elif mode == "llm":
            proposal = LLMImprover(ask_user=ask_user, allow_test_expansion=allow_test_expansion,
                                   llm_override=llm_override, research_cfg=research_cfg, safety_cfg=safety_cfg,
                                   improvement_request=improvement_request
                                  ).propose_patch(skill_name, report)
        else:
            try:
                proposal = LLMImprover(ask_user=ask_user, allow_test_expansion=allow_test_expansion,
                                       llm_override=llm_override, research_cfg=research_cfg, safety_cfg=safety_cfg,
                                       improvement_request=improvement_request
                                      ).propose_patch(skill_name, report)
            except Exception:
                proposal = HeuristicImprover().propose_patch(skill_name, report)
        proposals.append(proposal)
        if not proposal.patch_payload.strip():
            break
        apply_diff(skill_dir, proposal.patch_payload)
        report = evaluate_from_path(skill_dir)

    return RunResult(ws, report, proposals)
