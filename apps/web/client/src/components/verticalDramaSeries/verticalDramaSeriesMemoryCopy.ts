/**
 * Vertical Drama Series — Series Memory tab copy dictionary (Stage 1.4,
 * `planning/vd-series-memory-and-lineage/plan.md`).
 *
 * Deliberately a STANDALONE file, NOT importing from the giant shared
 * `verticalDramaCopy.ts` (1500+ lines, many concurrently-owned surfaces) —
 * same "own `pickCopy`, own lang type, zero coupling" convention already
 * established by `verticalDramaTieInDraftCopy.ts` / `verticalDramaAdBannerCopy.ts`
 * / `verticalDramaTextOverlayCopy.ts`.
 *
 * Covers `VerticalDramaSeriesMemoryStateTab.tsx` only — the NEW tab reading/
 * writing `VdSeriesMemory` (the materialized projection declared in
 * `shared/verticalDramaSeries/seriesMemoryState.ts`). This is intentionally
 * separate from `VerticalDramaSeriesMemoryTab.tsx` (spec feature 131's
 * pre-existing "Memory" tab over the durable append-only event log,
 * `vertical_drama_memory_events` / `listMemoryEvents`) — two different memory
 * concepts documented as distinct in `seriesMemoryState.ts`'s own header
 * doc comment.
 */

import type { VerticalDramaStoryControlAuditStatus } from "@shared/verticalDramaSeries/storyContinuity";

export type VdSeriesMemoryLang = "th" | "en";

/** Pick a bilingual string for the active language — mirrors `verticalDramaCopy.ts`'s `pickCopy` exactly, kept as a local copy so this file has no import dependency on that (concurrently-owned) file. */
export function pickCopy<T>(lang: VdSeriesMemoryLang, value: { th: T; en: T }): T {
  return lang === "th" ? value.th : value.en;
}

export function storyControlAuditStatusText(
  lang: VdSeriesMemoryLang,
  status: VerticalDramaStoryControlAuditStatus,
): string {
  const labels: Record<VerticalDramaStoryControlAuditStatus, { th: string; en: string }> = {
    registered: { th: "ลงทะเบียนแล้ว แต่ยังไม่พบ opening", en: "Registered, no opening matched" },
    open: { th: "เปิดอยู่", en: "Open" },
    overdue: { th: "เลยช่วงเฉลย", en: "Overdue" },
    resolved: { th: "ปิดแล้วจาก memory", en: "Resolved in memory" },
    needs_review: { th: "ต้องตรวจสอบ", en: "Needs review" },
    legacy_unknown: { th: "ข้อมูลเก่า/ไม่อยู่ใน seed", en: "Legacy unknown" },
    missing_opening: { th: "ปิดแต่ไม่พบ opening", en: "Resolved without opening" },
  };
  return pickCopy(lang, labels[status]);
}

export function storyControlAuditReasonText(
  lang: VdSeriesMemoryLang,
  status: VerticalDramaStoryControlAuditStatus,
): string {
  const reasons: Record<VerticalDramaStoryControlAuditStatus, { th: string; en: string }> = {
    registered: { th: "ยังไม่พบ opening ใน memory", en: "No opening matched in memory yet" },
    open: { th: "มี opening แล้ว แต่ยังไม่พบการปิดปม", en: "An opening exists, but no resolution is recorded yet" },
    overdue: { th: "ยังไม่ปิดหลังพ้นช่วงเฉลยที่ลงทะเบียนไว้", en: "Still open after the registered payoff window" },
    resolved: { th: "พบ opening และการปิดปมที่จับคู่กันได้", en: "A matched opening and resolution were found" },
    needs_review: { th: "พบ lifecycle ซ้ำ หรือ seed ระบุให้ตรวจสอบ", en: "Duplicate lifecycle records or seed review flag" },
    legacy_unknown: { th: "พบรหัสใน memory แต่ไม่อยู่ใน seed ปัจจุบัน", en: "Found in memory but not in the current seed" },
    missing_opening: { th: "พบการปิดปม แต่ไม่พบ opening ที่ตรงกัน", en: "A resolution exists without a matching opening" },
  };
  return pickCopy(lang, reasons[status]);
}

/** New tab's own label — deliberately NOT reusing the pre-existing "memory"
 *  tab's Thai label ("ความจำซีรีย์") verbatim on `VerticalDramaSeriesDetailPage.tsx`,
 *  to avoid two tabs with an identical visible name; that page relabels its
 *  OLD event-log tab to `eventLogTabLabel`-equivalent text and gives this new,
 *  user-facing "read this and understand the whole story" surface the primary
 *  name instead (see that page's own tabLabels comment for the reasoning). */
