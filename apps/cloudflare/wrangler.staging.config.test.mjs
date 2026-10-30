import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readConfig = (name) => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), "utf8"));
const config = readConfig("wrangler.staging.jsonc");
const namespaceOnly = readConfig("wrangler.staging.namespace-only.jsonc");
const nodeImage = "registry.cloudflare.com/f3fb0b6858e186fcc36be105bfa00243/smartspec-staging-55e4a9dcc9d9-node-http@sha256:03a6cc55482417c12bc2b45a0c93dd28423fdf21e1da7716637fe13213dc2324";
const pythonImage = "registry.cloudflare.com/f3fb0b6858e186fcc36be105bfa00243/smartspec-staging-55e4a9dcc9d9-python-http@sha256:75cb7d4b203d29a14e19348d4f35e1990e861aaada3c0442ffc9d120eddfc300";

test("Full HTTP Staging declares the existing isolated Worker and application ingress", () => {
  assert.equal(config.name, "smartspec-cloudflare-staging");
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, false);
  assert.equal(config.vars.CLOUDFLARE_ENVIRONMENT, "staging");
  assert.equal(config.vars.CLOUDFLARE_APPLICATION_HTTP_TRAFFIC, "staging-full-http-v1");
  assert.equal(config.vars.CLOUDFLARE_CONTAINER_POLICY, "on-demand");
  assert.equal(config.account_id, "f3fb0b6858e186fcc36be105bfa00243");
  assert.equal(config.vpc_networks[0].binding, "DATABASE_NETWORK");
  assert.equal(config.vpc_networks[0].tunnel_id, "191d047e-674a-48f4-b105-b37269c2dad6");
  assert.deepEqual(config.vpc_networks, [{ binding: "DATABASE_NETWORK", tunnel_id: "191d047e-674a-48f4-b105-b37269c2dad6" }]);
  assert.deepEqual(config.durable_objects.bindings, [
    { name: "NODE_HTTP", class_name: "StagingNodeHttpContainer" },
    { name: "PYTHON_HTTP", class_name: "StagingPythonHttpContainer" },
  ]);
});

test("Full HTTP Staging attaches digest-pinned images to matching exported Container classes", () => {
  assert.deepEqual(config.containers, [
    { name: "smartspec-staging-55e4a9dcc9d9-node-http", class_name: "StagingNodeHttpContainer", scheduling_policy: "durable_object", images: { node: { image: nodeImage } } },
    { name: "smartspec-staging-55e4a9dcc9d9-python-http", class_name: "StagingPythonHttpContainer", scheduling_policy: "durable_object", images: { python: { image: pythonImage } } },
  ]);
  assert.deepEqual(config.exports, {
    StagingNodeHttpContainer: { type: "durable-object", storage: "sqlite", container: "smartspec-staging-55e4a9dcc9d9-node-http" },
    StagingPythonHttpContainer: { type: "durable-object", storage: "sqlite", container: "smartspec-staging-55e4a9dcc9d9-python-http" },
    ApplicationHttpBridge: { type: "worker" },
    ApplicationDatabaseBridge: { type: "worker" },
  });
  assert.equal(Object.hasOwn(config, "migrations"), false, "Wrangler exports and migrations are mutually exclusive");
  assert.match(config.containers[0].images.node.image, /@sha256:[a-f0-9]{64}$/);
  assert.match(config.containers[1].images.python.image, /@sha256:[a-f0-9]{64}$/);
});

test("application APIs use Worker-first routing and registered container health probes", () => {
  for (const path of ["/api", "/api/*", "/trpc", "/trpc/*", "/auth", "/auth/*", "/ws*", "/widget/v1/ws"])
    assert.ok(config.assets.run_worker_first.includes(path), `${path} must stay on the Worker route`);
  assert.equal(config.containers[0].images.node.image, nodeImage);
  assert.equal(config.containers[1].images.python.image, pythonImage);
  // Ports and health endpoints are enforced by ApplicationHttpContainer:
  // Node :3000/readyz, Python :8000/health.
});

test("namespace-only staging remains available separately without application resources", () => {
  assert.equal(namespaceOnly.name, config.name);
  assert.equal(namespaceOnly.vars.CLOUDFLARE_ENVIRONMENT, "staging");
  assert.equal(Object.hasOwn(namespaceOnly, "containers"), false);
  assert.equal(Object.hasOwn(namespaceOnly, "vpc_networks"), false);
  assert.equal(Object.hasOwn(namespaceOnly, "exports"), false);
  assert.equal(namespaceOnly.vars.CLOUDFLARE_ACTIVATION, "disabled");
});
