import React from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DynamicSkillForm, { type SkillInputSchema } from "./DynamicSkillForm";

describe("DynamicSkillForm parent-owned fields", () => {
  it("does not seed defaults for excluded aspect-ratio fields", async () => {
    const onChange = vi.fn();
    const schema: SkillInputSchema = {
      title: "Aspect Ratio Form",
      sections: [{
        id: "basic",
        title: "Basic",
        fields: [
          { id: "aspectRatio", type: "select", label: "Aspect Ratio", default: "16:9" },
          { id: "quality", type: "text", label: "Quality", default: "high" },
        ],
      }],
    };

    render(
      <DynamicSkillForm
        schema={schema}
        values={{}}
        onChange={onChange}
        excludeFields={["aspectRatio"]}
      />
    );

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ quality: "high" });
    });
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ aspectRatio: expect.anything() })
    );
  });
});
