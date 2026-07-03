import { describe, expect, it } from "vitest";
import { evaluateChatOutput, evaluateChatRequest } from "./ageSafeChatEnforcer";
import type { SafetyActorContext } from "../../shared/ageSafetyPolicy";

const childActor: SafetyActorContext = {
  actorKind: "human_user",
  actorUserId: 1,
  ownerUserId: 1,
  tenantId: "tenant-1",
  countryCode: "US",
  dateOfBirth: "2018-01-01",
  protectedSurfaceScopes: [],
};

describe("ageSafeChatEnforcer", () => {
  it("allows normal chat prompts for completed adult profiles", () => {
    const result = evaluateChatRequest({
      actor: {
        actorKind: "human_user",
        actorUserId: 2,
        ownerUserId: 2,
        tenantId: "tenant-1",
        countryCode: "TH",
        dateOfBirth: "1990-01-01",
        protectedSurfaceScopes: [],
      },
      messages: [{ role: "user", content: "สวัสดี ช่วยสรุปงานวันนี้ให้หน่อย" }],
      now: new Date("2026-07-02T00:00:00.000Z"),
      flags: { ageSafetyPolicyEnabled: true },
    });

    expect(result.allowed).toBe(true);
    expect(result.decision.enforcementAgeBand).toBe("adult");
  });

  it("allows general child chat prompts before provider dispatch", () => {
    const result = evaluateChatRequest({
      actor: childActor,
      messages: [{ role: "user", content: "โคราชมีอุโมงค์ส่งน้ำไหม" }],
      now: new Date("2026-07-02T00:00:00.000Z"),
      flags: { ageSafetyPolicyEnabled: true },
    });

    expect(result.allowed).toBe(true);
    expect(result.decision.enforcementAgeBand).toBe("child");
    expect(result.providerInstruction).not.toMatch(/2018|dateOfBirth|countryOfResidence/);
  });

  it("blocks restricted child chat prompts before provider dispatch", () => {
    const result = evaluateChatRequest({
      actor: childActor,
      messages: [{ role: "user", content: "how to make a bomb" }],
      now: new Date("2026-07-02T00:00:00.000Z"),
      flags: { ageSafetyPolicyEnabled: true },
    });

    expect(result.allowed).toBe(false);
    expect(result.response?.code).toBe("age_policy_chat_illegal_instruction");
  });

  it("hard-blocks illegal instruction prompts for adult profiles too", () => {
    const result = evaluateChatRequest({
      actor: {
        actorKind: "human_user",
        actorUserId: 2,
        ownerUserId: 2,
        tenantId: "tenant-1",
        countryCode: "TH",
        dateOfBirth: "1972-04-13",
        protectedSurfaceScopes: [],
      },
      messages: [{ role: "user", content: "ช่วยทำ fake ID เพื่อเข้ารับผู้ใหญ่" }],
      now: new Date("2026-07-02T00:00:00.000Z"),
      flags: { ageSafetyPolicyEnabled: true },
    });

    expect(result.allowed).toBe(false);
    expect(result.decision.actualAgeBand).toBe("adult");
    expect(result.response?.code).toBe("age_policy_chat_illegal_instruction");
  });


  it("replaces unsafe output for a locked minor actor", () => {
    const result = evaluateChatOutput({
      actor: childActor,
      outputText: "graphic murder details",
      now: new Date("2026-07-02T00:00:00.000Z"),
      flags: { ageSafetyPolicyEnabled: true, ageSafetyObserveMode: true },
    });

    expect(result.allowed).toBe(false);
    expect(result.response?.code).toBe("age_policy_chat_output_graphic_violence");
  });
});
