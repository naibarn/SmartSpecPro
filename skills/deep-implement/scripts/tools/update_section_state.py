#!/usr/bin/env python3
"""Persist and inspect implementation progress without adding an approval gate.

Existing usage is unchanged:
  ... --state-dir PATH --section section-01 --commit-hash SHA

During work (before dispatch/long-running step):
  ... --state-dir PATH --section section-01 --status in_progress --next-action '...'
After a verified protected merge:
  ... --state-dir PATH --section section-01 --merged-main-sha SHA --next-action '...'
Inspect at any time:
  ... --state-dir PATH --show
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from scripts.lib.config import (load_session_config, mutate_session_config,
                                refresh_handoff, HANDOFF_FILE)


def main() -> int:
    parser = argparse.ArgumentParser(description="Update/read durable deep-implement HandOff")
    parser.add_argument("--state-dir", required=True, help="Path to state directory")
    parser.add_argument("--section", help="Section name")
    parser.add_argument("--commit-hash", help="Local commit SHA, after actual commit")
    parser.add_argument("--status", choices=["in_progress", "checkpointed"],
                        help="Section stage; without it, --commit-hash implies checkpointed")
    parser.add_argument("--merged-main-sha", help="Verified integrated Main SHA, after merge")
    parser.add_argument("--review-file", help="Review artifact (optional)")
    parser.add_argument("--next-action", help="Exact next recoverable action")
    parser.add_argument("--gap", action="append", default=[], help="Unresolved gap; repeatable")
    parser.add_argument("--worktree", help="Owned worktree path")
    parser.add_argument("--session-id", help="Reporting session ID (provenance, not a permission gate)")
    parser.add_argument("--resolve-gap", action="append", default=[], help="Mark an existing recorded gap as resolved")
    parser.add_argument("--show", action="store_true", help="Read/repair HANDOFF.md and print it")
    args = parser.parse_args()
    state_dir = Path(args.state_dir)

    if args.show:
        if args.section or args.commit_hash or args.merged_main_sha or args.status:
            parser.error("--show is read-only and cannot be combined with a state update")
        try:
            path = refresh_handoff(state_dir)
            if path is None:
                print(f"Error: No config found in {state_dir}")
                return 1
            print(path.read_text(encoding="utf-8"))
            return 0
        except (OSError, ValueError) as exc:
            print(f"Error: {exc}")
            return 1

    if not args.section:
        parser.error("the following arguments are required: --section")
    # Legacy checkpoint command remains mandatory-commit. For in-progress and
    # post-merge updates a previous checkpoint or an explicit new SHA suffices.
    if not args.commit_hash and args.status != "in_progress" and not args.merged_main_sha:
        parser.error("the following arguments are required: --commit-hash (or --status in_progress)")
    if args.status == "checkpointed" and not args.commit_hash:
        parser.error("--status checkpointed requires --commit-hash")
    if args.merged_main_sha and args.status == "in_progress":
        parser.error("--merged-main-sha cannot be recorded with --status in_progress")

    def apply(config: dict) -> None:
        states = config.setdefault("sections_state", {})
        state = dict(states.get(args.section, {}))
        if args.commit_hash:
            state["checkpoint_sha"] = args.commit_hash
            state["status"] = "checkpointed"
        elif args.status == "in_progress":
            # Never demote an already checkpointed section during restart.
            if state.get("status") != "checkpointed":
                state["status"] = "in_progress"
        if args.merged_main_sha:
            if not state.get("checkpoint_sha"):
                raise ValueError("Cannot record merged SHA without a local checkpoint commit")
            state["merged_main_sha"] = args.merged_main_sha
        if args.review_file:
            state["review_file"] = args.review_file
        if args.worktree is not None:
            state["worktree"] = args.worktree
        if args.session_id is not None:
            state["session_id"] = args.session_id
        if args.next_action is not None:
            state["next_action"] = args.next_action
        states[args.section] = state
        progress = config.setdefault("progress", {})
        progress["active_section"] = args.section
        if args.next_action is not None:
            progress["next_action"] = args.next_action
        if args.worktree is not None:
            progress["worktree"] = args.worktree
        if args.merged_main_sha:
            progress["merged_main_sha"] = args.merged_main_sha
        if args.resolve_gap:
            gaps = progress.setdefault("gaps", [])
            gaps[:] = [gap for gap in gaps if gap not in args.resolve_gap]
        if args.gap:
            # Unique, stable list; unresolved gaps should not disappear at resume.
            gaps = progress.setdefault("gaps", [])
            for gap in args.gap:
                if gap not in gaps:
                    gaps.append(gap)

    try:
        if load_session_config(state_dir) is None:
            print(f"Error: No config found in {state_dir}")
            return 1
        config = mutate_session_config(state_dir, apply, reason=f"section:{args.section}")
    except (OSError, ValueError) as exc:
        print(f"Error: {exc}")
        return 1
    stage = config["sections_state"][args.section].get("status", "pending")
    if stage == "checkpointed":
        print(f"Checkpointed {args.section}: checkpoint_sha={config['sections_state'][args.section].get('checkpoint_sha')}; outcome remains validation-pending")
    else:
        print(f"Progress saved: {args.section}: {stage}")
    print(f"HandOff: {state_dir / HANDOFF_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