export const seriesMemoryTabLabel = { th: "ความจำซีรีย์", en: "Series Memory" };

export const verticalDramaSeriesMemoryCopy = {
  controlPlaneTitle: { th: "แกนควบคุมเนื้อเรื่อง", en: "Story control plane" },
  controlPlaneEmpty: {
    th: "ยังไม่มีแผนควบคุมเนื้อเรื่องที่ผ่านการตรวจ — เนื้อหาเก่ายังคงอ่านได้ตามเดิม",
    en: "No validated story-control seed yet — legacy story data remains readable as-is.",
  },
  controlPlanePremise: { th: "แกนเรื่อง", en: "Premise anchor" },
  controlPlaneCast: { th: "ตัวละครหลักที่ล็อกชื่อแล้ว", en: "Canonical cast" },
  controlPlaneThreadIds: { th: "รหัสปมที่วางไว้", en: "Registered thread IDs" },
  controlPlaneThreadWindow: { th: "ช่วงเปิด/เฉลย", en: "Plant/payoff window" },
  controlPlaneThreadStatus: { th: "สถานะปม", en: "Thread status" },
  controlPlaneThreadLedgerStatus: { th: "สถานะตาม memory", en: "Memory status" },
  controlPlaneThreadNotResolved: {
    th: "ยังไม่พบหลักฐานว่าปิดปมใน memory",
    en: "No resolution recorded in memory yet",
  },
  controlPlaneAuditStatus: { th: "ผลตรวจสอบ", en: "Audit status" },
  controlPlaneAuditReason: { th: "เหตุผล", en: "Reason" },
  controlPlaneAuditUnregistered: {
    th: "รหัสปมใน memory ที่ยังไม่อยู่ใน seed",
    en: "Memory thread IDs not registered in the seed",
  },
  controlPlaneThreadOwners: { th: "ตัวละครที่เกี่ยวข้อง", en: "Thread owners" },
  controlPlaneThreadEvidence: { th: "หลักฐานที่ต้องเห็น", en: "Expected evidence" },
  controlPlaneThreadCost: { th: "ต้นทุนตอนเฉลย", en: "Resolution cost" },
  controlPlaneRomance: { th: "จังหวะความสัมพันธ์", en: "Romance rhythm" },
  controlPlaneRomancePurpose: { th: "เป้าหมายจังหวะ", en: "Beat purpose" },
  controlPlaneAdvantage: { th: "เส้นความได้เปรียบ", en: "Advantage curve" },
  controlPlaneCost: { th: "ต้นทุน/การตอบโต้", en: "Cost/response" },
  controlPlaneOpponentResponse: { th: "การตอบโต้ของฝ่ายตรงข้าม", en: "Opponent response" },
  compactSummaryTitle: { th: "สรุปเนื้อเรื่องสะสม", en: "Story so far" },
  compactSummaryEmpty: {
    th: "ยังไม่มีสรุปเนื้อเรื่องสะสม",
    en: "No accumulated story summary yet.",
  },
  relationshipsTitle: { th: "ความสัมพันธ์ตัวละคร", en: "Character relationships" },
  relationshipsEmpty: {
    th: "ยังไม่มีบันทึกความสัมพันธ์ — เพิ่มได้จากไทม์ไลน์รายตอนด้านล่าง",
    en: "No relationship states recorded yet — add one from the episode timeline below.",
  },
  knownByLabel: { th: "คนที่รู้เรื่องนี้", en: "Known by" },
  knownByNone: { th: "(ยังไม่มีใครถูกระบุว่ารู้)", en: "(nobody listed yet)" },
  sinceEpisodeLabel: { th: "เป็นแบบนี้ตั้งแต่ตอน", en: "As of episode" },
  editRelationship: { th: "แก้ไข", en: "Edit" },

  openThreadsTitle: { th: "ปมค้างที่ยังไม่คลี่คลาย", en: "Open threads" },
  openThreadsCount: { th: "ปมที่ยังเปิด", en: "open" },
  openThreadsEmpty: {
    th: "ไม่มีปมค้างที่ยังเปิดอยู่ในตอนนี้",
    en: "No open threads right now.",
  },
  resolvedThreadsTitle: { th: "ประวัติปมที่คลี่คลายแล้ว", en: "Resolved thread history" },
  resolvedThreadsCount: { th: "ปมที่คลี่คลายแล้ว", en: "resolved" },
  resolvedThreadsEmpty: {
    th: "ยังไม่มีประวัติปมที่คลี่คลายแล้ว",
    en: "No resolved threads recorded yet.",
  },
  threadResolvedAtLabel: { th: "คลี่คลายในตอน", en: "Resolved in episode" },
  threadResolutionSourceMissing: {
    th: "ตรวจพบการคลี่คลาย แต่ไม่พบข้อมูลตอนที่เปิดปม",
    en: "Resolution recorded, but the opening episode is missing",
  },
  threadClassFilterAll: { th: "ทุกประเภท", en: "All types" },
  threadOpenedAtLabel: { th: "เปิดตั้งแต่ตอน", en: "Opened at episode" },
  threadIdDisplayLabel: { th: "รหัสปม", en: "Thread ID" },
  threadResolutionTargetLabel: {
    th: "เป้าหมายการคลี่คลาย",
    en: "Planned resolution",
  },
  threadResolutionEpisodeLabel: { th: "ตอนที่", en: "episode" },
  markResolved: { th: "ทำเครื่องหมายว่าคลี่คลายแล้ว", en: "Mark resolved" },
  editThread: { th: "แก้ไข", en: "Edit" },

  episodeTimelineTitle: { th: "ไทม์ไลน์รายตอน", en: "Episode timeline" },
  episodeTimelineEmpty: {
    th: "ยังไม่มีบันทึกความจำรายตอนเลย",
    en: "No per-episode memory records yet.",
  },
  addEpisodeRecord: { th: "เพิ่มบันทึกตอน", en: "Add episode record" },
  episodeLabel: { th: "ตอนที่", en: "Episode" },
  noRecordForEpisode: {
    th: "ยังไม่มีบันทึกความจำสำหรับตอนนี้",
    en: "No memory record for this episode yet.",
  },
  writeRecordForEpisode: {
    th: "เขียนบันทึกสำหรับตอนนี้เอง",
    en: "Write a record for this episode",
  },
  editEpisodeRecord: { th: "แก้ไขบันทึกตอนนี้", en: "Edit this episode's record" },
  removeEpisodeRecord: { th: "ลบบันทึกตอนนี้", en: "Remove this episode's record" },
  removeEpisodeConfirm: {
    th: "ลบบันทึกความจำของตอนนี้? การกระทำนี้จะคำนวณสรุป/ความสัมพันธ์/ปมค้างใหม่ทั้งหมด",
    en: "Remove this episode's memory record? This re-derives the whole summary/relationships/open threads.",
  },

  canonicalFactsLabel: { th: "ข้อเท็จจริงหลักของตอนนี้", en: "This episode's canonical facts" },
  addFact: { th: "เพิ่มข้อเท็จจริง", en: "Add fact" },
  recapLabel: { th: "สรุปเนื้อเรื่องของตอนนี้", en: "This episode's recap" },
  recapPlaceholder: {
    th: "เกิดอะไรขึ้นในตอนนี้ที่ส่งผลต่อภาพรวมเนื้อเรื่อง...",
    en: "What happened this episode that matters to the overall story...",
  },

  threadsOpenedLabel: { th: "ปมที่เปิดในตอนนี้", en: "Threads opened this episode" },
  addThreadOpened: { th: "เพิ่มปมที่เปิด", en: "Add opened thread" },
  threadDescriptionPlaceholder: {
    th: "เช่น การรีโนเวทบ้านยังไม่เสร็จ",
    en: "e.g. the house renovation still isn't done",
  },
  threadIdLabel: { th: "รหัสปม (ใช้อ้างอิงตอนคลี่คลาย)", en: "Thread ID (used to resolve it later)" },

  threadsResolvedLabel: {
    th: "ปมที่คลี่คลายเมื่อถึงตอนนี้",
    en: "Threads resolved as of this episode",
  },
  threadsResolvedEmpty: {
    th: "ไม่มีปมค้างให้เลือกคลี่คลายในตอนนี้",
    en: "No open threads available to resolve at this episode.",
  },
  addOtherThreadId: { th: "เพิ่มรหัสปมอื่น", en: "Add another thread ID" },

  relationshipChangesLabel: {
    th: "สถานะความสัมพันธ์หลังตอนนี้",
    en: "Relationship state after this episode",
  },
  addRelationshipChange: { th: "เพิ่มความสัมพันธ์", en: "Add relationship" },
  characterKeyA: { th: "ตัวละครที่ 1 (characterKey)", en: "Character 1 (characterKey)" },
  characterKeyB: { th: "ตัวละครที่ 2 (characterKey)", en: "Character 2 (characterKey)" },
  statusLabel: { th: "สถานะความสัมพันธ์ (ข้อความอิสระ)", en: "Status (free text)" },
  statusPlaceholder: { th: "เช่น คบกัน / หย่าแล้ว / พี่น้องห่างเหิน", en: "e.g. dating / divorced / estranged siblings" },
  disclosureLabel: { th: "ระดับการเปิดเผย", en: "Disclosure level" },
  knownByEditLabel: { th: "รายชื่อคนที่รู้ (characterKey)", en: "Who knows (characterKey list)" },

  knowledgeChangesLabel: { th: "สิ่งที่ตัวละครได้รู้ในตอนนี้", en: "What characters learned this episode" },
  addKnowledgeChange: { th: "เพิ่มสิ่งที่ได้รู้", en: "Add knowledge" },
  characterKeyLabel: { th: "characterKey", en: "characterKey" },
  learnedLabel: { th: "สิ่งที่ได้รู้", en: "What they learned" },

  save: { th: "บันทึก", en: "Save" },
  cancel: { th: "ยกเลิก", en: "Cancel" },
  loadFailed: { th: "โหลดความจำซีรีย์ไม่สำเร็จ", en: "Failed to load series memory" },
  saveFailed: { th: "บันทึกไม่สำเร็จ", en: "Failed to save" },
  saveSucceeded: { th: "บันทึกความจำแล้ว", en: "Memory saved" },
  removeSucceeded: { th: "ลบบันทึกตอนนี้แล้ว", en: "Episode record removed" },
  readOnly: { th: "อ่านอย่างเดียว", en: "Read-only" },

  emptyStateTitle: { th: "ยังไม่มีความจำซีรีย์ที่บันทึกไว้", en: "No series memory recorded yet" },
  emptyStateBody: {
    th: "ระบบจะบันทึกความจำอัตโนมัติเมื่อวางแผนเนื้อเรื่องแต่ละตอนย่อย หรือคุณเริ่มเขียนบันทึกตอนแรกได้เองด้านล่างนี้เลย",
    en: "Memory is captured automatically as each Sub-episode's story is authored — or you can start writing the first episode record yourself below.",
  },
} as const;

