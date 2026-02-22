#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const progressPath = resolve(root, "specs/feature/021-CanvasEditor/implementation-progress.md");
const blockedPath = resolve(root, "specs/feature/021-CanvasEditor/implementation-blocked-tasks.md");

const progress = readFileSync(progressPath, "utf8");
const blockedTasks = readFileSync(blockedPath, "utf8");

const hasBlockedRows = /\|\s*blocked\s*\|/.test(blockedTasks);
const progressStillFlagsBlocked = progress.includes("(blocked)");
const progressTracksDropped = progress.includes("dropped-with-rationale");
const blockedTracksDropped = blockedTasks.includes("dropped-with-rationale");

if (progressStillFlagsBlocked && !hasBlockedRows) {
  console.error(
    "Doc sync failed: progress still marks '(blocked)' but blocked task queue has no active blocked rows.",
  );
  process.exit(1);
}

if (blockedTracksDropped && !progressTracksDropped) {
  console.error(
    "Doc sync failed: blocked task queue marks dropped-with-rationale but progress does not reflect it.",
  );
  process.exit(1);
}

console.log("CanvasEditor doc sync check passed.");
