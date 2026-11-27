import { describe, expect, it } from "vitest";

import { getStagedDialogueSpeakerLabels } from "../marketplaceAutoReviewStoryArcPlanner";

describe("getStagedDialogueSpeakerLabels", () => {
  const cast = [
    {
      castId: "lead",
      name: "ธีร์",
      role: "host" as const,
      depictsMinor: false,
    },
    {
      castId: "adult-support",
      name: "พิมพ์ชนก",
      role: "support" as const,
      depictsMinor: false,
    },
    {
      castId: "child",
      name: "ภูมิ",
      role: "support" as const,
      depictsMinor: true,
    },
  ];

  it("attributes unlabelled solo narration to the sole adult lead and ignores a minor support", () => {
    expect(getStagedDialogueSpeakerLabels("พูดถึงการดูแลเด็ก", cast)).toEqual([
      "ธีร์",
    ]);
  });

  it("does not guess when there are multiple eligible adult leads", () => {
    expect(
      getStagedDialogueSpeakerLabels("พูดถึงการดูแลเด็ก", [
        ...cast,
        {
          castId: "second-lead",
          name: "นที",
          role: "guest" as const,
          depictsMinor: false,
        },
      ])
    ).toEqual([]);
  });

  it("does not infer a speaker who is absent from the shot cast", () => {
    expect(
      getStagedDialogueSpeakerLabels("พูดถึงการดูแลเด็ก", cast, ["child"])
    ).toEqual([]);
  });

  it("removes named minor dialogue and never assigns the child as a speaker", () => {
    expect(
      getStagedDialogueSpeakerLabels("ภูมิ: ผมพูดเอง\nธีร์: ผมช่วยได้", cast)
    ).toEqual(["ธีร์"]);
  });
});