/**
 * `VdRelationshipDisclosure` display metadata — the axis the whole feature
 * exists to make visually unmistakable. `undeclared` vs `secret` is a real,
 * easy-to-blur distinction (see `seriesMemoryState.ts`'s own doc comment on
 * `VdRelationshipDisclosure`): `secret` = at least one party is DELIBERATELY
 * hiding it; `undeclared` = nobody has said it aloud yet, nothing is being
 * hidden. Caption text below says this explicitly rather than relying on the
 * one-word label alone.
 */
export const disclosureCopy: Record<
  "secret" | "known_to_some" | "public" | "undeclared",
  { label: { th: string; en: string }; caption: { th: string; en: string } }
> = {
  secret: {
    label: { th: "แอบคบ (เป็นความลับ)", en: "Secret" },
    caption: {
      th: "อย่างน้อยหนึ่งฝ่ายตั้งใจปิดบังไม่ให้คนอื่นรู้",
      en: "At least one party is deliberately hiding this from others.",
    },
  },
  known_to_some: {
    label: { th: "รู้กันบางคน", en: "Known to some" },
    caption: {
      th: "มีคนบางกลุ่มที่รู้เรื่องนี้แล้ว — ดูรายชื่อด้านล่าง",
      en: "A known subset of characters are aware — see who below.",
    },
  },
  public: {
    label: { th: "เปิดเผยแล้ว", en: "Public" },
    caption: {
      th: "เปิดเผยในโลกเรื่องแล้ว ใครพูดถึงก็ได้โดยไม่ใช่การเปิดเผยครั้งใหม่",
      en: "Openly acknowledged in the story world — anyone may reference it without it being a revelation.",
    },
  },
  undeclared: {
    label: { th: "ยังไม่มีใครพูดออกมา", en: "Undeclared (unspoken)" },
    caption: {
      th: "ทั้งคู่อาจรู้สึกอยู่ในใจ แต่ยังไม่มีใครพูดออกมาดัง ๆ — นี่ไม่ใช่ความลับที่ตั้งใจปิดบัง",
      en: "Both may privately feel it, but neither has said it aloud yet — this is NOT a deliberate secret.",
    },
  },
};

