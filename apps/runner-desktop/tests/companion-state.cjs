const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "ui", "companion-state.js"),
  "utf8",
);
const context = { window: { __TAURI__: { core: { invoke() {} } } } };
vm.runInNewContext(source, context);
const api = context.window.SmartAIHubCompanion;

assert.equal(api.normalizeCompanionState(null), null);
const state = api.normalizeCompanionState({
  schemaVersion: "runner-companion.v1",
  devices: [{ id: "device-a" }],
  tasks: [{ status: "cancel_requested", progress: { percent: null } }],
});
assert.equal(state.devices.length, 1);
assert.equal(state.approvals.length, 0);
assert.equal(state.evidence.length, 0);
assert.equal(api.statusLabel("unknown_outcome"), "Unknown outcome");
assert.equal(api.progressLabel(state.tasks[0]), "Progress not reported");
assert.equal(api.taskStatusClass("cancel_requested"), "state-cancel-requested");
assert.equal(api.escapeText('<script data="x">&'), "&lt;script data=&quot;x&quot;&gt;&amp;");

console.log("runner-companion-state=ok");
