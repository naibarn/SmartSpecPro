import { describe, expect, it } from "vitest";
import {
  buildAuthorizedWikiBacklinks,
  changeWikiMemoryTier,
  parseWikiMemoryPage,
  serializeWikiMemoryPage,
  wikiNoteObjectKey,
  type WikiMemoryPage,
} from "../wikiMemoryFormat";

const makePage = (memoryId = "mem-001", spaceId = "space-001"): WikiMemoryPage => ({
  header: {
    schema_version: 1,
    memory_id: memoryId,
    memory_space_id: spaceId,
    revision: 1,
    memory_tier: "short",
    status: "ACTIVE",
    title: "บันทึกโครงการ",
    updated_at: "2026-10-19T08:00:00+07:00",
    source_refs: ["source-123"],
    links: [],
  },
  body: "# เรื่องสำคัญ\nข้อมูลภาษาไทยและ Unicode 💡\n",
});

describe("SPEC-268 portable Wiki memory format (no runtime storage)", () => {
  it("round-trips Unicode Markdown and provenance without a database", () => {
    const page = makePage();
    expect(parseWikiMemoryPage(serializeWikiMemoryPage(page))).toEqual(page);
  });

  it("keeps a stable object key and note ID across tier changes", () => {
    const page = makePage();
    const oldKey = wikiNoteObjectKey(page.header.memory_space_id, page.header.memory_id);
    const promoted = changeWikiMemoryTier(page, "long", "2026-10-19T09:00:00+07:00");
    expect(promoted.header.memory_id).toBe(page.header.memory_id);
    expect(promoted.header.memory_space_id).toBe(page.header.memory_space_id);
    expect(promoted.header.revision).toBe(2);
    expect(promoted.header.memory_tier).toBe("long");
    expect(wikiNoteObjectKey(promoted.header.memory_space_id, promoted.header.memory_id)).toBe(oldKey);
    expect(page.header.memory_tier).toBe("short");
  });

  it("derives backlinks only for authorized notes within the same space", () => {
    const a = makePage("mem-a");
    a.header.links = [
      { target_memory_id: "mem-b", kind: "relates_to" },
      { target_memory_id: "mem-secret", kind: "supports" },
      { target_memory_id: "mem-other", kind: "relates_to" },
    ];
    const b = makePage("mem-b");
    const secret = makePage("mem-secret");
    const foreign = makePage("mem-other", "space-foreign");
    const index = buildAuthorizedWikiBacklinks(
      [a, b, secret, foreign],
      "space-001",
      new Set(["mem-a", "mem-b", "mem-other"]),
    );
    expect(index.get("mem-b")).toEqual(["mem-a"]);
    expect(index.has("mem-secret")).toBe(false);
    expect(index.has("mem-other")).toBe(false);
    expect(index.get("mem-a")).toEqual([]);
  });

  it("rejects path traversal and non-opaque identifiers", () => {
    expect(() => wikiNoteObjectKey("../bad", "mem-a")).toThrow();
    expect(() => wikiNoteObjectKey("space-001", "../../secret")).toThrow();
  });

  it("does not accept unrecognized frontmatter as an authorization grant", () => {
    const doc = serializeWikiMemoryPage(makePage());
    expect(() => parseWikiMemoryPage(doc.replace("revision: 1", "revision: 1\nrole: admin"))).toThrow();
  });

  it("rejects duplicate edges and deleted notes retaining content", () => {
    const page = makePage();
    page.header.links = [
      { target_memory_id: "mem-b", kind: "relates_to" },
      { target_memory_id: "mem-b", kind: "relates_to" },
    ];
    expect(() => serializeWikiMemoryPage(page)).toThrow("WIKI_DUPLICATE_LINK");
    const deleted = makePage();
    deleted.header.status = "DELETED";
    expect(() => serializeWikiMemoryPage(deleted)).toThrow("WIKI_DELETED_NOTE_MUST_NOT_RETAIN_BODY");
  });

  it("rejects duplicate authorized memory IDs during index rebuild", () => {
    const a = makePage();
    expect(() => buildAuthorizedWikiBacklinks([a, a], "space-001", new Set(["mem-001"]))).toThrow("WIKI_DUPLICATE_MEMORY_ID");
  });

  it("does not infer permission from a link when the target is unavailable", () => {
    const a = makePage("mem-a");
    a.header.links = [{ target_memory_id: "mem-b", kind: "relates_to" }];
    expect(buildAuthorizedWikiBacklinks([a], "space-001", new Set(["mem-a"])).get("mem-a")).toEqual([]);
  });
});
