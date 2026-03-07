from __future__ import annotations
import argparse, json
from pathlib import Path
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from .registry import list_skills, load_manifest, resolve_skill_dir
from .evaluator import evaluate, report_to_json_dict
from .runner import iterate_improve
from .llm import load_llm_config_from_env
from .proposals import apply_patch_payload, save_patch_proposal

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RUNS_DIR = PROJECT_ROOT / "runs"
RUNS_DIR.mkdir(exist_ok=True)
console = Console()

def cmd_list(_args):
    skills = list_skills()
    t = Table(title="Installed Skills")
    t.add_column("Folder", style="cyan")
    t.add_column("Name")
    t.add_column("Version")
    t.add_column("Tags")
    for s in skills:
        m = load_manifest(s)
        t.add_row(s, m.name, m.version, ", ".join(m.tags or []))
    console.print(t)

def cmd_evaluate(args):
    rep = evaluate(args.skill)
    out_path = RUNS_DIR / f"{args.skill}.evaluation.json"
    out_path.write_text(json.dumps(report_to_json_dict(rep), ensure_ascii=False, indent=2), encoding="utf-8")
    console.print(Panel.fit(f"[bold]{args.skill}[/bold]\nPassed {rep.passed}/{rep.total} (pass_rate={rep.pass_rate:.0%})\nSaved: {out_path}"))

def _load_input(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))

def cmd_improve(args):
    payload = _load_input(args.input_file) if args.input_file else {}
    skill_name = payload.get("skill_name") or args.skill
    mode = payload.get("mode") or args.mode
    rounds = int(payload.get("rounds") or args.rounds)
    ask_user = bool(payload.get("ask_user") if "ask_user" in payload else args.ask_user)
    allow_test_expansion = bool(payload.get("allow_test_expansion") if "allow_test_expansion" in payload else args.allow_test_expansion)

    llm_payload = payload.get("llm") or {}
    llm_override = {
        "base_url": llm_payload.get("base_url") or args.llm_base_url,
        "api_key": llm_payload.get("api_key") or args.llm_api_key,
        "model": llm_payload.get("model") or args.llm_model,
        "temperature": llm_payload.get("temperature"),
        "timeout_s": llm_payload.get("timeout_s"),
    }
    llm_override = {k:v for k,v in llm_override.items() if v not in (None,"")}

    research_cfg = payload.get("research") or {}
    if args.max_topics is not None: research_cfg["max_topics"]=args.max_topics
    if args.max_results_per_topic is not None: research_cfg["max_results_per_topic"]=args.max_results_per_topic
    if args.max_snippet_chars is not None: research_cfg["max_snippet_chars"]=args.max_snippet_chars

    safety_cfg = payload.get("safety") or {}

    if mode == "llm" and not llm_override and not load_llm_config_from_env():
        console.print("[red]LLM mode needs env ISC_LLM_* or CLI overrides --llm-* or input_file.llm.*[/red]")
        return

    res = iterate_improve(PROJECT_ROOT, skill_name, mode=mode, rounds=rounds, ask_user=ask_user,
                          allow_test_expansion=allow_test_expansion,
                          llm_override=llm_override if llm_override else None,
                          research_cfg=research_cfg if research_cfg else None,
                          safety_cfg=safety_cfg if safety_cfg else None)

    props_dir = RUNS_DIR / "proposals" / skill_name
    for p in res.proposals:
        save_patch_proposal(props_dir, p, {
            "workspace": str(res.workspace),
            "mode": mode,
            "rounds": rounds,
            "llm_override": llm_override
        })

    console.print(Panel.fit(
        f"Workspace: {res.workspace}\nFinal: Passed {res.final_report.passed}/{res.final_report.total} (pass_rate={res.final_report.pass_rate:.0%})\nSaved proposals: {props_dir}"
    ))

def cmd_apply(args):
    props_dir = RUNS_DIR / "proposals" / args.skill
    proposal_files = sorted(props_dir.glob("*.json")) if props_dir.exists() else []
    proposal_files = [p for p in proposal_files if not p.name.endswith(".meta.json")]
    if not proposal_files:
        console.print("[red]No proposal found. Run improve first.[/red]")
        return
    latest = proposal_files[-1]
    try:
        target_skill_dir = resolve_skill_dir(args.skill)
    except Exception:
        console.print(Panel.fit(f"[red]Apply failed.[/red]\nSkill directory not found for: {args.skill}"))
        return
    try:
        changed = apply_patch_payload(target_skill_dir, latest.read_text(encoding="utf-8"))
    except Exception as e:
        console.print(Panel.fit(f"[red]Apply failed.[/red]\n{e}\nProposal: {latest}"))
        return
    changed_lines = "\n".join(str(p.relative_to(target_skill_dir)) for p in changed) or "(none)"
    console.print(Panel.fit(f"[green]Applied latest proposal.[/green]\nProposal: {latest}\nFiles:\n{changed_lines}"))

def build_parser():
    p = argparse.ArgumentParser(prog="isc", description="Intelligence Skill Creator")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp=sub.add_parser("list"); sp.set_defaults(fn=cmd_list)
    sp=sub.add_parser("evaluate"); sp.add_argument("--skill", required=True); sp.set_defaults(fn=cmd_evaluate)

    sp=sub.add_parser("improve")
    sp.add_argument("--skill", required=False)
    sp.add_argument("--input-file")
    sp.add_argument("--mode", choices=["auto","llm","heuristic"], default="auto")
    sp.add_argument("--rounds", type=int, default=3)
    sp.add_argument("--ask-user", action="store_true")
    sp.add_argument("--allow-test-expansion", action="store_true")
    sp.add_argument("--llm-base-url")
    sp.add_argument("--llm-api-key")
    sp.add_argument("--llm-model")
    sp.add_argument("--max-topics", type=int)
    sp.add_argument("--max-results-per-topic", type=int)
    sp.add_argument("--max-snippet-chars", type=int)
    sp.set_defaults(fn=cmd_improve)

    sp=sub.add_parser("apply"); sp.add_argument("--skill", required=True); sp.add_argument("--latest", action="store_true"); sp.set_defaults(fn=cmd_apply)
    return p

def main():
    args = build_parser().parse_args()
    if args.cmd=="improve" and not args.skill and not args.input_file:
        raise SystemExit("Either --skill or --input-file is required for improve.")
    args.fn(args)

if __name__ == "__main__":
    main()
