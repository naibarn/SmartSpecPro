import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ModelInputArrayFieldEditor } from "./ModelInputArrayFieldEditor";
import type { ModelInputField } from "@/lib/mediaModelInputs";

const speakerField: ModelInputField = {
  key: "speakers",
  label: "Speakers",
  type: "array",
  itemLabel: "Speaker",
  default: [],
  maxItems: 2,
  itemFields: [
    {
      key: "speaker_id",
      label: "Speaker ID",
      type: "text",
      required: true,
    },
    {
      key: "voice",
      label: "Voice",
      type: "select",
      required: true,
      options: [
        { value: "Kore", label: "Kore" },
        { value: "Aoede", label: "Aoede" },
      ],
    },
  ],
  syncWith: "none",
};

function Harness() {
  const [value, setValue] = useState<unknown>([]);

  return (
    <ModelInputArrayFieldEditor
      field={speakerField}
      value={value}
      onChange={setValue}
    />
  );
}

describe("ModelInputArrayFieldEditor", () => {
  it("adds and removes structured speaker rows with nested inputs", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText("No Speaker yet.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add speaker/i }));

    expect(screen.getByText("Speaker 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Advanced Speaker Speaker ID")).toHaveValue("Speaker1");
    expect(screen.getByLabelText("Advanced Speaker Voice")).toHaveValue("Kore");

    await user.click(screen.getAllByRole("button")[1]);

    await waitFor(() => {
      expect(screen.getByText("No Speaker yet.")).toBeInTheDocument();
    });
  });
});
