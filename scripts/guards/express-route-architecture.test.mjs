import test from "node:test";
import assert from "node:assert/strict";
import { evaluateChangedRoutes, findAddedRoutes, isGuardedSourceFile } from "./express-route-architecture.mjs";

test("allows edits to existing Express route handlers without treating them as new routes", () => {
  const before = 'app.get("/v1/status", oldHandler);';
  const after = 'app.get("/v1/status", asyncHandler);';
  assert.deepEqual(findAddedRoutes("apps/web/server/routes/example.ts", before, after), []);
});

test("detects single-line and multiline new route registrations", () => {
  assert.deepEqual(findAddedRoutes("routes.ts", "", 'app.get("/v1/new", handler);'), [{ method: "get", path: "/v1/new" }]);
  assert.deepEqual(findAddedRoutes("routes.ts", "", 'router.post(\n  "/v1/new",\n  handler,\n);'), [{ method: "post", path: "/v1/new" }]);
  assert.deepEqual(findAddedRoutes("routes.ts", "", 'app.route("/v1/new").get(handler);'), [{ method: "get", path: "/v1/new" }]);
  assert.deepEqual(findAddedRoutes("routes.ts", "", 'const model = await cache.get("tenant-key");'), []);
});

test("supports exact, current exceptions and rejects expired or broad exceptions", () => {
  const change = { file: "apps/web/server/routes/example.ts", before: "", after: 'app.get("/v1/new", handler);' };
  const exception = { file: change.file, method: "get", path: "/v1/new", owner: "api-team", reason: "compatibility window", expires: "2026-12-31" };
  const accepted = evaluateChangedRoutes([change], [exception], "2026-10-17");
  assert.equal(accepted.violations.length, 0);
  assert.equal(accepted.invalidExceptions.length, 0);

  const rejected = evaluateChangedRoutes([change], [{ ...exception, expires: "2026-01-01" }], "2026-10-17");
  assert.equal(rejected.violations.length, 1);
  assert.equal(rejected.invalidExceptions.length, 1);

  const broad = evaluateChangedRoutes([change], [{ ...exception, path: "/*" }], "2026-10-17");
  assert.equal(broad.violations.length, 1);
  assert.equal(broad.invalidExceptions.length, 1);
});

test("ignores tests and only guards production Express server sources", () => {
  assert.equal(isGuardedSourceFile("apps/web/server/routes/contentProtection.ts"), true);
  assert.equal(isGuardedSourceFile("apps/web/server/routes/__tests__/contentProtection.test.ts"), false);
  assert.equal(isGuardedSourceFile("apps/web/server/routes/example.test.ts"), false);
  assert.equal(isGuardedSourceFile("apps/web/server/scripts/generateReport.ts"), true);
});
