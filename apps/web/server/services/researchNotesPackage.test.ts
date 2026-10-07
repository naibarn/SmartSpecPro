import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { validateSpaasPackage } from "../../../../packages/spaas-standard/src/index";
import type { ManifestSupportContext, PackageEntry } from "../../../../packages/spaas-standard/src/model";

const packageRoot = join(process.cwd(), "mini-apps/research-notes");
const support: ManifestSupportContext = {
  supportedApiVersions: ["spaas.smartaihub.app/v1"],
  supportedSchemaVersions: ["1.0"],
  supportedRequiredFeatures: [],
  supportedOptionalFeatures: [],
  extensions: [],
};

function readEntries(path = packageRoot): PackageEntry[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((item) => {
    const fullPath = join(path, item.name);
    if (item.isDirectory()) return readEntries(fullPath);
    if (!item.isFile()) throw new Error(`unexpected package entry: ${relative(packageRoot, fullPath)}`);
    return [{ path: relative(packageRoot, fullPath).split("\\").join("/"), kind: "file" as const, bytes: readFileSync(fullPath) }];
  });
}

describe("Research Notes portable package", () => {
  it("builds a stable SPAAS digest and leaves runtime/migration checks explicitly pending", () => {
    const entries = readEntries();
    const manifest = readFileSync(join(packageRoot, "app.manifest.yaml"));
    const first = validateSpaasPackage({ manifest, entries, support, profile: "offline-package" });
    const second = validateSpaasPackage({ manifest, entries: [...entries].reverse(), support, profile: "offline-package" });
    expect(first.status).toBe("needs_context");
    expect(first.digest?.value).toMatch(/^spaas-package-v1:sha256:[a-f0-9]{64}$/);
    expect(second.digest?.value).toBe(first.digest?.value);
    expect(first.stages.find((stage) => stage.stage === "V1")?.status).toBe("passed");
    expect(first.stages.find((stage) => stage.stage === "V2")?.status).toBe("passed");
    expect(first.stages.find((stage) => stage.stage === "V4")?.status).toBe("passed");
    expect(first.stages.find((stage) => stage.stage === "V5")?.status).toBe("not_evaluated");
    expect(first.stages.find((stage) => stage.stage === "V6")?.status).toBe("not_evaluated");
  });

  it("exposes only authenticated procedures and never accepts caller user or tenant authority", () => {
    const actions = JSON.parse(readFileSync(join(packageRoot, "actions.json"), "utf8")) as {
      transport: { authentication: string; callerMaySetTenantOrUserId: boolean };
      actions: Array<{ id: string; input: string[]; inputSchema: { additionalProperties: boolean; properties: Record<string, unknown> } }>;
    };
    expect(actions.transport.authentication).toBe("authenticated-platform-session");
    expect(actions.transport.callerMaySetTenantOrUserId).toBe(false);
    expect(actions.actions.map(({ id }) => id)).toContain("notes.summary.request");
    expect(actions.actions.flatMap(({ input }) => input)).not.toContain("tenantId");
    expect(actions.actions.flatMap(({ input }) => input)).not.toContain("userId");
    expect(actions.actions.every(({ inputSchema }) => inputSchema.additionalProperties === false)).toBe(true);
    expect(actions.actions.flatMap(({ inputSchema }) => Object.keys(inputSchema.properties))).not.toContain("tenantId");
    expect(actions.actions.flatMap(({ inputSchema }) => Object.keys(inputSchema.properties))).not.toContain("userId");
  });

  it("keeps deployment and UAT explicitly pending until an authorized environment exists", () => {
    const deployment = JSON.parse(readFileSync(join(packageRoot, "deployment.json"), "utf8")) as {
      state: string;
      target: { environment: string; environmentId: string | null; baseUrl: string | null };
      release: { migration: { status: string } };
    };
    const smokePlan = readFileSync(join(packageRoot, "SMOKE-TEST-PLAN.md"), "utf8");
    expect(deployment.state).toBe("PREPARED_NOT_DEPLOYED");
    expect(deployment.target).toMatchObject({ environment: "UNSELECTED", environmentId: null, baseUrl: null });
    expect(deployment.release.migration.status).toBe("NOT_APPLIED");
    expect(smokePlan).toContain("Status: prepared only.");
    expect(smokePlan).toContain("NOT_RUN");
  });
});