/** `VdThreadClass` display labels — `domestic` is the first-class addition this feature exists to make possible (see plan Context: "the house renovation still isn't done"). */
export const threadClassCopy: Record<
  "plot" | "domestic" | "career" | "financial" | "health" | "relationship",
  { th: string; en: string }
> = {
  plot: { th: "โครงเรื่องหลัก", en: "Plot" },
  domestic: { th: "เรื่องในบ้าน/ชีวิตประจำวัน", en: "Domestic" },
  career: { th: "งาน/อาชีพ", en: "Career" },
  financial: { th: "การเงิน", en: "Financial" },
  health: { th: "สุขภาพ", en: "Health" },
  relationship: { th: "ความสัมพันธ์", en: "Relationship" },
};

/**
 * Coverage warning headline — shown only when the series is "thin" (fewer
 * real scripts than the target episode count, e.g. "series 17 has real
 * scripts for only 9 of 30 episodes" from the plan's own investigation).
 * Uses ONLY `episodesWithRealScript`/`targetEpisodeCount` — both real,
 * independently-verifiable counts from `getSeriesMemory`'s `coverage`.
 */
export function coverageHeadlineText(
  lang: VdSeriesMemoryLang,
  episodesWithRealScript: number,
  targetEpisodeCount: number
): string {
  return lang === "th"
    ? `สรุปจากบทจริงเพียง ${episodesWithRealScript}/${targetEpisodeCount} ตอน ตอนที่เหลือมาจากโครงเรื่องย่อ — ความต่อเนื่องอาจไม่ครบ ลองเติมไทม์ไลน์ด้านล่างด้วยตัวเอง`
    : `Grounded in real scripts for only ${episodesWithRealScript}/${targetEpisodeCount} episodes — the rest is summarized from outline/draft only, so continuity may be incomplete. Consider filling in the timeline below yourself.`;
}

