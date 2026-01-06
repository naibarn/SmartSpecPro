#!/usr/bin/env python3
"""Generate a Shields endpoint JSON badge from a policy snapshot.

Input:  policy_snapshot.json (from scripts/ci/policy_snapshot.py)
Output: badges/policy.json (schemaVersion=1)

Message focuses on the most important runtime safety flags:
- write approval required (autoApproveNonstream == false AND approvalTools includes workspace_write_file)
- write token required (mcp.writeTokenRequired == true, if present)
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict, Optional


def _bool(v: Any) -> Optional[bool]:
    if isinstance(v, bool):
        return v
    return None


def color_for(approval_required: Optional[bool], token_required: Optional[bool]) -> str:
    # Conservative coloring
    if approval_required is True and token_required is True:
        return "brightgreen"
    if approval_required is True and token_required in (True, None):
        return "green"
    if approval_required is True and token_required is False:
        return "yellow"
    if approval_required is False:
        return "red"
    return "lightgrey"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="_cov/policy_snapshot.json")
    ap.add_argument("--out", dest="out", default="_cov/badges/policy.json")
    ap.add_argument("--label", default="policy")
    args = ap.parse_args()

    if not os.path.exists(args.inp):
        print(f"ERROR: missing {args.inp}")
        return 2

    with open(args.inp, "r", encoding="utf-8") as f:
        pol = json.load(f)

    proxy = (pol or {}).get("proxy") or {}
    approval = (proxy.get("approval") or {})
    approval_tools = approval.get("approvalTools") or []
    auto_approve_nonstream = _bool(approval.get("autoApproveNonstream"))

    # approval required if auto approve is off AND the write tool is in approvalTools
    approval_required: Optional[bool] = None
    if auto_approve_nonstream is not None:
        approval_required = (auto_approve_nonstream is False) and ("workspace_write_file" in approval_tools)

    mcp = (pol or {}).get("mcp") or {}
    token_required = _bool(mcp.get("writeTokenRequired"))

    # Build message
    a = "approval:on" if approval_required is True else ("approval:off" if approval_required is False else "approval:n/a")
    t = "token:on" if token_required is True else ("token:off" if token_required is False else "token:n/a")
    msg = f"{a} {t}"

    badge = {"schemaVersion": 1, "label": args.label, "message": msg, "color": color_for(approval_required, token_required)}

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(badge, f, ensure_ascii=False)

    note_path = os.path.splitext(args.out)[0] + ".txt"
    with open(note_path, "w", encoding="utf-8") as f:
        f.write(f"message={msg}\napproval_required={approval_required}\ntoken_required={token_required}\n")

    print(f"Wrote {args.out}: {msg}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
