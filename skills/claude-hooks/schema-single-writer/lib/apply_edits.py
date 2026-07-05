#!/usr/bin/env python3
"""Idempotent edits for the Orchestra schema single-writer hook installer.

Applies three things safely (re-runnable, backs up before writing):
  1. .claude/settings.json          -> add the PreToolUse schema hook
  2. .claude/settings.local.json    -> set "model": "opus"
  3. skills/orchestra/SKILL.md       -> 2 reference rows + STOP row + wave markers
"""
import json, os, sys, shutil, time

repo = sys.argv[1] if len(sys.argv) > 1 else "."
ts = time.strftime("%Y%m%d-%H%M%S")
changed, skipped, warned = [], [], []


def backup(path):
    if os.path.exists(path):
        b = f"{path}.bak.{ts}"
        shutil.copy2(path, b)
        return b
    return None


# ---------- 1. settings.json : add hook ----------
sp = os.path.join(repo, ".claude/settings.json")
data = {}
if os.path.exists(sp):
    try:
        data = json.load(open(sp))
    except Exception:
        data = {}
hooks = data.setdefault("hooks", {})
pre = hooks.setdefault("PreToolUse", [])
already = any(
    any(h.get("command", "").endswith("schema-single-writer.sh") for h in e.get("hooks", []))
    for e in pre
)
if already:
    skipped.append("settings.json hook (already present)")
else:
    backup(sp)
    pre.append({
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{"type": "command", "command": "bash .claude/hooks/schema-single-writer.sh"}],
    })
    os.makedirs(os.path.dirname(sp), exist_ok=True)
    json.dump(data, open(sp, "w"), indent=2)
    changed.append("settings.json (+PreToolUse schema hook)")

# ---------- 2. settings.local.json : model opus ----------
slp = os.path.join(repo, ".claude/settings.local.json")
d2 = {}
if os.path.exists(slp):
    try:
        d2 = json.load(open(slp))
    except Exception:
        d2 = {}
if d2.get("model") == "opus":
    skipped.append("settings.local.json model (already opus)")
else:
    backup(slp)
    prev = d2.get("model")
    new = {"model": "opus"}
    for k, v in d2.items():
        if k != "model":
            new[k] = v
    os.makedirs(os.path.dirname(slp), exist_ok=True)
    json.dump(new, open(slp, "w"), indent=2)
    if prev and prev != "opus":
        warned.append(f"settings.local.json model was '{prev}', set to 'opus' (backup saved)")
    changed.append("settings.local.json (model=opus)")

# ---------- 3. SKILL.md : rows + markers ----------
skill = os.path.join(repo, "skills/orchestra/SKILL.md")
if not os.path.exists(skill):
    warned.append("skills/orchestra/SKILL.md not found - skipped all SKILL edits")
else:
    txt = open(skill, encoding="utf-8").read()
    orig = txt

    edits = [
        # (marker_if_present, anchor, replacement)
        (
            "references/schema-single-writer.md",
            "| `references/model-routing.md` | Always before dispatching a sub-agent, building Task Packets, or selecting inline fallback model behavior |",
            "| `references/model-routing.md` | Always before dispatching a sub-agent, building Task Packets, or selecting inline fallback model behavior |\n"
            "| `references/schema-single-writer.md` | Whenever a task may change any DB schema or migration (Prisma / Drizzle / Alembic) |\n"
            "| `references/rate-limit-safety.md` | Before every multi-wave dispatch, and whenever an agent returns a throttling/overload error |",
        ),
        (
            "A wave returns rate-limit / 429 / overload errors",
            "| Circular dependency detected in wave plan (Step 3) | Report cycle with affected task names, STOP until resolved |",
            "| Circular dependency detected in wave plan (Step 3) | Report cycle with affected task names, STOP until resolved |\n"
            "| A wave returns rate-limit / 429 / overload errors, or agents stall | Halt dispatch, preserve partials, report per `references/rate-limit-safety.md`, STOP - do not blind-retry |",
        ),
        (
            "Schema single-writer lock (REQUIRED before dispatch)",
            "**Dispatch by platform:**\n\n| Platform | Method |",
            "**Schema single-writer lock (REQUIRED before dispatch):** If this wave will run\n"
            "parallel agents, `touch orchestra/.wave-active` before the first Task call. This marks\n"
            "the wave active so the `schema-single-writer` hook blocks any concurrent DB\n"
            "schema/migration edit. Never place a schema/migration edit inside a wave - do schema\n"
            "changes serially from the conductor between waves (see `references/schema-single-writer.md`).\n\n"
            "**Dispatch by platform:**\n\n| Platform | Method |",
        ),
        (
            "Release the schema lock",
            "## Step 5: Result Integration\n\nRead `references/result-integration.md`.",
            "## Step 5: Result Integration\n\n"
            "**Release the schema lock:** once the wave's agents have all returned and their results\n"
            "are collected, `rm -f orchestra/.wave-active`. Any DB schema/migration change required by\n"
            "this wave's results (including `NEEDS_SCHEMA_CHANGE` escalations) is applied here,\n"
            "serially, by the conductor - before the next wave is dispatched.\n\n"
            "Read `references/result-integration.md`.",
        ),
    ]

    applied = 0
    for marker, anchor, repl in edits:
        if marker in txt:
            continue  # already applied
        if anchor in txt:
            txt = txt.replace(anchor, repl, 1)
            applied += 1
        else:
            warned.append(f"SKILL.md anchor not found for: {marker[:40]}... (manual edit needed)")

    if txt != orig:
        backup(skill)
        open(skill, "w", encoding="utf-8").write(txt)
        changed.append(f"SKILL.md ({applied} edit(s))")
    else:
        skipped.append("SKILL.md (all edits already present)")

# ---------- report ----------
print("  CHANGED:")
for c in changed:
    print(f"    + {c}")
if not changed:
    print("    (nothing - already up to date)")
if skipped:
    print("  SKIPPED (idempotent):")
    for s in skipped:
        print(f"    = {s}")
if warned:
    print("  WARNINGS:")
    for w in warned:
        print(f"    ! {w}")
