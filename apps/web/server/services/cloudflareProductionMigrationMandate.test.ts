import { describe, expect, it } from "vitest";
import { getCloudflareMigrationMandateInventoryBlocker, getMissingCloudflareMigrationMandateActions } from "./cloudflareProductionMigrationMandate";

function inventory(overrides: Record<string, unknown> = {}) {
  return {
    queueInventoryComplete: true,
    hyperdriveInventoryComplete: true,
    vpcServiceInventoryComplete: true,
    tunnelInventoryComplete: true,
    domainRoute: { inventoryComplete: true },
    queueResourceInventory: [
      { id: "queue-id", name: "smartspec-canonical-job-queue-production" },
      { id: "dlq-id", name: "smartspec-canonical-job-queue-production-dlq" },
    ],
    productionQueueConsumerInventory: { complete: false, reason: "CONSUMER_READ_UNAVAILABLE" },
    ...overrides,
  } as unknown as Parameters<typeof getCloudflareMigrationMandateInventoryBlocker>[0];
}

describe("FIRST_MIGRATION mandate enrollment inventory readiness", () => {
  it("does not block bounded enrollment when Queue consumer health is incomplete", () => {
    expect(getCloudflareMigrationMandateInventoryBlocker(inventory())).toBeNull();
  });

  it.each([
    { queueInventoryComplete: false },
    { hyperdriveInventoryComplete: false },
    { vpcServiceInventoryComplete: false },
    { tunnelInventoryComplete: false },
    { domainRoute: { inventoryComplete: false } },
    { queueResourceInventory: undefined },
  ])("blocks enrollment when immutable resource identity is incomplete: %o", overrides => {
    expect(getCloudflareMigrationMandateInventoryBlocker(inventory(overrides))).toBe(
      "MIGRATION_MANDATE_RESOURCE_INVENTORY_INCOMPLETE",
    );
  });
});

describe("FIRST_MIGRATION mandate enforcement coverage", () => {
  it("keeps enrollment closed until the approval service reports every enforced action", () => {
    expect(getMissingCloudflareMigrationMandateActions(["synthetic_credit_billing", "synthetic_queue_recovery"]))
      .toEqual(["rotate_origin_configuration", "deploy_worker", "worker_canary", "native_runtime_activation", "rollback"]);
    expect(getMissingCloudflareMigrationMandateActions(undefined)).toHaveLength(7);
    expect(getMissingCloudflareMigrationMandateActions([
      "rotate_origin_configuration", "deploy_worker", "worker_canary", "synthetic_credit_billing",
      "synthetic_queue_recovery", "native_runtime_activation", "rollback",
    ])).toEqual([]);
  });
});
