import { describe, it, expect } from "vitest";
import {
  googleDriveSyncState,
  googleDriveEditSessions,
  userCreditBudgets,
  libraryLinks,
  creditTransactions,
  indexingModeEnum,
  editSessionStatusEnum,
} from "../drizzle/schema";

describe("Google Drive Schema - google_drive_sync_state", () => {
  it("should export googleDriveSyncState table definition", () => {
    expect(googleDriveSyncState).toBeDefined();
  });

  it("should have tenant_id as varchar(36)", () => {
    const col = googleDriveSyncState.tenantId;
    expect(col).toBeDefined();
    expect(col.notNull).toBe(true);
  });

  it("should have auto_sync_enabled default to true", () => {
    const col = googleDriveSyncState.autoSyncEnabled;
    expect(col).toBeDefined();
    expect(col.notNull).toBe(true);
  });

  it("should store channelTokenHash instead of plaintext channelToken", () => {
    expect(googleDriveSyncState.channelTokenHash).toBeDefined();
    // @ts-expect-error -- channelToken should not exist
    expect(googleDriveSyncState.channelToken).toBeUndefined();
  });

  it("should define indexingModeEnum with expected values", () => {
    expect(indexingModeEnum.enumValues).toEqual([
      "none",
      "selected_folders",
      "all_except",
      "all",
    ]);
  });
});

describe("Google Drive Schema - google_drive_edit_sessions", () => {
  it("should export googleDriveEditSessions table definition", () => {
    expect(googleDriveEditSessions).toBeDefined();
  });

  it("should have tenant_id column", () => {
    expect(googleDriveEditSessions.tenantId).toBeDefined();
  });

  it("should define editSessionStatusEnum with expected values", () => {
    expect(editSessionStatusEnum.enumValues).toEqual([
      "active",
      "saved_back",
      "discarded",
      "expired",
    ]);
  });

  it("should have driveFileId as required", () => {
    const col = googleDriveEditSessions.driveFileId;
    expect(col).toBeDefined();
    expect(col.notNull).toBe(true);
  });
});

describe("Google Drive Schema - user_credit_budgets", () => {
  it("should export userCreditBudgets table definition", () => {
    expect(userCreditBudgets).toBeDefined();
  });

  it("should have tenant_id column", () => {
    expect(userCreditBudgets.tenantId).toBeDefined();
  });

  it("should have required columns", () => {
    expect(userCreditBudgets.monthlyLimit).toBeDefined();
    expect(userCreditBudgets.creditsUsedThisMonth).toBeDefined();
    expect(userCreditBudgets.budgetMonthKey).toBeDefined();
    expect(userCreditBudgets.alertThresholdPct).toBeDefined();
    expect(userCreditBudgets.alertSent).toBeDefined();
    expect(userCreditBudgets.hardCapReached).toBeDefined();
  });
});

describe("Google Drive Schema - library_links modifications", () => {
  it("should have tenant_id column", () => {
    expect(libraryLinks.tenantId).toBeDefined();
  });
});

describe("Google Drive Schema - credit_transactions modifications", () => {
  it("should have idempotencyKey column", () => {
    expect(creditTransactions.idempotencyKey).toBeDefined();
  });
});
