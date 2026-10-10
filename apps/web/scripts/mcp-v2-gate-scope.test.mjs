import test from "node:test";
import assert from "node:assert/strict";
import { requiresMcpV2Gates } from "./mcp-v2-gate-scope.mjs";

const flags = "apps/web/shared/featureFlags.ts";

test("UI-only mascot flag edits do not inherit MCP gates", () => {
  assert.equal(requiresMcpV2Gates([flags, "apps/web/client/src/components/AssistantMascot.tsx"], "--- a/apps/web/shared/featureFlags.ts\n+++ b/apps/web/shared/featureFlags.ts\n+  livingMascotDualSurface: false,"), false);
});

test("MCP source changes keep all MCP gates", () => {
  assert.equal(requiresMcpV2Gates([flags, "apps/web/server/_core/mcpRegistry.ts"]), true);
});

test("MCP and browser flag changes keep all MCP gates", () => {
  assert.equal(requiresMcpV2Gates([flags], "+  mcpOAuth: false,"), true);
  assert.equal(requiresMcpV2Gates([flags], "+  browserTool: false,"), true);
});

test("unrecognized shared flag edits fail closed", () => {
  assert.equal(requiresMcpV2Gates([flags], "+  someOtherFlag: false,"), true);
  assert.equal(requiresMcpV2Gates([flags], ""), true);
});
