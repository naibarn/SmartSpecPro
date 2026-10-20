import { projectRunnerReleaseCatalog, projectRunnerReleaseRow, runnerReleaseCatalogQuerySchema,
  runnerReleaseTargetKey, type RunnerReleaseCatalogResponse, type RunnerReleaseChannel,
  type RunnerReleasePlatform, type RunnerReleaseArchitecture, type RunnerReleaseProfile } from "../../../packages/shared/src/runnerReleases";
import type { CloudflareEnvironment } from "./contracts";
import type { HyperdriveSqlClient } from "./hyperdrive";
import { withHyperdrivePostgres } from "./postgresClient";

type CatalogFilter = { channel: RunnerReleaseChannel; platform?: RunnerReleasePlatform;
  architecture?: RunnerReleaseArchitecture; profile?: RunnerReleaseProfile };
const FILTERS = ["channel", "platform", "architecture", "profile"] as const;

/** Publication reads use the existing DB directly, never a KV/HTTP cache.
 * The approved Hyperdrive descriptor must have query caching disabled. */
export async function readPublicRunnerReleaseCatalog(client: HyperdriveSqlClient, filter: CatalogFilter): Promise<RunnerReleaseCatalogResponse> {
  const values: string[] = [], predicates = ['"isPublished" = true', '"withdrawnAt" IS NULL', '"validationStatus" = \'valid\''];
  for (const key of FILTERS) if (filter[key]) { values.push(filter[key]!); predicates.push(`"${key}" = $${values.length}`); }
  const rows = await client.unsafe<Record<string, unknown>[]>(`SELECT id,version,platform,architecture,profile,channel,
    "assetKind","fileName","contentType","fileSizeBytes","fileSha256",signature,"contractVersion","manifestJson",
    "validationStatus","validationChecksJson","provenanceJson","releaseNotes","isPublished","publishedAt","withdrawnAt","uploadedAt","updatedAt"
    FROM runner_release_assets WHERE ${predicates.join(" AND ")} ORDER BY "updatedAt" DESC`, values);
  const assets = rows.map(row => {
    if (row.isPublished !== true || row.withdrawnAt != null || row.validationStatus !== "valid") throw new Error("RUNNER_RELEASE_PUBLICATION_INVALID");
    return projectRunnerReleaseRow(row);
  });
  return projectRunnerReleaseCatalog(assets);
}

/** Exact public read slice only. Administration, review and downloads retain
 * their existing authority and storage owner. No Node origin fetch is used. */
export async function handleRunnerReleaseCatalog(request: Request, env: CloudflareEnvironment,
  dependencies: { withDatabase?: typeof withHyperdrivePostgres } = {}): Promise<Response> {
  const reply = (body: unknown, status: number) => new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
  const expiresAt = Date.parse(env.CLOUDFLARE_RUNNER_RELEASE_EXPIRES_AT ?? "");
  if (env.CLOUDFLARE_RUNNER_RELEASE_CATALOG !== "hyperdrive" || !Number.isFinite(expiresAt) || expiresAt <= Date.now() ||
      !env.HYPERDRIVE?.connectionString?.trim()) return reply({ error: "runner_release_catalog_unavailable" }, 503);
  const url = new URL(request.url), latest = url.pathname === "/api/runner-releases/latest";
  if (!["GET", "HEAD"].includes(request.method) || !["/api/runner-releases", "/api/runner-releases/latest"].includes(url.pathname)) {
    return reply({ error: "runner_release_request_invalid" }, 400);
  }
  if (FILTERS.some(key => url.searchParams.getAll(key).length > 1)) return reply({ error: "runner_release_request_invalid" }, 400);
  const parsed = runnerReleaseCatalogQuerySchema.safeParse(Object.fromEntries(FILTERS.flatMap(key => url.searchParams.has(key) ? [[key, url.searchParams.get(key)]] : [])));
  if (!parsed.success) return reply({ error: "runner_release_request_invalid" }, 400);
  const filter = parsed.data;
  if (latest && (!filter.platform || !filter.architecture || !filter.profile)) return reply({ error: "runner_release_target_required" }, 400);
  try {
    const catalog = await (dependencies.withDatabase ?? withHyperdrivePostgres)(env.HYPERDRIVE, client => client.begin(async transaction => {
      await transaction.unsafe("SET TRANSACTION READ ONLY");
      await transaction.unsafe("SET LOCAL statement_timeout = '5000ms'");
      await transaction.unsafe("SET LOCAL lock_timeout = '1000ms'");
      return readPublicRunnerReleaseCatalog(transaction, filter);
    }));
    // Configuration can expire while a connection waits. Never return data
    // after the approved read window; this path does not silently fall back.
    if (Date.now() >= expiresAt) return reply({ error: "runner_release_catalog_unavailable" }, 503);
    if (!latest) return reply(catalog, 200);
    const targetKey = runnerReleaseTargetKey(filter as Required<CatalogFilter>), target = catalog.latestByTarget.find(item => item.targetKey === targetKey);
    return reply({ package: target?.package ?? null, updateBinary: target?.updateBinary ?? null }, 200);
  } catch {
    return reply({ error: "runner_release_catalog_unavailable" }, 503);
  }
}
