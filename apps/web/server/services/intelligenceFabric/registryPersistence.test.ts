import { describe, expect, it } from "vitest";
import {
  admitPendingReviewDataset,
  admitPendingReviewSource,
  createRegistryPersistence,
  getPendingReviewSource,
  listPendingReviewDatasets,
  RegistryPersistenceError,
  type RegistryPersistenceQuery,
} from "./registryPersistence";

const scope = { tenantId: "tenant-a" } as const;

const source = {
  id: "source-a",
  canonicalSourceId: "thai-flood-feed",
  providerId: "provider-drr",
  independenceGroup: "drr",
  sourceJson: {
    name: "Flood feed",
    sourceType: "API",
    adapterRef: "adapter-drr",
    sourceContractRef: "contract-drr",
    rightsPolicyRef: "rights-drr",
    qualityProfileRef: "quality-drr",
  },
} as const;

const dataset = {
  id: "dataset-a",
  sourceId: "source-a",
  datasetRef: "flood-events",
  version: "2026-10-02",
  datasetJson: { schemaRef: "schema-flood", updateMode: "PERIODIC" },
} as const;

type SourceRow = {
  readonly id: string;
  readonly tenantId: string | null;
  readonly visibility: string;
  readonly canonicalSourceId: string;
  readonly providerId: string;
  readonly independenceGroup: string;
  readonly status: string;
  readonly sourceJson: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

type DatasetRow = {
  readonly id: string;
  readonly sourceId: string;
  readonly tenantId: string | null;
  readonly datasetRef: string;
  readonly version: string;
  readonly status: string;
  readonly datasetJson: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

function harness(overrides: Partial<RegistryPersistenceQuery> = {}) {
  const sources: SourceRow[] = [];
  const datasets: DatasetRow[] = [];
  const now = new Date("2026-10-02T00:00:01.000Z");
  const query: RegistryPersistenceQuery = {
    findSourceById: async input => sources.find(row => row.id === input.id && row.tenantId === input.tenantId),
    findSourceByCanonical: async input => sources.find(row => row.tenantId === input.tenantId && row.canonicalSourceId === input.canonicalSourceId),
    insertSourceIfAbsent: async input => {
      if (sources.some(row => row.id === input.id || (row.tenantId === input.tenantId && row.canonicalSourceId === input.canonicalSourceId))) return undefined;
      const row: SourceRow = { ...input, createdAt: now, updatedAt: now };
      sources.push(row);
      return row;
    },
    listSources: async input => sources.filter(row => row.tenantId === input.tenantId && row.status === "pending_review"),
    findDatasetById: async input => datasets.find(row => row.id === input.id && row.tenantId === input.tenantId),
    findDatasetBySourceReference: async input => datasets.find(row => row.tenantId === input.tenantId && row.sourceId === input.sourceId && row.datasetRef === input.datasetRef && row.version === input.version),
    insertDatasetIfAbsent: async input => {
      if (datasets.some(row => row.id === input.id || (row.sourceId === input.sourceId && row.datasetRef === input.datasetRef && row.version === input.version))) return undefined;
      const row: DatasetRow = { ...input, createdAt: now, updatedAt: now };
      datasets.push(row);
      return row;
    },
    listDatasets: async input => datasets.filter(row => row.tenantId === input.tenantId && row.sourceId === input.sourceId),
    listEvidence: async () => [],
    ...overrides,
  };
  return { query, sources, datasets };
}

describe("Spec 266 pending-review registry persistence", () => {
  it("creates a tenant source only as pending review and reads it through the same tenant", async () => {
    const state = harness();

    const admitted = await admitPendingReviewSource({ query: state.query, scope, source });
    const read = await getPendingReviewSource({ query: state.query, scope, sourceId: source.id });

    expect(admitted).toMatchObject({ created: true, source: { id: source.id, tenantId: "tenant-a", visibility: "tenant", status: "pending_review" } });
    expect(read).toEqual(admitted.source);
    await expect(getPendingReviewSource({ query: state.query, scope: { tenantId: "tenant-b" }, sourceId: source.id })).resolves.toBeUndefined();
  });

  it("requires a pending source in the same tenant before admitting a disabled dataset", async () => {
    const state = harness();
    await admitPendingReviewSource({ query: state.query, scope, source });

    const admittedDataset = await admitPendingReviewDataset({ query: state.query, scope, dataset });
    expect(admittedDataset).toMatchObject({ created: true, dataset: { sourceId: source.id, tenantId: "tenant-a", status: "disabled" } });
    await expect(admitPendingReviewDataset({ query: state.query, scope: { tenantId: "tenant-b" }, dataset }))
      .rejects.toMatchObject({ code: "REGISTRY_SCOPE_MISMATCH" });
  });

  it("treats exact source and dataset replay as idempotent and rejects altered immutable replay", async () => {
    const state = harness();
    const firstSource = await admitPendingReviewSource({ query: state.query, scope, source });
    expect(await admitPendingReviewSource({ query: state.query, scope, source })).toEqual({ created: false, source: firstSource.source });
    const firstDataset = await admitPendingReviewDataset({ query: state.query, scope, dataset });
    expect(await admitPendingReviewDataset({ query: state.query, scope, dataset })).toEqual({ created: false, dataset: firstDataset.dataset });
    await expect(admitPendingReviewDataset({ query: state.query, scope, dataset: { ...dataset, version: "2026-10-03" } }))
      .rejects.toMatchObject({ code: "REGISTRY_DATASET_REPLAY_CONFLICT" });
  });

  it("only converts database unique violations into immutable replay checks", async () => {
    const state = harness();
    const admitted = await admitPendingReviewSource({ query: state.query, scope, source });
    const uniqueConflict = Object.assign(new Error("duplicate key"), { code: "23505" });
    const sourceReplayQuery: RegistryPersistenceQuery = {
      ...state.query,
      insertSourceIfAbsent: async () => { throw { cause: uniqueConflict }; },
    };
    await expect(admitPendingReviewSource({ query: sourceReplayQuery, scope, source }))
      .resolves.toEqual({ created: false, source: admitted.source });

    const unavailable = Object.assign(new Error("database connection lost"), { code: "08006" });
    const unavailableQuery: RegistryPersistenceQuery = {
      ...state.query,
      insertSourceIfAbsent: async () => { throw unavailable; },
    };
    await expect(admitPendingReviewSource({ query: unavailableQuery, scope, source: { ...source, id: "source-b", canonicalSourceId: "second-feed" } }))
      .rejects.toBe(unavailable);
  });

  it("rejects unknown fields, oversized payloads, public scope, and source activation before persistence", async () => {
    const state = harness();

    await expect(admitPendingReviewSource({ query: state.query, scope, source: { ...source, status: "active" } as unknown }))
      .rejects.toMatchObject({ code: "REGISTRY_UNKNOWN_FIELD" });
    await expect(admitPendingReviewSource({ query: state.query, scope, source: { ...source, unexpected: true } as unknown }))
      .rejects.toMatchObject({ code: "REGISTRY_UNKNOWN_FIELD" });
    await expect(admitPendingReviewSource({ query: state.query, scope, source: { ...source, sourceJson: { name: "x".repeat(70_000) } } }))
      .rejects.toMatchObject({ code: "REGISTRY_PAYLOAD_TOO_LARGE" });
    expect(state.sources).toEqual([]);
  });

  it("has no activation, update, delete, or fetch methods", () => {
    const repository = createRegistryPersistence({ query: harness().query });
    expect(Object.keys(repository).some(key => /activate|update|delete|fetch/i.test(key))).toBe(false);
    expect(Object.keys(repository)).toEqual(["admitSource", "admitDataset", "getPendingReviewSource", "listPendingReviewSources", "listPendingReviewDatasets", "listEvidence"]);
  });

  it("lists only source-bound records from the authority tenant", async () => {
    const state = harness();
    await admitPendingReviewSource({ query: state.query, scope, source });
    await admitPendingReviewDataset({ query: state.query, scope, dataset });

    await expect(listPendingReviewDatasets({ query: state.query, scope, sourceId: source.id })).resolves.toHaveLength(1);
    await expect(listPendingReviewDatasets({ query: state.query, scope: { tenantId: "tenant-b" }, sourceId: source.id })).resolves.toEqual([]);
  });
});

void RegistryPersistenceError;
