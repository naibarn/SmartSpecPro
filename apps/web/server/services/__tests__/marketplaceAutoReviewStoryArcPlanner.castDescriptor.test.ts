import { describe, expect, it } from "vitest";

import {
  resolveStagedCastDescriptor,
  type StagedCastMember,
} from "../marketplaceAutoReviewStoryArcPlanner";

/**
 * `planning/marketplace-four-character-cast/plan.md` — optional per-character
 * description with a role-derived default.
 *
 * An UPLOADED photo carries no identity the system can read (a Drama Series
 * pick brings occupation/personality from the series bible), so without a
 * default the planner sees a bare name and writes a generic script. The role
 * already says what each person is FOR, so the default just restates it —
 * never invented character content — and anything the user types wins.
 *
 * The default must follow the run's own language: a Thai role note spliced
 * into an English script (or the reverse) is a defect, not a nicety.
 */
function member(
  role: StagedCastMember["role"],
  descriptor?: string
): Pick<StagedCastMember, "role" | "descriptor"> {
  return { role, ...(descriptor === undefined ? {} : { descriptor }) };
}

describe("resolveStagedCastDescriptor", () => {
  it("defaults the host to the presenter/demonstrator", () => {
    expect(resolveStagedCastDescriptor(member("host"), "th")).toContain(
      "สาธิตสินค้า"
    );
    expect(resolveStagedCastDescriptor(member("host"), "en")).toContain(
      "demonstrator"
    );
  });

  it("defaults the guest to the assistant", () => {
    expect(resolveStagedCastDescriptor(member("guest"), "th")).toContain(
      "ผู้ช่วย"
    );
    expect(resolveStagedCastDescriptor(member("guest"), "en")).toContain(
      "assistant"
    );
  });

  it("defaults a supporting member to an atmosphere/story role", () => {
    expect(resolveStagedCastDescriptor(member("support"), "th")).toContain(
      "ตัวประกอบ"
    );
    expect(resolveStagedCastDescriptor(member("support"), "en")).toContain(
      "supporting"
    );
  });

  it("NEVER emits the other language's default", () => {
    const english = [
      resolveStagedCastDescriptor(member("host"), "en"),
      resolveStagedCastDescriptor(member("guest"), "en"),
      resolveStagedCastDescriptor(member("support"), "en"),
    ];
    for (const value of english) {
      expect(/[฀-๿]/u.test(value)).toBe(false);
    }
  });

  it("passes an authored descriptor through verbatim — Thai", () => {
    expect(
      resolveStagedCastDescriptor(
        member("host", "คุณแม่ลูกสองที่ชอบรีวิวของเล่น"),
        "en"
      )
    ).toBe("คุณแม่ลูกสองที่ชอบรีวิวของเล่น");
  });

  it("passes an authored descriptor through verbatim — English", () => {
    expect(
      resolveStagedCastDescriptor(member("guest", "toy shop owner"), "th")
    ).toBe("toy shop owner");
  });

  it("treats a whitespace-only descriptor as absent and falls back to the role", () => {
    expect(resolveStagedCastDescriptor(member("host", "   "), "th")).toContain(
      "สาธิตสินค้า"
    );
  });
});
