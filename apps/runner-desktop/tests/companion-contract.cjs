const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const config = JSON.parse(
  fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8")
);
const capability = JSON.parse(
  fs.readFileSync(path.join(root, "src-tauri", "capabilities", "default.json"), "utf8")
);
const companionCapability = JSON.parse(
  fs.readFileSync(path.join(root, "src-tauri", "capabilities", "companion.json"), "utf8")
);
const companionHtml = fs.readFileSync(path.join(root, "ui", "companion.html"), "utf8");
const companionJs = fs.readFileSync(path.join(root, "ui", "companion.js"), "utf8");
const rust = fs.readFileSync(path.join(root, "src-tauri", "src", "main.rs"), "utf8");

const windows = new Map(config.app.windows.map(window => [window.label, window]));
assert.ok(windows.has("main"));
assert.equal(windows.get("companion").url, "companion.html");
assert.equal(windows.get("companion").visible, false);
assert.equal(windows.get("companion").skipTaskbar, true);
assert.deepEqual(capability.windows, ["main"]);
assert.deepEqual(companionCapability.windows, ["companion"]);
assert.deepEqual(companionCapability.permissions, ["core:default", "notification:allow-notify"]);
assert.ok(!capability.permissions.some(permission => permission.startsWith("notification:")));

for (const command of [
  "runner_status",
  "companion_projection_status",
  "companion_preferences",
  "set_companion_preferences",
  "hide_companion",
  "snap_companion_to_edge",
  "notify_companion",
  "set_companion_expanded",
]) {
  assert.match(companionJs, new RegExp(`invoke\\(\\"${command}\\"`));
}
for (const command of [
  "runner_status",
  "companion_projection_status",
  "companion_preferences",
  "set_companion_preferences",
  "show_companion",
  "hide_companion",
  "toggle_companion",
  "open_runner_settings",
  "snap_companion_to_edge",
  "notify_companion",
  "companion_auth_status",
  "start_companion_auth",
  "poll_companion_auth",
  "companion_state",
  "logout_companion",
]) {
  assert.match(rust, new RegExp(`\\b${command}\\b`));
}

assert.match(companionHtml, /data-tauri-drag-region/);
assert.match(companionHtml, /aria-expanded/);
assert.match(companionHtml, /id="expanded-panel"[^>]*hidden/);
assert.match(companionHtml, /runner-companion\.v1/);
assert.match(companionJs, /document\.hidden/);
assert.match(companionJs, /set_companion_expanded/);
assert.match(fs.readFileSync(path.join(root, "ui", "companion.css"), "utf8"), /\.expanded-panel\[hidden\]\s*\{\s*display:\s*none/);
assert.match(companionJs, /RUNNER_COMPANION_PROJECTION_INVALID/);

console.log("runner-companion-contract=ok");
