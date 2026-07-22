/**
 * Marketplace Auto Review — Feature 136 (sequential 9-image storyboard),
 * section 02 §5.7 — pure fail-closed "@ImageN ↔ role" mapping validator.
 *
 * Clones the structure and the LENIENT-ON-SILENCE semantics of
 * `shared/verticalDramaSeries/characterIdentityMap.ts`'s
 * `findCharacterImageIndexMappingMismatches` (character-name based). This
 * module validates the same kind of self-contradiction, but for the
 * sequential storyboard's reference roles/angles instead of character names:
 * a prompt that explicitly and provably claims `@ImageN` is some role/angle
 * that contradicts the real attachment manifest (the order images are
 * actually submitted to the paid provider in) must never reach paid
 * generation unexamined — swapping "this is the product's back view" for
 * "this is the adult guardian reference" (or vice versa) can corrupt the
 * identity lock the same way a swapped character reference does.
 *
 * Deliberately LENIENT: a placeholder that is never given an explicit
 * "@ImageN = ..." / "... (@ImageN)" / "(@ImageN, ...)" binding anywhere in
 * the prompt is NOT a mismatch — only a PROVABLY self-contradictory prompt is
 * blocked in front of paid spend (same rationale as the VD validator this
 * clones; see that module's doc comments for the full write-up).
 *
 * Pure module — no server/db imports, importable from both client (section
 * 11 capacity/label UI) and server (SVC
 * `enforceSequentialReferenceIndexMapping`, section 04 skill-runner loop,
 * section 06 submit-time re-validation).
 */

/**
 * One resolved reference slot in the REAL attachment manifest — the order
 * images are actually submitted to the provider in. `role` intentionally
 * stays a loose `string` (not a fixed union) so this module never needs to
 * import the sequential-mode role enum from the server service; callers pass
 * whichever of `"primary_product" | "product_angle" | "character" |
 * "environment"` applies.
 */
export interface ReferenceIndexEntry {
  /** 1-based attachment position — the number inside the `@ImageN` placeholder. */
  index: number;
  role: string;
  /** Only meaningful when `role === "product_angle"`. */
  angleLabel?: string;
}

/** One provably self-contradictory "@ImageN is really X" claim found in a prompt. */
export interface ReferenceIndexMappingMismatch {
  imageIndex: number;
  /** What the prompt's own text explicitly claimed `@ImageN` is. */
  claimedRole: string;
  /** What the real attachment manifest says `@ImageN` actually is. */
  expectedRole: string;
  expectedAngleLabel?: string;
}

type ReferenceRoleCategory =
  | "primary_product"
  | "product_angle"
  | "character"
  | "environment";

type ReferenceRoleKeyword = {
  keyword: string;
  category: ReferenceRoleCategory;
  angleLabel?: string;
};

