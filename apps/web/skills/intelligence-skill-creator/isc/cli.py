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
from .native_bundle import (
    NATIVE_TARGET_PLATFORM,
    build_native_skill_files,
    derive_native_skill_plan_from_legacy,
    evaluate_native_skill_bundle,
    improve_native_skill_bundle,
    is_native_skill_bundle,
    migrate_legacy_skill_bundle,
    normalize_skill_plan,
    write_native_skill_bundle,
)
from .runner import resolve_repo_root

PROJECT_ROOT = resolve_repo_root()
RUNS_DIR = PROJECT_ROOT / "runs"
RUNS_DIR.mkdir(exist_ok=True)
DEFAULT_SKILLS_ROOT = PROJECT_ROOT / "apps" / "web" / "skills"
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
    if getattr(args, "target_platform", None) == NATIVE_TARGET_PLATFORM:
        skill_dir = _resolve_native_skill_dir(args.skill, getattr(args, "skills_root", None))
        rep = evaluate_native_skill_bundle(skill_dir)
    else:
        rep = evaluate(args.skill)
    out_path = RUNS_DIR / f"{args.skill}.evaluation.json"
    out_path.write_text(json.dumps(report_to_json_dict(rep), ensure_ascii=False, indent=2), encoding="utf-8")
    console.print(Panel.fit(f"[bold]{args.skill}[/bold]\nPassed {rep.passed}/{rep.total} (pass_rate={rep.pass_rate:.0%})\nSaved: {out_path}"))

def _load_input(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))

def _resolve_skills_root(skills_root: str | None) -> Path:
    return Path(skills_root).resolve() if skills_root else DEFAULT_SKILLS_ROOT

def _resolve_native_skill_dir(skill_name: str, skills_root: str | None = None) -> Path:
    root = _resolve_skills_root(skills_root)
    candidate = root / skill_name
    if candidate.exists():
        return candidate
    try:
        return resolve_skill_dir(skill_name)
    except Exception:
        return candidate

def _extract_skill_plan(payload: dict, args) -> dict:
    plan = dict(payload)
    if args.skill and "skill_name" not in plan:
        plan["skill_name"] = args.skill
    if getattr(args, "target_platform", None):
        plan["target_platform"] = args.target_platform
    if getattr(args, "mirror_skill_md", None) is not None:
        plan["mirror_skill_md"] = args.mirror_skill_md
    return normalize_skill_plan(plan)

