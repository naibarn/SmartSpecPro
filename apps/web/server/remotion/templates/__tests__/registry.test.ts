import { describe, expect, it } from "vitest";

import { MOTION_TEMPLATE_IDS } from "../../../../shared/videoIntelligence/motionTemplates";
import { MOTION_TEMPLATE_REGISTRY } from "../index";

describe("MOTION_TEMPLATE_REGISTRY", () => {
  it("registry keys exactly match MOTION_TEMPLATE_IDS", () => {
    const registryKeys = Object.keys(MOTION_TEMPLATE_REGISTRY).sort();
    const idList = [...MOTION_TEMPLATE_IDS].sort();
    expect(registryKeys).toEqual(idList);
  });

  it("every template declares a strict paramsSchema and brandTokens", () => {
    for (const id of MOTION_TEMPLATE_IDS) {
      const template = MOTION_TEMPLATE_REGISTRY[id];
      const probe = template.paramsSchema.safeParse({
        __unknown_probe_key__: true,
      });
      expect(probe.success).toBe(false);
      expect(Array.isArray(template.meta.brandTokens)).toBe(true);
    }
  });

  it("every template's meta.kind is 'layer_pack'", () => {
    for (const id of MOTION_TEMPLATE_IDS) {
      expect(MOTION_TEMPLATE_REGISTRY[id].meta.kind).toBe("layer_pack");
    }
  });
});