// Machine-checkable keyword lexicon only (spec §5.7) — no creative judgment,
// no attempt at full NLU. Sorted longest-keyword-first once at module load so
// a multi-word phrase always wins a non-overlapping claim over a shorter
// substring of itself (mirrors `characterIdentityMap.ts`'s name-matching
// safety property, `findKnownNameOccurrences`).
const RAW_REFERENCE_ROLE_LEXICON: ReferenceRoleKeyword[] = [
  // primary_product
  { keyword: "primary product identity", category: "primary_product" },
  { keyword: "primary product", category: "primary_product" },
  { keyword: "product identity", category: "primary_product" },
  { keyword: "main product", category: "primary_product" },
  { keyword: "hero product", category: "primary_product" },
  { keyword: "สินค้าหลัก", category: "primary_product" },
  // product_angle — one keyword group per angleLabel
  { keyword: "front angle", category: "product_angle", angleLabel: "front" },
  { keyword: "front view", category: "product_angle", angleLabel: "front" },
  { keyword: "มุมหน้า", category: "product_angle", angleLabel: "front" },
  { keyword: "back angle", category: "product_angle", angleLabel: "back" },
  { keyword: "back view", category: "product_angle", angleLabel: "back" },
  { keyword: "มุมหลัง", category: "product_angle", angleLabel: "back" },
  { keyword: "side angle", category: "product_angle", angleLabel: "side" },
  { keyword: "side view", category: "product_angle", angleLabel: "side" },
  { keyword: "มุมข้าง", category: "product_angle", angleLabel: "side" },
  { keyword: "top angle", category: "product_angle", angleLabel: "top" },
  { keyword: "top view", category: "product_angle", angleLabel: "top" },
  { keyword: "base angle", category: "product_angle", angleLabel: "base" },
  { keyword: "base view", category: "product_angle", angleLabel: "base" },
  { keyword: "bottom view", category: "product_angle", angleLabel: "base" },
  { keyword: "detail view", category: "product_angle", angleLabel: "detail" },
  { keyword: "close-up", category: "product_angle", angleLabel: "detail" },
  { keyword: "close up", category: "product_angle", angleLabel: "detail" },
  { keyword: "packaging", category: "product_angle", angleLabel: "package" },
  { keyword: "package", category: "product_angle", angleLabel: "package" },
  { keyword: "parts diagram", category: "product_angle", angleLabel: "parts_diagram" },
  { keyword: "exploded view", category: "product_angle", angleLabel: "parts_diagram" },
  { keyword: "scale reference", category: "product_angle", angleLabel: "scale" },
  { keyword: "size comparison", category: "product_angle", angleLabel: "scale" },
  { keyword: "product angle", category: "product_angle" }, // generic, no specific angleLabel
  { keyword: "additional angle", category: "product_angle" },
  // character (guardian/presenter — spec §5.7 keyword list)
  { keyword: "guardian", category: "character" },
  { keyword: "presenter", category: "character" },
  { keyword: "adult", category: "character" },
  { keyword: "ผู้ปกครอง", category: "character" },
  { keyword: "ผู้ใหญ่", category: "character" },
  // environment
  { keyword: "environment", category: "environment" },
  { keyword: "room", category: "environment" },
  { keyword: "scene", category: "environment" },
  { keyword: "ฉาก", category: "environment" },
  { keyword: "สถานที่", category: "environment" },
];

const REFERENCE_ROLE_LEXICON: ReferenceRoleKeyword[] = RAW_REFERENCE_ROLE_LEXICON.slice().sort(
  (a, b) => b.keyword.length - a.keyword.length,
);

/**
 * Longest-match-first, non-overlapping scan for every lexicon keyword
 * occurrence in `text`. Mirrors `characterIdentityMap.ts`'s
 * `findKnownNameOccurrences` exactly (same non-overlap/longest-first
 * algorithm, same reason: Thai script has no reliable regex word boundary,
 * so `\b` is never used here).
 */
function findKnownRoleOccurrences(
  text: string,
): Array<{ category: ReferenceRoleCategory; angleLabel?: string; start: number; end: number }> {
  const lowerText = text.toLowerCase();
  const claimedRanges: Array<[number, number]> = [];
  const occurrences: Array<{
    category: ReferenceRoleCategory;
    angleLabel?: string;
    start: number;
    end: number;
  }> = [];

  for (const entry of REFERENCE_ROLE_LEXICON) {
    const lowerKeyword = entry.keyword.toLowerCase();
    if (!lowerKeyword) continue;
    let searchFrom = 0;
    for (;;) {
      const idx = lowerText.indexOf(lowerKeyword, searchFrom);
      if (idx === -1) break;
      const end = idx + lowerKeyword.length;
      const overlapsLongerMatch = claimedRanges.some(
        ([start, claimedEnd]) => idx < claimedEnd && end > start,
      );
      if (!overlapsLongerMatch) {
        claimedRanges.push([idx, end]);
        occurrences.push({
          category: entry.category,
          angleLabel: entry.angleLabel,
          start: idx,
          end,
        });
      }
      searchFrom = idx + 1;
    }
  }

  return occurrences.sort((a, b) => a.start - b.start);
}

/**
 * Conservative extraction of every EXPLICIT "this `@ImageN` is this role"
 * claim in a prompt's own text. Three patterns only (spec §5.7), mirroring
 * `characterIdentityMap.ts`'s `extractExplicitMappingClaims` with role/angle
 * keywords standing in for character names, and an optional literal `@`
 * before `Image` (the manifest placeholder format is always `@ImageN`, but
 * prose sometimes drops the `@`):
 *
 * 1. `@ImageN = <role text>` — the canonical explicit binding.
 * 2. `<role text> (@Image N ...)` — role text immediately followed by a
 *    parenthetical image reference.
 * 3. `(@Image N, ... <role text>)` — index-first, role text shortly after
 *    inside the same parenthetical aside.
 */
