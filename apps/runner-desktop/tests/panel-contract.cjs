const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const panel = fs.readFileSync(path.join(root, "ui", "panel.js"), "utf8");
const projection = fs.readFileSync(path.join(root, "ui", "companion-state.js"), "utf8");
const chat = fs.readFileSync(path.join(root, "ui", "chat.html"), "utf8");
const workspace = fs.readFileSync(path.join(root, "ui", "workspace.html"), "utf8");

assert.match(panel, /companion_state/);
assert.match(panel, /companion_auth_status/);
assert.match(panel, /companion_chat/);
assert.match(panel, /document\.hidden/);
assert.match(panel, /companion_preferences/);
assert.match(panel, /logout_companion/);
assert.match(panel, /visibilitychange/);
assert.match(panel, /projection-details/);
assert.doesNotMatch(panel, /companionInvoke\("(?:approve|cancel)/);
assert.match(projection, /Progress not reported/);
assert.match(projection, /replaceAll\("&", "&amp;"\)/);
assert.match(chat, /canonical SmartAIHub Chat/);
assert.match(workspace, /No mock task state/);
assert.doesNotMatch(panel, /access_token|refresh_token/);

console.log("runner-panel-contract=ok");
