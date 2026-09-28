import { describe, expect, it } from "vitest";
import { formatCreditContextReportCsv } from "../creditContextReports";

describe("credit context report presentation", () => {
  it("exports safe work labels and exact aggregate totals without technical ids", () => {
    const csv = formatCreditContextReportCsv({
      scope: "self",
      distinctUserCount: 1,
      rows: [{
        rootContextId: "uuid-hidden-from-export",
        rootLabel: "เรื่องทดลอง",
        primaryContextId: "uuid-hidden-from-export",
        primaryWorkLabel: "สร้างบทตอนที่ 1",
        attributionStatus: "linked",
        chargedCredits: 12,
        refundedCredits: 2,
        netActualCredits: 10,
        usageTransactionCount: 2,
        refundTransactionCount: 1,
        adjustmentTransactionCount: 0,
        firstUsedAt: null,
        lastUsedAt: null,
        byWork: [],
        bySourceType: [],
        byContextSourceType: [],
        bySkill: [],
        byModel: [],
        byStage: [],
      }],
      totals: {
        chargedCredits: 12,
        refundedCredits: 2,
        netActualCredits: 10,
        usageTransactionCount: 2,
        refundTransactionCount: 1,
        adjustmentTransactionCount: 0,
        unattributedTransactionCount: 0,
        ambiguousTransactionCount: 0,
        unattributedChargedCredits: 0,
        unattributedRefundedCredits: 0,
        unattributedNetActualCredits: 0,
        ambiguousChargedCredits: 0,
        ambiguousRefundedCredits: 0,
        ambiguousNetActualCredits: 0,
        integrityExceptionTransactionCount: 0,
        integrityExceptionCredits: 0,
      },
      pagination: { limit: 50, offset: 0, hasMore: false, nextOffset: null, asOfTransactionId: 99 },
    });

    expect(csv).toContain("เรื่องทดลอง");
    expect(csv).toContain("สร้างบทตอนที่ 1");
    expect(csv).toContain('"รวม"');
    expect(csv).not.toContain("uuid-hidden-from-export");
  });
});
