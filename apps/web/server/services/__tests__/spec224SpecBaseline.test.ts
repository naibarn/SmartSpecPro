import { describe, expect, it } from "vitest";

import {
  buildSpec224SpecBaseline,
  Spec224SpecBaselineError,
  toRequirementClosureInput,
} from "../spec224SpecBaseline";

const source = `# Spec 224\n\n## Scope\nThe controller SHALL preserve worker_jobs as the execution authority.\n- [ ] The baseline MUST retain every explicit requirement.\n\n## Notes\nThis prose describes context only.`;

const input = {
  specId: "224",
  revision: "21",
  authorityRef: "authority:platform-engineering",
  scopeEnvelopeRef: "scope:224-r21",
  sourceMarkdown: source,
};

describe("Spec 224 deterministic SpecBaseline", () => {
  it("produces a repeatable immutable baseline with ordered heading and explicit requirement source refs", () => {
    const first = buildSpec224SpecBaseline(input);
    const second = buildSpec224SpecBaseline({ ...input });

    expect(second.sourceDigest).toBe(first.sourceDigest);
    expect(second.baselineId).toBe(first.baselineId);
    expect(first.sections).toMatchObject([
      { id: expect.any(String), line: 1, level: 1, title: "Spec 224" },
      { id: expect.any(String), line: 3, level: 2, title: "Scope" },
      { id: expect.any(String), line: 7, level: 2, title: "Notes" },
    ]);
    expect(first.requirements).toMatchObject([
      {
        id: expect.any(String),
        sourceRef: "spec:224@21#L4",
        text: "The controller SHALL preserve worker_jobs as the execution authority.",
      },
      {
        id: expect.any(String),
        sourceRef: "spec:224@21#L5",
        text: "The baseline MUST retain every explicit requirement.",
      },
    ]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.requirements)).toBe(true);
  });

  it("keeps exact artifact identity separate from canonical Markdown normalization", () => {
    const crlf = buildSpec224SpecBaseline({
      ...input,
      sourceMarkdown: `\r\n${source.replace(/\n/g, "\r\n")}   \r\n`,
    });
    const normalized = buildSpec224SpecBaseline(input);

    expect(crlf.sourceDigest).toBe(normalized.sourceDigest);
    expect(crlf.sourceArtifactDigest).not.toBe(normalized.sourceArtifactDigest);
    expect(
      crlf.sections.map(({ line, level, title }) => ({ line, level, title }))
    ).toEqual(
      normalized.sections.map(({ line, level, title }) => ({
        line,
        level,
        title,
      }))
    );
    expect(
      crlf.requirements.map(({ sourceRef, text }) => ({ sourceRef, text }))
    ).toEqual(
      normalized.requirements.map(({ sourceRef, text }) => ({
        sourceRef,
        text,
      }))
    );
    expect(crlf.requirements.map(item => item.id)).not.toEqual(
      normalized.requirements.map(item => item.id)
    );
  });

  it("changes the digest and baseline when canonical source changes", () => {
    const changed = buildSpec224SpecBaseline({
      ...input,
      sourceMarkdown: source.replace("MUST retain", "MUST durably retain"),
    });
    const baseline = buildSpec224SpecBaseline(input);

    expect(changed.sourceDigest).not.toBe(baseline.sourceDigest);
    expect(changed.baselineId).not.toBe(baseline.baselineId);
    expect(changed.requirements[1]?.id).not.toBe(baseline.requirements[1]?.id);
  });

  it("binds stable requirement identities to the exact revision and source artifact", () => {
    const baseline = buildSpec224SpecBaseline(input);
    const nextRevision = buildSpec224SpecBaseline({
      ...input,
      revision: "22",
    });

    expect(nextRevision.sourceDigest).toBe(baseline.sourceDigest);
    expect(nextRevision.sourceArtifactDigest).toBe(
      baseline.sourceArtifactDigest
    );
    expect(nextRevision.requirements.map(item => item.id)).not.toEqual(
      baseline.requirements.map(item => item.id)
    );
    expect(nextRevision.baselineId).not.toBe(baseline.baselineId);
  });

  it("retains duplicate explicit statements as separate line-addressed requirements", () => {
    const duplicate = buildSpec224SpecBaseline({
      ...input,
      sourceMarkdown: `# Spec 224\n\nThe run MUST keep evidence.\nThe run MUST keep evidence.`,
    });

    expect(duplicate.requirements).toHaveLength(2);
    expect(
      duplicate.requirements.map(requirement => requirement.sourceRef)
    ).toEqual(["spec:224@21#L3", "spec:224@21#L4"]);
    expect(
      new Set(duplicate.requirements.map(requirement => requirement.id)).size
    ).toBe(2);
  });

  it("converts only captured baseline requirements into closure input", () => {
    const closureInput = toRequirementClosureInput(
      buildSpec224SpecBaseline(input)
    );

    expect(closureInput).toEqual([
      {
        id: expect.any(String),
        sourceRef: "spec:224@21#L4",
        text: "The controller SHALL preserve worker_jobs as the execution authority.",
      },
      {
        id: expect.any(String),
        sourceRef: "spec:224@21#L5",
        text: "The baseline MUST retain every explicit requirement.",
      },
    ]);
    expect(closureInput).not.toContainEqual(
      expect.objectContaining({ text: "This prose describes context only." })
    );
  });

  it("rejects malformed references and untrusted source without silently creating a baseline", () => {
    expect(() =>
      buildSpec224SpecBaseline({ ...input, specId: "224 / untrusted" })
    ).toThrow("SPEC_ID_INVALID");
    expect(() =>
      buildSpec224SpecBaseline({ ...input, revision: "r 21" })
    ).toThrow("REVISION_INVALID");
    expect(() =>
      buildSpec224SpecBaseline({ ...input, authorityRef: "invalid ref" })
    ).toThrow("AUTHORITY_REF_INVALID");
    expect(() =>
      buildSpec224SpecBaseline({ ...input, scopeEnvelopeRef: "scope:bad ref" })
    ).toThrow("SCOPE_ENVELOPE_REF_INVALID");
    expect(() =>
      buildSpec224SpecBaseline({ ...input, sourceMarkdown: "" })
    ).toThrow("SOURCE_EMPTY");
    expect(() =>
      buildSpec224SpecBaseline({
        ...input,
        sourceMarkdown: "# Large\n" + "x".repeat(1024 * 1024),
      })
    ).toThrow("SOURCE_OVERSIZED");
    expect(() =>
      buildSpec224SpecBaseline({
        ...input,
        sourceMarkdown: "# Secret\nkey=sk-0123456789abcdefghijklmnop",
      })
    ).toThrow(Spec224SpecBaselineError);
  });
});