def cmd_create(args):
    if args.target_platform != NATIVE_TARGET_PLATFORM:
        raise SystemExit(f"Unsupported target platform: {args.target_platform}")

    payload = _load_input(args.input_file) if args.input_file else {}
    plan = _extract_skill_plan(payload, args)
    skills_root = _resolve_skills_root(args.skills_root)
    bundle_dir = skills_root / plan["skill_name"]
    written = write_native_skill_bundle(bundle_dir, plan, overwrite=bool(args.overwrite))
    out_path = RUNS_DIR / f"{plan['skill_name']}.create.json"
    bundle_topology = "subagent-aware" if "subagents.json" in [path.name for path in written] else "single-agent"
    out_path.write_text(
        json.dumps(
            {
                "skill_name": plan["skill_name"],
                "bundle_dir": str(bundle_dir),
                "files_written": [str(path) for path in written],
                "target_platform": NATIVE_TARGET_PLATFORM,
                "bundle_topology": bundle_topology,
                "created": True,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    console.print(
        Panel.fit(
            f"[bold]{plan['skill_name']}[/bold]\nBundle: {bundle_dir}\nFiles: {len(written)}\nSaved: {out_path}"
        )
    )

def cmd_improve(args):
    improvement_request = str((getattr(args, "improvement_request", None) or "")).strip()
    if getattr(args, "target_platform", None) == NATIVE_TARGET_PLATFORM:
        skills_root = _resolve_skills_root(getattr(args, "skills_root", None))
        skill_dir = _resolve_native_skill_dir(args.skill, getattr(args, "skills_root", None))
        if not skill_dir.exists():
            raise SystemExit(f"Skill directory not found for native improve: {skill_dir}")
        written, rep, plan = improve_native_skill_bundle(skill_dir, improvement_request=improvement_request, overwrite=True)
        out_path = RUNS_DIR / f"{args.skill}.native-improve.json"
        out_path.write_text(
            json.dumps(
                {
                    "skill_name": args.skill,
                    "bundle_dir": str(skill_dir),
                    "files_written": [str(path) for path in written],
                    "pass_rate": rep.pass_rate,
                    "version": plan.get("version"),
                    "bundle_topology": "subagent-aware" if "subagents.json" in [path.name for path in written] else "single-agent",
                    "improvement_request": improvement_request,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        console.print(Panel.fit(
            f"Bundle: {skill_dir}\nFinal: Passed {rep.passed}/{rep.total} (pass_rate={rep.pass_rate:.0%})\nVersion: {plan.get('version')}\nSaved: {out_path}"
        ))
        return

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
    if payload.get("target_platform_hint") and "target_platform_hint" not in research_cfg:
        research_cfg["target_platform_hint"] = payload.get("target_platform_hint")

    safety_cfg = payload.get("safety") or {}

    if mode == "llm" and not llm_override and not load_llm_config_from_env():
        console.print("[red]LLM mode needs env ISC_LLM_* or CLI overrides --llm-* or input_file.llm.*[/red]")
        return

    res = iterate_improve(PROJECT_ROOT, skill_name, mode=mode, rounds=rounds, ask_user=ask_user,
                          allow_test_expansion=allow_test_expansion,
                          llm_override=llm_override if llm_override else None,
                          research_cfg=research_cfg if research_cfg else None,
                          safety_cfg=safety_cfg if safety_cfg else None,
                          improvement_request=improvement_request)

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

def cmd_migrate_legacy(args):
    skills_root = _resolve_skills_root(getattr(args, "skills_root", None))
    source_dir = _resolve_native_skill_dir(args.skill, getattr(args, "skills_root", None))
    if not source_dir.exists():
        raise SystemExit(f"Skill directory not found for migration: {source_dir}")
    written = migrate_legacy_skill_bundle(source_dir, source_dir if args.in_place else skills_root / args.skill)
    rep = evaluate_native_skill_bundle(source_dir if args.in_place else skills_root / args.skill)
    out_path = RUNS_DIR / f"{args.skill}.migration.json"
    out_path.write_text(
        json.dumps(
            {
                "skill_name": args.skill,
                "source_dir": str(source_dir),
                "target_dir": str(source_dir if args.in_place else skills_root / args.skill),
                "files_written": [str(path) for path in written],
                "pass_rate": rep.pass_rate,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    console.print(Panel.fit(f"Source: {source_dir}\nPass rate: {rep.pass_rate:.0%}\nSaved: {out_path}"))

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
    sp=sub.add_parser("evaluate"); sp.add_argument("--skill", required=True); sp.add_argument("--target-platform", choices=["agents_python", "legacy_platform", "dual"]); sp.add_argument("--skills-root"); sp.set_defaults(fn=cmd_evaluate)

    sp=sub.add_parser("create")
    sp.add_argument("--input-file")
    sp.add_argument("--skill")
    sp.add_argument("--target-platform", choices=["agents_python"], required=True)
    sp.add_argument("--skills-root")
    sp.add_argument("--overwrite", action="store_true")
    sp.add_argument("--mirror-skill-md", action="store_true")
    sp.set_defaults(fn=cmd_create)

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
    sp.add_argument("--improvement-request")
    sp.add_argument("--target-platform", choices=["agents_python","legacy_platform","dual"])
    sp.add_argument("--skills-root")
    sp.set_defaults(fn=cmd_improve)

    sp=sub.add_parser("migrate-legacy")
    sp.add_argument("--skill", required=True)
    sp.add_argument("--skills-root")
    sp.add_argument("--in-place", action="store_true")
    sp.set_defaults(fn=cmd_migrate_legacy)

    sp=sub.add_parser("apply"); sp.add_argument("--skill", required=True); sp.add_argument("--latest", action="store_true"); sp.set_defaults(fn=cmd_apply)
    return p

def main():
    args = build_parser().parse_args()
    if args.cmd=="improve" and not args.skill and not args.input_file:
        raise SystemExit("Either --skill or --input-file is required for improve.")
    args.fn(args)

if __name__ == "__main__":
    main()
