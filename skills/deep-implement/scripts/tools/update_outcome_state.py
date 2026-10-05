#!/usr/bin/env python3
"""Record requirement closure evidence separately from implementation checkpoints.

Usage: uv run {plugin_root}/scripts/tools/update_outcome_state.py --state-dir PATH --outcome-json PATH
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from scripts.lib.config import update_outcome_state


def main() -> int:
    parser = argparse.ArgumentParser(description="Record and evaluate outcome closure")
    parser.add_argument("--state-dir", required=True)
    parser.add_argument("--outcome-json", required=True, help="JSON file containing requirement ledger and outcome evidence")
    args = parser.parse_args()
    try:
        outcome = json.loads(Path(args.outcome_json).read_text(encoding="utf-8"))
        state = update_outcome_state(Path(args.state_dir), outcome)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Error: {exc}")
        return 1
    print(state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
