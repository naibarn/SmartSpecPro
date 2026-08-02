import { describe, expect, it } from "vitest";

import {
  assignMarketplaceCastRoles,
  isMarketplaceCastLeadRole,
  MARKETPLACE_CHARACTER_CAST_MAX,
  MARKETPLACE_CHARACTER_CAST_MAX_LEADS,
} from "../characterCast";

/**
 * `planning/marketplace-four-character-cast/plan.md` P1 — the roster grows to 4
 * while the DIALOGUE engine stays two-voice. That only works if exactly one
 * host and one guest can ever exist: `buildShotDialogueTurnsTH/EN` and
 * `buildStagedTwoVoiceDescriptor` destructure one of each, and
 * `resolveStagedConversationMode` counts leads. A second "host" arriving from
 * older persisted metadata (roles used to be assigned purely by pick order)
 * must therefore be demoted, never duplicated.
 */
describe("assignMarketplaceCastRoles", () => {
  const entry = (characterRole?: string) => ({ characterRole });

  it("assigns host, guest, then support positionally", () => {
    expect(
      assignMarketplaceCastRoles([entry(), entry(), entry(), entry()]).map(
        (member) => member.characterRole
      )
    ).toEqual(["host", "guest", "support", "support"]);
  });

  it("honors an explicit role the caller already set", () => {
    expect(
      assignMarketplaceCastRoles([
        entry("guest"),
        entry("host"),
        entry(),
      ]).map((member) => member.characterRole)
    ).toEqual(["guest", "host", "support"]);
  });

  it("never produces two hosts — the duplicate is re-filled into the free lead seat", () => {
    // Legacy metadata really can carry duplicates (roles used to be assigned
    // by pick order). Re-filling to `guest` keeps this a two-person
    // conversation; demoting to `support` would silently collapse it to solo.
    expect(
      assignMarketplaceCastRoles([entry("host"), entry("host")]).map(
        (member) => member.characterRole
      )
    ).toEqual(["host", "guest"]);
    expect(
      assignMarketplaceCastRoles([
        entry("host"),
        entry("host"),
        entry("host"),
      ]).map((member) => member.characterRole)
    ).toEqual(["host", "guest", "support"]);
  });

  it("never promotes an EXPLICIT support into a free lead seat", () => {
    // "This person is not a main speaker" must survive, even though the guest
    // seat is empty.
    expect(
      assignMarketplaceCastRoles([entry("host"), entry("support")]).map(
        (member) => member.characterRole
      )
    ).toEqual(["host", "support"]);
  });

  it("guarantees at least one lead so the dialogue engine always has a voice", () => {
    expect(
      assignMarketplaceCastRoles([entry("support"), entry("support")]).map(
        (member) => member.characterRole
      )
    ).toEqual(["host", "support"]);
  });

  it("returns an empty roster untouched", () => {
    expect(assignMarketplaceCastRoles([])).toEqual([]);
  });

  it("back-fills the missing lead when only one explicit lead is supplied", () => {
    // A legacy run that stored only `guest` still gets a host, so
    // `two_person_conversation` keeps resolving.
    expect(
      assignMarketplaceCastRoles([entry("guest"), entry(), entry()]).map(
        (member) => member.characterRole
      )
    ).toEqual(["guest", "host", "support"]);
  });

  it("preserves every other field on the entry", () => {
    const [first] = assignMarketplaceCastRoles([
      { characterRole: undefined, characterName: "ลลิน", depictsMinor: false },
    ]);
    expect(first).toMatchObject({
      characterName: "ลลิน",
      depictsMinor: false,
      characterRole: "host",
    });
  });

  it("never mutates the caller's entries", () => {
    const input = [entry("host"), entry("host")];
    assignMarketplaceCastRoles(input);
    expect(input[1].characterRole).toBe("host");
  });

  it("exposes the roster and lead ceilings the whole feature keys off", () => {
    expect(MARKETPLACE_CHARACTER_CAST_MAX).toBe(4);
    expect(MARKETPLACE_CHARACTER_CAST_MAX_LEADS).toBe(2);
  });
});

describe("isMarketplaceCastLeadRole", () => {
  it("counts only host and guest as leads", () => {
    expect(isMarketplaceCastLeadRole("host")).toBe(true);
    expect(isMarketplaceCastLeadRole("guest")).toBe(true);
    expect(isMarketplaceCastLeadRole("support")).toBe(false);
    expect(isMarketplaceCastLeadRole(undefined)).toBe(false);
    expect(isMarketplaceCastLeadRole(null)).toBe(false);
  });
});
