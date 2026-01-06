#!/usr/bin/env python3
"""Generate a Shields endpoint JSON badge for the write-approval system.

Input:  policy_snapshot.json (from scripts/ci/policy_snapshot.py)
Output: badges/approval.json (schemaVersion=1)

We intentionally keep logic conservative:
- If approval is required for workspace_write_file and auto-approve is OFF -> approval:on
- If approval is disabled OR auto-approve is ON for non-stream -> approval:off
- If schema missing -> approval:n/a

Also reports store type (redis/memory/unknown) if present.
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict, Optional


def _bool(v: Any) -> Optional[bool]:
    return v if isinstance(v, bool) else None


def _str(v: Any) -> Optional[str]:
    return v if isinstance(v, str) else None


def color_for(approval_required: Optional[bool], store: Optional[str]) -> str:
    if approval_required is True:
        if (store or "").lower() == "redis":
            return "brightgreen"
        # memory store is OK but less robust in production
        if store:
            return "green"
        return "green"
    if approval_required is False:
        return "orange"
    return "lightgrey"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="_cov/policy_snapshot.json")
    ap.add_argument("--out", dest="out", default="_cov/badges/approval.json")
    ap.add_argument("--label", default="approval")
    args = ap.parse_args()

    if not os.path.exists(args.inp):
        print(f"ERROR: missing {args.inp}")
        return 2

    with open(args.inp, "r", encoding="utf-8") as f:
        pol = json.load(f)

    proxy = (pol or {}).get("proxy") or {}
    approval = (proxy.get("approval") or {})

    store = _str(approval.get("store")) or _str(approval.get("storeType")) or "unknown"
    auto_approve_nonstream = _bool(approval.get("autoApproveNonstream"))
    tools = approval.get("approvalTools") or []
    enabled = _bool(approval.get("enabled"))

    approval_required: Optional[bool] = None

    if enabled is False:
        approval_required = False
    elif auto_approve_nonstream is not None:
        # required if auto-approve is OFF and write tool is in approval tools
        approval_required = (auto_approve_nonstream is False) and ("workspace_write_file" in tools)

    a = "approval:on" if approval_required is True else ("approval:off" if approval_required is False else "approval:n/a")
    s = f"store:{store}"
    msg = f"{a} {s}"

    badge = {"schemaVersion": 1, "label": args.label, "message": msg, "color": color_for(approval_required, store)}

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(badge, f, ensure_ascii=False)

    note_path = os.path.splitext(args.out)[0] + ".txt"
    with open(note_path, "w", encoding="utf-8") as f:
        f.write(
            "\n".join(
                [
                    f"message={msg}",
                    f"approval_required={approval_required}",
                    f"store={store}",
                    f"enabled={enabled}",
                    f"autoApproveNonstream={auto_approve_nonstream}",
                    f"approvalTools={tools}",
                ]
            )
            + "\n"
        )

    print(f"Wrote {args.out}: {msg}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