function extractExplicitReferenceRoleClaims(
  prompt: string,
): Array<{ imageIndex: number; category: ReferenceRoleCategory; angleLabel?: string }> {
  const occurrences = findKnownRoleOccurrences(prompt);
  const claims: Array<{ imageIndex: number; category: ReferenceRoleCategory; angleLabel?: string }> =
    [];

  // Pattern 2: "<role text> (@Image N ...)" / "<role text> (attached Image N ...)".
  const afterRoleImageRe = /^\s*\(\s*(?:attached\s+)?@?Image\s*(\d+)/i;
  for (const occurrence of occurrences) {
    const tail = prompt.slice(occurrence.end, occurrence.end + 40);
    const match = afterRoleImageRe.exec(tail);
    if (match) {
      claims.push({
        imageIndex: Number(match[1]),
        category: occurrence.category,
        angleLabel: occurrence.angleLabel,
      });
    }
  }

  // Pattern 1: "@Image N = <role text>" (bare "Image N = ..." also accepted).
  // Unlike a proper-noun character name (VD precedent), a role/angle keyword
  // is often preceded by filler words ("the", "product", "a", "this is"), so
  // the window is scoped to the rest of the current sentence (next "." or 60
  // chars, whichever is shorter) rather than requiring immediate adjacency.
  const indexEqualsRe = /@?Image\s*(\d+)\s*=\s*/gi;
  for (const match of prompt.matchAll(indexEqualsRe)) {
    const tailStart = match.index! + match[0].length;
    const periodIdx = prompt.indexOf(".", tailStart);
    const tailEnd =
      periodIdx === -1
        ? Math.min(prompt.length, tailStart + 60)
        : Math.min(periodIdx, tailStart + 60);
    const occurrence = occurrences.find(o => o.start >= tailStart && o.start < tailEnd);
    if (occurrence) {
      claims.push({
        imageIndex: Number(match[1]),
        category: occurrence.category,
        angleLabel: occurrence.angleLabel,
      });
    }
  }

  // Pattern 3: "(@Image N, ... <role text>)" — index-first.
  const imageThenCommaRe = /\(\s*(?:attached\s+)?@?Image\s*(\d+)\s*,/gi;
  for (const match of prompt.matchAll(imageThenCommaRe)) {
    const spanStart = match.index! + match[0].length;
    const closeParenIdx = prompt.indexOf(")", spanStart);
    const spanEnd =
      closeParenIdx === -1
        ? Math.min(prompt.length, spanStart + 60)
        : Math.min(closeParenIdx, spanStart + 60);
    const occurrence = occurrences.find(o => o.start >= spanStart && o.start < spanEnd);
    if (occurrence) {
      claims.push({
        imageIndex: Number(match[1]),
        category: occurrence.category,
        angleLabel: occurrence.angleLabel,
      });
    }
  }

  return claims;
}

function claimedRoleLabel(category: ReferenceRoleCategory, angleLabel?: string): string {
  return category === "product_angle" && angleLabel ? `product_angle:${angleLabel}` : category;
}

/**
 * Find every EXPLICIT `@ImageN` ↔ role/angle claim in `prompt` that
 * contradicts `manifest` (the real attachment order the paid provider call
 * actually uses). See module doc comment for the full rationale — this is
 * deliberately LENIENT ON SILENCE: a placeholder never given an explicit
 * binding anywhere in the prompt is NOT a mismatch. It is NOT lenient on a
 * claim about an index that simply does not exist in `manifest` at all —
 * that is unconditionally wrong (there is no possible "true role" that could
 * make it correct) and is always reported (`expectedRole: "not_attached"`).
 * This distinction is what makes submit-time re-validation against a LIVE
 * manifest catch drift: a prompt authored against an earlier manifest that
 * bound `@ImageN` to a role dropped from the live manifest must still fail.
 *
 * Pure — no I/O, importable from client and server.
 */
export function findReferenceIndexMappingMismatches(
  prompt: string,
  manifest: readonly ReferenceIndexEntry[],
): ReferenceIndexMappingMismatch[] {
  if (!prompt || manifest.length === 0) return [];

  const byIndex = new Map<number, ReferenceIndexEntry>();
  for (const entry of manifest) {
    if (!byIndex.has(entry.index)) byIndex.set(entry.index, entry);
  }

  const claims = extractExplicitReferenceRoleClaims(prompt);
  const mismatches: ReferenceIndexMappingMismatch[] = [];
  const seen = new Set<string>();

  for (const claim of claims) {
    const expected = byIndex.get(claim.imageIndex);
    const claimedRole = claimedRoleLabel(claim.category, claim.angleLabel);

    // An explicit claim about an index that is NOT part of the current
    // manifest at all is unconditionally wrong — there is no "expected role"
    // that could make it correct, so (unlike a placeholder that is simply
    // never claimed anywhere — true silence) this is never ignored. This is
    // what makes submit-time re-validation against a LIVE manifest catch
    // drift: a prompt authored against an earlier manifest that bound
    // `@ImageN` to a role that no longer has a slot at all must still fail.
    if (!expected) {
      const dedupeKey = `${claim.imageIndex}:${claimedRole}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      mismatches.push({
        imageIndex: claim.imageIndex,
        claimedRole,
        expectedRole: "not_attached",
      });
      continue;
    }

    const roleMismatch = expected.role !== claim.category;
    const angleMismatch =
      !roleMismatch &&
      claim.category === "product_angle" &&
      claim.angleLabel !== undefined &&
      claim.angleLabel !== expected.angleLabel;
    if (!roleMismatch && !angleMismatch) continue; // consistent claim

    const dedupeKey = `${claim.imageIndex}:${claimedRole}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    mismatches.push({
      imageIndex: claim.imageIndex,
      claimedRole,
      expectedRole: expected.role,
      expectedAngleLabel: expected.angleLabel,
    });
  }

  return mismatches;
}

function describeReferenceRole(role: string, angleLabel?: string): string {
  if (role === "primary_product") return "the primary product reference";
  if (role === "product_angle") {
    return angleLabel
      ? `a supporting product ${angleLabel} angle reference`
      : "a supporting product angle reference";
  }
  if (role === "character") return "the adult guardian/presenter reference";
  if (role === "environment") return "the environment/setting reference";
  if (role === "not_attached") {
    return "not attached at all in this submission";
  }
  return `a ${role} reference`;
}

function describeClaimedReferenceRole(claimedRole: string): string {
  const [category, angleLabel] = claimedRole.split(":");
  return describeReferenceRole(category, angleLabel);
}

/**
 * Deterministic corrective-retry instruction for the ONE retry round
 * (server-side `enforceSequentialReferenceIndexMapping`): names every
 * mismatched `@ImageN` with its TRUE role/angle, read fresh from `manifest`
 * (not merely echoed from the mismatch objects, so the directive stays
 * correct even if a caller hand-built `mismatches` from a stale manifest).
 * Pure string builder — the SKILL rewrites the prompt itself (skill-first;
 * the `@ImageN` ↔ role mapping is skill-authored prose, never
 * code-appended — memory `project_vd_start_frame_reference_mapping`).
 */
export function buildReferenceIndexMappingCorrectionDirective(
  mismatches: readonly ReferenceIndexMappingMismatch[],
  manifest: readonly ReferenceIndexEntry[],
): string {
  if (mismatches.length === 0) return "";

  const byIndex = new Map<number, ReferenceIndexEntry>();
  for (const entry of manifest) {
    if (!byIndex.has(entry.index)) byIndex.set(entry.index, entry);
  }

  const lines = mismatches
    .slice()
    .sort((a, b) => a.imageIndex - b.imageIndex)
    .map(mismatch => {
      const manifestEntry = byIndex.get(mismatch.imageIndex);
      const truth = describeReferenceRole(
        manifestEntry?.role ?? mismatch.expectedRole,
        manifestEntry?.angleLabel ?? mismatch.expectedAngleLabel,
      );
      const claimed = describeClaimedReferenceRole(mismatch.claimedRole);
      return `@Image${mismatch.imageIndex} is ${truth}, NOT ${claimed} — rewrite the binding line(s) for @Image${mismatch.imageIndex} to match its real role before resubmission.`;
    });

  return [
    "REFERENCE INDEX MAPPING CORRECTION (MANDATORY — fix before resubmission):",
    ...lines,
  ].join("\n");
}
