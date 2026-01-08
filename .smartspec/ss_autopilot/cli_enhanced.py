"""
Enhanced CLI entry point for SmartSpec Autopilot.

This is an enhanced version with better platform support, user-friendly status.md,
and simplified commands.

Usage:
    ss-autopilot run --spec-id spec-core-001-authentication
    ss-autopilot run --spec-id spec-core-001-authentication --platform kilo
    ss-autopilot status --spec-id spec-core-001-authentication
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Dict, Any, Optional

from .platform import detect_platform, get_platform_info
from .router import decide_next
from .commands import build_slash_command, default_out_dir
from .status_writer import StatusWriter
from .report_enhancer import ReportEnhancer
from .workflow_loader import WorkflowCatalog, WorkflowNotFoundError
from .error_handler import with_error_handling, safe_file_read


def load_config() -> Dict[str, Any]:
    """Load configuration from .autopilot/config.yaml or config/autopilot.yaml"""
    import yaml
    
    # Try .autopilot/config.yaml first (project-specific)
    config_paths = [
        Path(".autopilot/config.yaml"),
        Path("config/autopilot.yaml"),
        Path(__file__).parent.parent.parent / "config" / "autopilot.yaml"
    ]
    
    for config_path in config_paths:
        if config_path.exists():
            with open(config_path) as f:
                return yaml.safe_load(f)
    
    # Default config
    return {
        "paths": {
            "workflows_dir": ".smartspec/workflows",
            "scripts_dir": ".smartspec/scripts",
            "reports_dir": ".spec/reports",
            "ai_specs_dir": "ai_specs"
        },
        "runner": {
            "type": "ide"
        },
        "commands": {
            "kilo": {
                # P0: keys here are workflow file stems (workflow_key)
                "smartspec_generate_spec": "/smartspec_generate_spec.md --platform kilo",
                "smartspec_generate_plan": "/smartspec_generate_plan.md --platform kilo",
                "smartspec_generate_tasks": "/smartspec_generate_tasks.md --platform kilo",
                "smartspec_implement_tasks": "/smartspec_implement_tasks.md --platform kilo",
                "smartspec_sync_tasks_checkboxes": "/smartspec_sync_tasks_checkboxes.md --platform kilo",
                "smartspec_test_suite_runner": "/smartspec_test_suite_runner.md --platform kilo",
                "smartspec_quality_gate": "/smartspec_quality_gate.md --platform kilo",
            }
        },
        "defaults": {
            "lang": "auto",
            "json": True
        }
    }


def read_spec_state(spec_id: str, reports_dir: Path) -> Dict[str, Any]:
    """Read state for a specific spec from reports"""
    state = {
        "spec_id": spec_id,
        "has_spec": False,
        "has_plan": False,
        "has_tasks": False,
        "did_implement": False,
        "did_sync_tasks": False,
        "did_test_suite": False,
        "did_quality_gate": False,
        "errors": []
    }
    
    # Check if spec file exists
    spec_file = Path("specs") / spec_id / "spec.md"
    state["has_spec"] = spec_file.exists()
    
    # Check if plan exists
    plan_file = Path("specs") / spec_id / "plan.md"
    state["has_plan"] = plan_file.exists()
    
    # Check if tasks exist
    tasks_file = Path("specs") / spec_id / "tasks.md"
    state["has_tasks"] = tasks_file.exists()
    state["tasks_path"] = str(tasks_file)
    state["spec_path"] = str(spec_file)
    
    # Check implementation report
    implement_report = reports_dir / "implement-tasks" / spec_id / "summary.json"
    if implement_report.exists():
        import json
        try:
            with open(implement_report) as f:
                data = json.load(f)
                if data.get("status") == "success":
                    state["did_implement"] = True
                else:
                    state["errors"].append(f"Implementation failed: {data.get('error', 'Unknown error')}")
        except:
            pass
    
    # Check sync report
    sync_report = reports_dir / "sync-tasks" / spec_id / "summary.json"
    if sync_report.exists():
        import json
        try:
            with open(sync_report) as f:
                data = json.load(f)
                if data.get("status") == "success":
                    state["did_sync_tasks"] = True
        except:
            pass
    
    return state


def get_completed_steps(state: Dict[str, Any]) -> list[str]:
    """Get list of completed steps"""
    completed = []
    if state.get("has_spec"):
        completed.append("SPEC")
    if state.get("has_plan"):
        completed.append("PLAN")
    if state.get("has_tasks"):
        completed.append("TASKS")
    if state.get("did_implement"):
        completed.append("IMPLEMENT")
    if state.get("did_sync_tasks"):
        completed.append("SYNC_TASKS")
    if state.get("did_test_suite"):
        completed.append("TEST_SUITE")
    if state.get("did_quality_gate"):
        completed.append("QUALITY_GATE")
    return completed


def cmd_run(args):
    """Run Autopilot to determine next step and generate status.md"""
    
    # Load config
    cfg = load_config()
    
    # Detect platform
    platform = args.platform or detect_platform()
    print(f"🔍 Detected platform: {platform}")
    
    # Get platform info
    platform_info = get_platform_info(platform)
    print(f"📱 Platform: {platform_info['name']}")
    
    # Read spec state
    reports_dir = Path(cfg["paths"]["reports_dir"])
    state = read_spec_state(args.spec_id, reports_dir)
    state["platform"] = platform
    
    # Determine next step
    next_step = decide_next(state)
    print(f"🎯 Next step: {next_step}")
    
    if next_step == "STOP":
        print("✅ All steps completed!")
        
        # Write complete status
        ai_specs_dir = cfg["paths"]["ai_specs_dir"]
        writer = StatusWriter(ai_specs_dir)
        writer.write_complete_status(args.spec_id, platform)
        
        print(f"📄 Status written to: {ai_specs_dir}/status.md")
        return
    
    # Generate command
    # P0: workflow_key = filename stem of the workflow in `.smartspec/workflows/`
    workflow_key = {
        "SPEC": "smartspec_generate_spec",
        "PLAN": "smartspec_generate_plan",
        "TASKS": "smartspec_generate_tasks",
        "IMPLEMENT": "smartspec_implement_tasks",
        "SYNC_TASKS": "smartspec_sync_tasks_checkboxes",
        "TEST_SUITE": "smartspec_test_suite_runner",
        "QUALITY_GATE": "smartspec_quality_gate",
    }.get(next_step)
    
    # Build command
    if workflow_key:
        outdir = default_out_dir(workflow_key, args.spec_id)
        
        # Build args based on workflow
        if workflow_key == "smartspec_implement_tasks":
            cmd_args = [state["tasks_path"], "--apply", "--out", outdir, "--json"]
        elif workflow_key == "smartspec_sync_tasks_checkboxes":
            cmd_args = [state["tasks_path"], "--out", outdir, "--json", "--apply"]
        else:
            cmd_args = [state["spec_path"], "--out", outdir, "--json"]
        
        command = build_slash_command(cfg, platform, workflow_key, *cmd_args)
    else:
        command = "# No command generated"
    
    print(f"📝 Command: {command}")
    
    # Write status.md
    ai_specs_dir = cfg["paths"]["ai_specs_dir"]
    writer = StatusWriter(ai_specs_dir)
    completed_steps = get_completed_steps(state)
    
    writer.write_status(
        spec_id=args.spec_id,
        current_step=next_step,
        command=command,
        completed_steps=completed_steps,
        errors=state.get("errors", []),
        platform=platform
    )
    
    print(f"📄 Status written to: {ai_specs_dir}/status.md")
    print(f"\n✨ Next: Open {ai_specs_dir}/status.md to see what to do next!")


def cmd_status(args):
    """Show current status"""
    
    # Load config
    cfg = load_config()
    
    # Read status.md
    ai_specs_dir = Path(cfg["paths"]["ai_specs_dir"])
    status_file = ai_specs_dir / "status.md"
    
    if not status_file.exists():
        print(f"❌ No status file found. Run: ss-autopilot run --spec-id {args.spec_id}")
        return
    
    # Print status
    with open(status_file) as f:
        print(f.read())


def cmd_init(args):
    """Initialize Autopilot in current project"""
    
    print("🚀 Initializing SmartSpec Autopilot...")
    
    # Create .autopilot directory
    autopilot_dir = Path(".autopilot")
    autopilot_dir.mkdir(exist_ok=True)
    print(f"✅ Created {autopilot_dir}/")
    
    # Create logs directory
    logs_dir = autopilot_dir / "logs"
    logs_dir.mkdir(exist_ok=True)
    print(f"✅ Created {logs_dir}/")
    
    # Create ai_specs directory
    ai_specs_dir = Path("ai_specs")
    ai_specs_dir.mkdir(exist_ok=True)
    print(f"✅ Created {ai_specs_dir}/")
    
    # Copy default config
    import yaml
    import shutil
    
    default_config_path = Path(__file__).parent.parent.parent / "config" / "autopilot.yaml"
    project_config_path = autopilot_dir / "config.yaml"
    
    if default_config_path.exists() and not project_config_path.exists():
        shutil.copy(default_config_path, project_config_path)
        print(f"✅ Created {project_config_path}")
    
    # Create state.json
    state_file = autopilot_dir / "state.json"
    if not state_file.exists():
        import json
        initial_state = {
            "version": "1.0",
            "specs": {}
        }
        with open(state_file, "w") as f:
            json.dump(initial_state, f, indent=2)
        print(f"✅ Created {state_file}")
    
    print("\n✨ Autopilot initialized successfully!")
    print("\n📚 Next steps:")
    print("  1. Run: ss-autopilot run --spec-id <your-spec-id>")
    print("  2. Open: ai_specs/status.md")
    print("  3. Follow the instructions!")


def cmd_workflow(args):
    """Execute a workflow by name (e.g., /smartspec_project_copilot)"""

    # Normalize workflow name
    workflow_name = args.workflow
    if workflow_name.startswith('/'):
        workflow_name = workflow_name[1:]

    # Remove .md extension if present
    if workflow_name.endswith('.md'):
        workflow_name = workflow_name[:-3]

    print(f"🔍 Executing workflow: {workflow_name}")

    # Show additional arguments if any
    additional_args = getattr(args, 'additional_args', [])
    if additional_args:
        print(f"📝 Additional arguments: {' '.join(additional_args)}")
    
    # Load workflow catalog (include legacy workflows like autopilot_*)
    catalog = WorkflowCatalog(include_legacy=True)
    
    # Check for errors
    if catalog.errors:
        print("⚠️  Workflow catalog has errors:")
        for error in catalog.errors[:5]:
            print(f"  - {error}")
    
    # Find the workflow
    try:
        result = catalog.get(workflow_name)

        # Handle wrapped result from @with_error_handling decorator
        if isinstance(result, dict):
            if result.get("success") and "result" in result:
                workflow = result["result"]
            elif result.get("error"):
                print(f"❌ Error loading workflow: {result.get('message')}")
                sys.exit(1)
            else:
                workflow = result
        else:
            workflow = result

    except WorkflowNotFoundError:
        # Try to find by slug
        for w in catalog.workflows.values():
            if w.metadata.get('workflow_slug') == f"/{workflow_name}":
                workflow = w
                break
        else:
            print(f"❌ Workflow not found: {workflow_name}")
            print(f"\nAvailable workflows:")
            for name in sorted(catalog.workflows.keys())[:20]:
                print(f"  - {name}")
            if len(catalog.workflows) > 20:
                print(f"  ... and {len(catalog.workflows) - 20} more")
            sys.exit(1)
    
    # Display workflow info
    print(f"\n📋 {workflow.metadata.get('title', workflow.name)}")
    if workflow.metadata.get('description'):
        desc = workflow.metadata['description'][:200]
        print(f"   {desc}...")
    
    # Check workflow metadata
    purpose = workflow.metadata.get('purpose', '')
    if purpose:
        print(f"\n🎯 Purpose: {purpose[:100]}...")
    
    # Read workflow content
    result = safe_file_read(str(workflow.path))
    if result.get("error"):
        print(f"❌ Failed to read workflow: {result.get('message')}")
        sys.exit(1)
    
    content = result["content"]
    
    # Write to output if specified
    out_path = args.out
    if out_path:
        out_file = Path(out_path)
        out_file.parent.mkdir(parents=True, exist_ok=True)
        with open(out_file, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"\n✅ Workflow written to: {out_path}")
    
    # Print relevant sections based on aspect
    aspect = getattr(args, 'aspect', None) or "all"

    if aspect in ("all", "status"):
        print(f"\n📊 Workflow Status: READY")
        print(f"   Category: {workflow.metadata.get('category', 'unknown')}")
        print(f"   Version: {workflow.metadata.get('version', 'unknown')}")

    if aspect in ("all", "roadmap"):
        # Look for invocation section
        if "## Invocation" in content or "### CLI" in content:
            print(f"\n🛣️  To use this workflow, run:")
            # Extract example command
            import re
            example_match = re.search(r'```bash\s*(.+?)```', content, re.DOTALL)
            if example_match:
                cmd = example_match.group(1).strip()
                print(f"   {cmd}")

    # **IMPORTANT**: In a real Kilo CLI implementation, this workflow content
    # should be sent to an LLM (Claude/OpenRouter) along with the user's arguments
    additional_args = getattr(args, 'additional_args', [])
    if additional_args:
        print(f"\n💡 TO IMPLEMENT: This workflow should be sent to LLM with:")
        print(f"   - Workflow content: {len(content)} characters")
        print(f"   - User input: {' '.join(additional_args)}")
        print(f"   - Platform: {getattr(args, 'platform', 'kilo')}")
        print(f"\n🚧 Currently, this script only displays workflow metadata.")
        print(f"   For full execution, integrate with LLM Gateway.")

    print(f"\n✅ Workflow processed successfully!")
    return 0


def main():
    """Main CLI entry point"""

    # SPECIAL CASE: If first arg starts with '/', treat it as a workflow command
    # This allows direct invocation like: python -m ss_autopilot.cli_enhanced /workflow_name --args
    if len(sys.argv) > 1 and sys.argv[1].startswith('/'):
        # Parse workflow command - but allow unknown args to pass through as workflow arguments
        workflow_parser = argparse.ArgumentParser(add_help=False)
        workflow_parser.add_argument("workflow", help="Workflow name")

        # Collect remaining arguments as workflow_args (for things like positional question, etc.)
        # We'll parse known flags but keep unknown ones
        known_args, remaining_args = workflow_parser.parse_known_args(sys.argv[1:])

        # Add remaining args as additional_args attribute
        known_args.additional_args = remaining_args

        # Parse known optional flags from remaining args
        optional_parser = argparse.ArgumentParser(add_help=False)
        optional_parser.add_argument("--aspect", choices=["status", "roadmap", "security", "ci", "ui", "perf", "all"], help="Aspect to show")
        optional_parser.add_argument("--out", help="Output file path")
        optional_parser.add_argument("--lang", choices=["en", "th", "auto"], help="Language")
        optional_parser.add_argument("--platform", choices=["kilo", "antigravity", "claude", "ci"], help="Platform")
        optional_parser.add_argument("--json", action="store_true", help="Output as JSON")

        optional_args, final_remaining = optional_parser.parse_known_args(remaining_args)

        # Merge all parsed args
        for key, value in vars(optional_args).items():
            if value is not None:
                setattr(known_args, key, value)
            elif not hasattr(known_args, key):
                setattr(known_args, key, None)

        # Store truly unknown args (after parsing both workflow name and known flags)
        known_args.additional_args = final_remaining

        try:
            result = cmd_workflow(known_args)
            sys.exit(0 if result is None else result)
        except Exception as e:
            print(f"❌ Workflow execution failed: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)

    parser = argparse.ArgumentParser(
        description="SmartSpec Autopilot - Automated workflow orchestration",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Initialize Autopilot in current project
  ss-autopilot run --spec-id <spec-id> --init

  # Run Autopilot to determine next step
  ss-autopilot run --spec-id spec-core-001-authentication

  # Run with specific platform
  ss-autopilot run --spec-id spec-core-001-authentication --platform kilo

  # Show current status
  ss-autopilot status --spec-id spec-core-001-authentication

  # Execute a workflow directly
  ss-autopilot /workflow_name --out output.txt
"""
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # init command
    parser_init = subparsers.add_parser("init", help="Initialize Autopilot in current project")
    parser_init.set_defaults(func=cmd_init)

    # run command
    parser_run = subparsers.add_parser("run", help="Run Autopilot to determine next step")
    parser_run.add_argument("--spec-id", required=True, help="Spec ID (e.g., spec-core-001-authentication)")
    parser_run.add_argument("--platform", choices=["kilo", "antigravity", "claude"], help="Platform (auto-detect if not specified)")
    parser_run.set_defaults(func=cmd_run)

    # status command
    parser_status = subparsers.add_parser("status", help="Show current status")
    parser_status.add_argument("--spec-id", required=True, help="Spec ID")
    parser_status.set_defaults(func=cmd_status)

    # workflow command (for Kilo slash commands like /smartspec_project_copilot)
    parser_workflow = subparsers.add_parser("workflow", help="Execute a workflow by name", add_help=False)
    parser_workflow.add_argument("workflow", help="Workflow name (with or without leading / and .md)")
    parser_workflow.add_argument("--aspect", choices=["status", "roadmap", "security", "ci", "ui", "perf", "all"], help="Aspect to show")
    parser_workflow.add_argument("--out", help="Output file path")
    parser_workflow.set_defaults(func=cmd_workflow)

    # Add common flags that work with any command
    for p in [parser_init, parser_run, parser_status]:
        p.add_argument("--lang", choices=["en", "th", "auto"], help="Language")
        p.add_argument("--platform", choices=["kilo", "antigravity", "claude", "ci"], help="Platform")
        p.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    args.func(args)


if __name__ == "__main__":
    main()
