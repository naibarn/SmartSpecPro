import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../../../../");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf-8");

describe("Feature 186 PostgreSQL Node worker deployment wiring", () => {
  it("keeps the dedicated worker in the production Compose topology", () => {
    const compose = read("docker-compose.full.yml");

    expect(compose).toContain("  smartspec-node-worker:");
    expect(compose).toContain("start:feature-186-node-worker");
    expect(compose).toContain("FEATURE_186_HARD_CUTOVER=");
    expect(compose).toContain("FEATURE_186_POSTGRES_PYTHON_WORKER=");
    expect(compose).toContain("FEATURE_186_SYSTEM_TENANT_ID=");
    expect(compose).toContain("JWT_SECRET=");
    expect(compose).toContain("NODE_SERVER_INTERNAL_URL=http://smartspec-web:3000");
  });

  it("keeps the dedicated worker installed and restartable under systemd", () => {
    const service = read("scripts/smartspec-node-worker.service");
    const installer = read("scripts/install-autostart-v2.sh");
    const restartScript = read("scripts/restart-prod.sh");

    expect(service).toContain("server/jobs/postgresNodeJobWorker.ts");
    expect(service).toContain("WantedBy=smartspec.target");
    expect(read("systemd/smartspec-node-worker.service")).toContain(
      "server/jobs/postgresNodeJobWorker.ts",
    );
    expect(installer).toContain('"smartspec-node-worker.service"');
    expect(installer).toContain('systemctl enable "$service"');
    expect(restartScript).toContain("node-worker");
    expect(restartScript).toContain("smartspec-node-worker");
  });

  it("keeps the opt-in Python PostgreSQL-pull worker and shared internal auth wired", () => {
    const compose = read("docker-compose.full.yml");

    expect(compose).toContain("  smartspec-python-job-worker:");
    expect(compose).toContain("- feature186");
    expect(compose).toContain('"-m", "app.workers.postgres_job_worker"');
    expect(compose).toContain("JOB_CONTROL_PLANE_URL=http://smartspec-web:3000/api/internal/job-control-plane");
    expect(compose).toContain("SMARTSPEC_WEB_GATEWAY_TOKEN=${SMARTSPEC_WEB_GATEWAY_TOKEN:-}");
    expect(compose).toContain("FEATURE_186_SYSTEM_TENANT_ID=${FEATURE_186_SYSTEM_TENANT_ID:-}");
  });

  it("does not poll or claim jobs when the hard-cutover flag is disabled", () => {
    const worker = read("apps/web/server/jobs/postgresNodeJobWorker.ts");

    expect(worker).toContain('process.env.FEATURE_186_HARD_CUTOVER === "true"');
    expect(worker).toContain("PostgreSQL Node job worker disabled");
    expect(worker).toContain("refreshAppRuntimeConfigCache");
  });
});
