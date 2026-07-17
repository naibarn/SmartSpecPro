import { describe, expect, it } from "vitest";
import {
  scanGenrePollution,
  buildGenreProposalReviewRow,
  formatGenreProposalTable,
  validateGenreApplyPreconditions,
  planGenreApply,
  type GenreProposalReviewRow,
} from "../repair-vertical-drama-genre-pollution";

describe("scanGenrePollution", () => {
  it("flags a genre that is a byte-for-byte copy of title (real series-5 shape)", () => {
    const reports = scanGenrePollution([
      {
        id: 5,
        tenantId: "tenant-a",
        title: "สวมรอยดาราสองชีวิต…",
        genre: "สวมรอยดาราสองชีวิต…",
      },
    ]);
    expect(reports).toEqual([
      {
        id: 5,
        tenantId: "tenant-a",
        title: "สวมรอยดาราสองชีวิต…",
        genre: "สวมรอยดาราสองชีวิต…",
        reason: "duplicate_of_title",
      },
    ]);
  });

  it("flags a colon-shaped alt-title genre (real series-17 shape)", () => {
    const reports = scanGenrePollution([
      {
        id: 17,
        tenantId: "tenant-a",
        title: "รักข้ามเวลา",
        genre: "คฤหาสน์ครึ่งเวลา: อ้อมใจในเงา",
      },
    ]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.reason).toBe("sentence_shaped");
  });

  it("flags a long, multi-segment paraphrase of title (real series-16 shape)", () => {
    const reports = scanGenrePollution([
      {
        id: 16,
        tenantId: "tenant-a",
        title: "คาเฟ่ป่วนรัก กับดักพี่ชายตัวแสบ",
        genre: "คาเฟ่ปั่นรัก พี่ชายหวงตัวแสบในตึกเดียวกัน",
      },
    ]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.reason).toBe("logline_length");
  });

  it("does not flag a genuine short genre label", () => {
    const reports = scanGenrePollution([
      { id: 1, tenantId: "tenant-a", title: "รักข้ามเวลา", genre: "โรแมนติกดราม่าย้อนเวลา" },
    ]);
    expect(reports).toEqual([]);
  });

  it("does not flag a row with no genre at all", () => {
    const reports = scanGenrePollution([
      { id: 2, tenantId: "tenant-a", title: "รักข้ามเวลา", genre: null },
    ]);
    expect(reports).toEqual([]);
  });

  it("never mutates or invents a replacement value — only reports id/tenantId/title/genre/reason", () => {
    const reports = scanGenrePollution([
      {
        id: 5,
        tenantId: "tenant-a",
        title: "สวมรอยดาราสองชีวิต…",
        genre: "สวมรอยดาราสองชีวิต…",
      },
    ]);
    expect(Object.keys(reports[0]!).sort()).toEqual(
      ["genre", "id", "reason", "tenantId", "title"].sort()
    );
  });
});

describe("buildGenreProposalReviewRow — task #7", () => {
  it("combines the structural pollution reason with the LLM proposal and defaults approved to false", () => {
    const row = buildGenreProposalReviewRow(
      { id: 17, tenantId: "tenant-a", title: "รักข้ามเวลา", genre: "คฤหาสน์ครึ่งเวลา: อ้อมใจในเงา" },
      { proposed_genre: "โรแมนติกดราม่าย้อนเวลา", decision: "change", rationale: "เป็นเรื่องย้อนเวลา" }
    );
    expect(row).toEqual({
      id: 17,
      tenantId: "tenant-a",
      title: "รักข้ามเวลา",
      currentGenre: "คฤหาสน์ครึ่งเวลา: อ้อมใจในเงา",
      pollutionReason: "sentence_shaped",
      proposedGenre: "โรแมนติกดราม่าย้อนเวลา",
      decision: "change",
      rationale: "เป็นเรื่องย้อนเวลา",
      approved: false,
    });
  });

  it("reports 'not_flagged' when the structural guard does not flag the current genre (the task #7 gap)", () => {
    const row = buildGenreProposalReviewRow(
      { id: 6, tenantId: "tenant-a", title: "หนูน้อยช่างสงสัย", genre: "แม่ลูกหาคำตอบในร้านสะดวกซื้อ" },
      { proposed_genre: "แม่ลูกเรียนรู้ด้วยกัน", decision: "change", rationale: "เป็นพล็อตไม่ใช่แนวเรื่อง" }
    );
    expect(row.pollutionReason).toBe("not_flagged");
  });
});

describe("formatGenreProposalTable", () => {
  it("renders a header + one line per row, pipe-delimited", () => {
    const rows: GenreProposalReviewRow[] = [
      {
        id: 1,
        tenantId: "t",
        title: "Title A",
        currentGenre: null,
        pollutionReason: "not_flagged",
        proposedGenre: "โรแมนติก",
        decision: "change",
        rationale: "reason",
        approved: false,
      },
    ];
    const table = formatGenreProposalTable(rows);
    expect(table).toContain("id | title | current genre");
    expect(table).toContain("1 | Title A | (empty) | not_flagged | โรแมนติก | change | reason");
  });
});

