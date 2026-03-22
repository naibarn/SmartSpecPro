import { describe, expect, it } from "vitest";

import {
  TEAM_BLUEPRINTS,
  buildBlueprintPersonaInput,
  findReusablePersonaForBlueprint,
  resolveLegacyTemplateBlueprintId,
  instantiateBlueprintAssistantDrafts,
} from "./teamBlueprints";

describe("teamBlueprints", () => {
  it("ships a usable set of preset teams with orchestrated creative coverage", () => {
    expect(TEAM_BLUEPRINTS.length).toBeGreaterThanOrEqual(4);

    const creativeStudio = TEAM_BLUEPRINTS.find((blueprint) => blueprint.id === "creative-content-studio");
    expect(creativeStudio).toBeDefined();
    expect(creativeStudio?.members).toHaveLength(6);
    expect(creativeStudio?.members.map((member) => member.roleTitle)).toEqual(
      expect.arrayContaining([
        "Content Director",
        "Graphic Designer",
        "Video Producer",
        "Channel Publisher",
      ]),
    );
  });

  it("builds persona create payloads from blueprint seeds with preserved source metadata", () => {
    const creativeStudio = TEAM_BLUEPRINTS.find((blueprint) => blueprint.id === "creative-content-studio");
    const graphicDesigner = creativeStudio!.members.find((member) => member.id === "graphic-designer")!;

    const personaInput = buildBlueprintPersonaInput(graphicDesigner.persona);

    expect(personaInput.scope).toBe("user");
    expect(personaInput.name).toBe("Graphic Designer");
    expect(personaInput.sourceTemplateIds).toEqual([
      "graphic-designer",
      "marketing-strategist",
    ]);
    expect(personaInput.sourceTemplateLabels).toEqual([
      "Graphic Designer",
      "Marketing Strategist",
    ]);
    expect(personaInput.systemPromptPrefix).toMatch(/cross-functional AI copilot/i);
  });

  it("reuses existing personas before provisioning new ones", () => {
    const creativeStudio = TEAM_BLUEPRINTS.find((blueprint) => blueprint.id === "creative-content-studio");
    const videoProducer = creativeStudio!.members.find((member) => member.id === "video-producer")!;

    const reusable = findReusablePersonaForBlueprint(
      [
        {
          id: "persona-1",
          name: "Video Producer",
          sourceTemplateIds: ["creative-writer", "video-producer"],
          tone: "creative",
        },
      ],
      videoProducer.persona,
    );

    expect(reusable?.id).toBe("persona-1");
  });

  it("prefers template metadata matches over same-name personas", () => {
    const creativeStudio = TEAM_BLUEPRINTS.find((blueprint) => blueprint.id === "creative-content-studio");
    const graphicDesigner = creativeStudio!.members.find((member) => member.id === "graphic-designer")!;

    const reusable = findReusablePersonaForBlueprint(
      [
        {
          id: "persona-same-name",
          name: "Graphic Designer",
          sourceTemplateIds: ["creative-writer"],
          tone: "creative",
        },
        {
          id: "persona-template-match",
          name: "Visual Maker",
          sourceTemplateIds: ["graphic-designer", "marketing-strategist"],
          tone: "creative",
        },
      ],
      graphicDesigner.persona,
    );

    expect(reusable?.id).toBe("persona-template-match");
  });

  it("marks blueprint members without matches for persona provisioning", () => {
    const drafts = instantiateBlueprintAssistantDrafts(
      TEAM_BLUEPRINTS[0],
      [],
    );

    expect(drafts.every((draft) => draft.memberKind === "assistant")).toBe(true);
    expect(drafts.some((draft) => !draft.personaId && !!draft.personaBlueprint)).toBe(true);
    expect(drafts.find((draft) => draft.isLead)?.memberRole).toBe("orchestrator");
  });

  it("maps legacy template ids to supported blueprints", () => {
    expect(resolveLegacyTemplateBlueprintId("tmpl-team-research-analysis")).toBe("research-insight-desk");
    expect(resolveLegacyTemplateBlueprintId("tmpl-team-content-creation")).toBe("creative-content-studio");
    expect(resolveLegacyTemplateBlueprintId("tmpl-team-code-review")).toBe("engineering-review-pod");
    expect(resolveLegacyTemplateBlueprintId("unknown-template")).toBeNull();
  });
});