/**
 * Coverage secondary line — memory-record coverage. Deliberately phrases
 * `episodesWithMemoryAndRealScript` as an ESTIMATE/correlation ("likely came
 * from", "inferred from correlation"), never as a certainty — the server's
 * `coverage.provenanceDistinguishable: false` says out loud that no DB
 * column actually records which producer wrote a given memory record; this
 * copy must not phrase it as more certain than that.
 */
export function coverageSecondaryText(
  lang: VdSeriesMemoryLang,
  episodesWithMemory: number,
  targetEpisodeCount: number,
  episodesWithMemoryAndRealScript: number
): string {
  return lang === "th"
    ? `มีบันทึกความจำแล้ว ${episodesWithMemory}/${targetEpisodeCount} ตอน (โดยประมาณ ${episodesWithMemoryAndRealScript} ตอนน่าจะมาจากบทจริง — เป็นการประมาณจากความสัมพันธ์ของข้อมูล ไม่ใช่ค่าที่ระบบบันทึกไว้ตรง ๆ)`
    : `${episodesWithMemory}/${targetEpisodeCount} episodes have a memory record (an estimated ${episodesWithMemoryAndRealScript} likely came from a real script — inferred from correlation, not stored provenance).`;
}

/**
 * `userEdited` consequence copy — surfaced BEFORE/WHILE editing, per this
 * feature's brief ("that is a consequential, sticky side effect — the UI
 * must tell the user that before/when they edit, not hide it"). `already`
 * picks the phrasing: the flag is series-memory-WIDE (every
 * `updateSeriesMemory` call sets the WHOLE `VdSeriesMemory.userEdited`, not
 * a per-episode flag), so a second edit doesn't newly trigger anything —
 * the copy for that case says so instead of repeating a "this is permanent"
 * warning that no longer describes a NEW consequence.
 */
export function userEditedConsequenceText(
  lang: VdSeriesMemoryLang,
  alreadyUserEdited: boolean
): string {
  if (alreadyUserEdited) {
    return lang === "th"
      ? "ความจำซีรีย์นี้ถูกทำเครื่องหมายว่าแก้ไขโดยผู้ใช้แล้ว ระบบสร้างเนื้อเรื่องอัตโนมัติจะไม่เขียนทับส่วนใดเลย"
      : "This series memory is already marked user-edited — automatic story generation will not overwrite any of it.";
  }
  return lang === "th"
    ? "หมายเหตุ: การบันทึกนี้จะทำให้ \"ความจำทั้งซีรีย์\" ถูกทำเครื่องหมายว่าแก้ไขโดยผู้ใช้อย่างถาวร ระบบสร้างเนื้อเรื่องอัตโนมัติจะไม่เขียนทับอีกต่อไป"
    : 'Note: saving this permanently marks the WHOLE series memory as "user-edited" — automatic story generation will never overwrite it again.';
}

export function userEditedBadgeText(lang: VdSeriesMemoryLang): string {
  return lang === "th" ? "แก้ไขโดยผู้ใช้" : "User-edited";
}