describe("validateGenreApplyPreconditions", () => {
  it("refuses when review-file is missing", () => {
    const error = validateGenreApplyPreconditions({
      backupPath: "/tmp/backup.sql",
      backupExists: true,
      backupSizeBytes: 100,
    });
    expect(error).toMatch(/--review-file/);
  });

  it("refuses when backup path is missing", () => {
    const error = validateGenreApplyPreconditions({
      reviewFilePath: "/tmp/review.json",
      backupExists: false,
      backupSizeBytes: 0,
    });
    expect(error).toMatch(/--backup/);
  });

  it("refuses when the backup file does not exist on disk", () => {
    const error = validateGenreApplyPreconditions({
      reviewFilePath: "/tmp/review.json",
      backupPath: "/tmp/does-not-exist.sql",
      backupExists: false,
      backupSizeBytes: 0,
    });
    expect(error).toMatch(/not found/);
  });

  it("refuses when the backup file is empty", () => {
    const error = validateGenreApplyPreconditions({
      reviewFilePath: "/tmp/review.json",
      backupPath: "/tmp/empty-backup.sql",
      backupExists: true,
      backupSizeBytes: 0,
    });
    expect(error).toMatch(/empty/);
  });

  it("passes (null) when both review-file and a real, non-empty backup are present", () => {
    const error = validateGenreApplyPreconditions({
      reviewFilePath: "/tmp/review.json",
      backupPath: "/tmp/backup.sql",
      backupExists: true,
      backupSizeBytes: 4096,
    });
    expect(error).toBeNull();
  });
});

describe("planGenreApply", () => {
  const currentRows = [
    { id: 1, tenantId: "t", title: "Title A", genre: "logline shaped: subtitle" },
    { id: 2, tenantId: "t", title: "Title B", genre: "logline shaped: subtitle" },
  ];

  function reviewRow(over: Partial<GenreProposalReviewRow>): GenreProposalReviewRow {
    return {
      id: 1,
      tenantId: "t",
      title: "Title A",
      currentGenre: "logline shaped: subtitle",
      pollutionReason: "sentence_shaped",
      proposedGenre: "โรแมนติกดราม่า",
      decision: "change",
      rationale: "r",
      approved: true,
      ...over,
    };
  }

  it("applies only rows flipped to approved:true", () => {
    const { repairs, skipped } = planGenreApply(
      [reviewRow({ approved: false })],
      currentRows
    );
    expect(repairs).toEqual([]);
    expect(skipped).toEqual([{ id: 1, reason: "not_approved" }]);
  });

  it("skips a row whose series no longer exists", () => {
    const { repairs, skipped } = planGenreApply(
      [reviewRow({ id: 999 })],
      currentRows
    );
    expect(repairs).toEqual([]);
    expect(skipped).toEqual([{ id: 999, reason: "series_no_longer_exists" }]);
  });

  it("skips a row whose genre changed since the propose pass (stale-apply guard)", () => {
    const { repairs, skipped } = planGenreApply(
      [reviewRow({ currentGenre: "something else entirely" })],
      currentRows
    );
    expect(repairs).toEqual([]);
    expect(skipped).toEqual([{ id: 1, reason: "genre_changed_since_proposal" }]);
  });

  it("skips a row whose proposed genre is empty", () => {
    const { repairs, skipped } = planGenreApply(
      [reviewRow({ proposedGenre: "   " })],
      currentRows
    );
    expect(repairs).toEqual([]);
    expect(skipped).toEqual([{ id: 1, reason: "empty_proposed_genre" }]);
  });

  it("skips a row whose proposed genre is itself still pollution-shaped (self-check)", () => {
    const { repairs, skipped } = planGenreApply(
      [reviewRow({ proposedGenre: "Title A" })], // duplicate_of_title
      currentRows
    );
    expect(repairs).toEqual([]);
    expect(skipped).toEqual([{ id: 1, reason: "proposed_genre_still_polluted" }]);
  });

  it("skips a no-op row (proposed genre already equals current genre)", () => {
    // Use a row whose CURRENT genre is already clean/non-polluted so this
    // case exercises the no-op path specifically, not the self-check path
    // (a polluted current+proposed value would be caught by the
    // still-polluted self-check first, which is covered by its own test
    // above).
    const cleanCurrentRows = [
      { id: 1, tenantId: "t", title: "Title A", genre: "โรแมนติกดราม่า" },
    ];
    const { repairs, skipped } = planGenreApply(
      [
        reviewRow({
          currentGenre: "โรแมนติกดราม่า",
          proposedGenre: "โรแมนติกดราม่า",
        }),
      ],
      cleanCurrentRows
    );
    expect(repairs).toEqual([]);
    expect(skipped).toEqual([{ id: 1, reason: "no_change" }]);
  });

  it("produces a repair for a valid, approved, changed, non-polluted proposal", () => {
    const { repairs, skipped } = planGenreApply([reviewRow({})], currentRows);
    expect(skipped).toEqual([]);
    expect(repairs).toEqual([
      { id: 1, before: "logline shaped: subtitle", after: "โรแมนติกดราม่า" },
    ]);
  });

  it("handles multiple rows independently", () => {
    const { repairs, skipped } = planGenreApply(
      [
        reviewRow({ id: 1 }),
        reviewRow({ id: 2, title: "Title B", approved: false }),
      ],
      currentRows
    );
    expect(repairs).toEqual([
      { id: 1, before: "logline shaped: subtitle", after: "โรแมนติกดราม่า" },
    ]);
    expect(skipped).toEqual([{ id: 2, reason: "not_approved" }]);
  });
});
