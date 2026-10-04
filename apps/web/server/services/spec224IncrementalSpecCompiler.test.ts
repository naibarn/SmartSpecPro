import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import {
  compileSpec224IncrementalSpecSet,
  type Spec224IncrementalSpecSetInput,
} from "./spec224IncrementalSpecCompiler";

function digest(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

function contentDigest(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function revision(
  files: Array<{ path: string; content: string; digest?: string }>,
  revision = 1
): Spec224IncrementalSpecSetInput {
  return {
    runnerId: "runner-a",
    workspaceId: "workspace-a",
    revision,
    digest: digest(String(revision)),
    files: files.map(file => ({
      path: file.path,
      content: file.content,
      // A persisted SpecSet digest must bind the exact uploaded bytes. Test
      // fixtures derive it here so their compiler input has the same contract.
      digest: contentDigest(file.content),
    })),
  };
}

describe("Spec 224 incremental SpecSet compiler", () => {
  it("compiles an explicitly declared Markdown-only package", () => {
    const content = [
      "# Workspace persistence",
      "",
      "- [ ] MUST preserve the selected workspace identity.",
      "",
      "```spec224-work-packages",
      JSON.stringify({
        spec224: {
          workPackages: [{
            id: "workspace-persistence",
            requirementRefs: [{ artifactPath: "spec.md", line: 3 }],
            dependsOn: [],
            acceptanceCriteria: ["A second Chat section sees the same workspace."],
            verification: [{ id: "focused-check", kind: "test", ref: "manual:verify workspace binding" }],
            allowedWriteSet: ["apps/web/server/services/workspaceBinding.ts"],
          }],
        },
      }, null, 2),
      "```",
    ].join("\n");
    const result = compileSpec224IncrementalSpecSet(revision([{ path: "spec.md", content }]));

    expect(result.workPackages).toHaveLength(1);
    expect(result.workPackages[0]).toMatchObject({
      externalId: "workspace-persistence",
      readiness: "READY",
      requirementIds: [expect.any(String)],
    });
    expect(result.runnableWorkPackageIds).toEqual([result.workPackages[0]!.id]);
  });

  it("blocks malformed or ambiguous Markdown package metadata with a finding", () => {
    const result = compileSpec224IncrementalSpecSet(revision([{
      path: "spec.md",
      content: [
        "- [ ] MUST preserve the selected workspace identity.",
        "```spec224-work-packages",
        "{not-json}",
        "```",
      ].join("\n"),
    }]));

    expect(result.workPackages).toEqual([]);
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: "MARKDOWN_WORK_PACKAGE_METADATA_INVALID",
      artifactPath: "spec.md",
      severity: "error",
    }));
  });

  it("enumerates source-addressed requirements and admits only independently complete packages", () => {
    const input = revision([
      {
        path: "specs/auth.md",
        content: "# Auth\n\n- [ ] MUST authenticate a user.",
        digest: digest("a"),
      },
      {
        path: "specs/packages.json",
        content: JSON.stringify({
          spec224: {
            workPackages: [
              {
                id: "auth-api",
                requirementRefs: [{ artifactPath: "specs/auth.md", line: 3 }],
                dependsOn: [],
                acceptanceCriteria: ["A valid login creates a session."],
                verification: [
                  {
                    id: "auth-unit",
                    kind: "test",
                    ref: "test:apps/web/server/auth.test.ts",
                  },
                ],
                allowedWriteSet: ["apps/web/server/auth.ts"],
              },
              {
                id: "future-ui",
                requirementRefs: [{ artifactPath: "specs/missing.md", line: 3 }],
                dependsOn: [],
                acceptanceCriteria: ["The login form is visible."],
                verification: [
                  {
                    id: "ui-test",
                    kind: "test",
                    ref: "test:apps/web/client/auth.test.tsx",
                  },
                ],
                allowedWriteSet: ["apps/web/client/Auth.tsx"],
              },
            ],
          },
        }),
        digest: digest("b"),
      },
    ]);

    const result = compileSpec224IncrementalSpecSet(input);

    expect(result.requirements).toEqual([
      expect.objectContaining({
        artifactPath: "specs/auth.md",
        sourceKey: "artifact:specs/auth.md#L3",
        lifecycleStatus: "READY",
      }),
    ]);
    expect(result.workPackages).toEqual([
      expect.objectContaining({ externalId: "auth-api", readiness: "READY" }),
      expect.objectContaining({ externalId: "future-ui", readiness: "BLOCKED" }),
    ]);
    expect(result.runnableWorkPackageIds).toEqual([
      result.workPackages[0]!.id,
    ]);
    expect(result.workPackages[1]!.blockers).toContain(
      "REQUIREMENT_REFERENCE_UNRESOLVED"
    );
  });

  it("does not infer omitted dependency, acceptance, or verification metadata", () => {
    const result = compileSpec224IncrementalSpecSet(
      revision([
        {
          path: "spec.md",
          content: "- [ ] MUST preserve the workspace.",
          digest: digest("c"),
        },
        {
          path: "plan.json",
          content: JSON.stringify({
            spec224: {
              workPackages: [
                {
                  id: "unsafe",
                  requirementRefs: [{ artifactPath: "spec.md", line: 1 }],
                  allowedWriteSet: ["apps/web/server/a.ts"],
                },
              ],
            },
          }),
          digest: digest("d"),
        },
      ])
    );

    const workPackage = result.workPackages[0]!;
    expect(workPackage.readiness).toBe("BLOCKED");
    expect(workPackage.blockers).toEqual(
      expect.arrayContaining([
        "DEPENDENCIES_UNDECLARED",
        "ACCEPTANCE_CRITERIA_UNDECLARED",
        "VERIFICATION_UNDECLARED",
      ])
    );
    expect(result.runnableWorkPackageIds).toEqual([]);
  });

  it("blocks duplicate package IDs declared in separate metadata files", () => {
    const packageMetadata = (writePath: string) => JSON.stringify({
      spec224: { workPackages: [{
        id: "shared-id",
        requirementRefs: [{ artifactPath: "specs/req.md", line: 1 }],
        dependsOn: [],
        acceptanceCriteria: ["The behavior is observable."],
        verification: [{ id: "check", kind: "test", ref: "test:focused" }],
        allowedWriteSet: [writePath],
      }] },
    });
    const result = compileSpec224IncrementalSpecSet(revision([
      { path: "specs/req.md", content: "- [ ] MUST be source addressed" },
      { path: "specs/one.json", content: packageMetadata("apps/web/one.ts") },
      { path: "specs/two.json", content: packageMetadata("apps/web/two.ts") },
    ]));

    expect(result.runnableWorkPackageIds).toEqual([]);
    expect(result.workPackages).toHaveLength(2);
    expect(result.workPackages.every(item => item.blockers.includes("WORK_PACKAGE_DECLARATION_DUPLICATE"))).toBe(true);
    expect(result.findings).toContainEqual(expect.objectContaining({ code: "WORK_PACKAGE_DECLARATION_DUPLICATE" }));
  });

  it("blocks a declaration that contains an unsafe write path instead of dropping it", () => {
    const result = compileSpec224IncrementalSpecSet(
      revision([
        { path: "spec.md", content: "- [ ] MUST preserve the workspace." },
        {
          path: "plan.json",
          content: JSON.stringify({
            spec224: {
              workPackages: [{
                id: "unsafe-write-set",
                requirementRefs: [{ artifactPath: "spec.md", line: 1 }],
                dependsOn: [],
                acceptanceCriteria: ["The workspace persists."],
                verification: [{ id: "test", kind: "test", ref: "test:workspace" }],
                allowedWriteSet: ["apps/web/server/safe.ts", "../escape.ts"],
              }],
            },
          }),
        },
      ])
    );

    expect(result.workPackages[0]).toMatchObject({
      readiness: "BLOCKED",
      blockers: expect.arrayContaining(["ALLOWED_WRITE_SET_UNDECLARED"]),
    });
  });

  it("blocks only the dependent subgraph and keeps an unrelated package runnable", () => {
    const result = compileSpec224IncrementalSpecSet(
      revision([
        {
          path: "spec.md",
          content:
            "- [ ] MUST implement the API.\n- [ ] MUST present the UI.\n- [ ] MUST retain audit history.",
          digest: digest("e"),
        },
        {
          path: "plan.json",
          content: JSON.stringify({
            spec224: {
              workPackages: [
                {
                  id: "api",
                  requirementRefs: [{ artifactPath: "spec.md", line: 1 }],
                  dependsOn: ["missing-package"],
                  acceptanceCriteria: ["API responds."],
                  verification: [{ id: "api-test", kind: "test", ref: "test:api" }],
                  allowedWriteSet: ["apps/web/server/api.ts"],
                },
                {
                  id: "ui",
                  requirementRefs: [{ artifactPath: "spec.md", line: 2 }],
                  dependsOn: ["api"],
                  acceptanceCriteria: ["UI calls the API."],
                  verification: [{ id: "ui-test", kind: "test", ref: "test:ui" }],
                  allowedWriteSet: ["apps/web/client/ui.tsx"],
                },
                {
                  id: "audit",
                  requirementRefs: [{ artifactPath: "spec.md", line: 3 }],
                  dependsOn: [],
                  acceptanceCriteria: ["Audit entries persist."],
                  verification: [{ id: "audit-test", kind: "test", ref: "test:audit" }],
                  allowedWriteSet: ["apps/web/server/audit.ts"],
                },
              ],
            },
          }),
          digest: digest("f"),
        },
      ])
    );

    expect(
      result.workPackages
        .map(item => [item.externalId, item.readiness])
        .sort(([left], [right]) => String(left).localeCompare(String(right)))
    ).toEqual([
      ["api", "BLOCKED"],
      ["audit", "READY"],
      ["ui", "BLOCKED"],
    ]);
    expect(result.runnableWorkPackageIds).toEqual([
      result.workPackages.find(item => item.externalId === "audit")!.id,
    ]);
  });

  it("reconciles a changed source without invalidating an independent package", () => {
    const previous = revision(
      [
        {
          path: "a.md",
          content: "- [ ] MUST keep A.",
          digest: digest("1"),
        },
        {
          path: "b.md",
          content: "- [ ] MUST keep B.",
          digest: digest("2"),
        },
        {
          path: "plan.json",
          content: JSON.stringify({
            spec224: {
              workPackages: [
                {
                  id: "a",
                  requirementRefs: [{ artifactPath: "a.md", line: 1 }],
                  dependsOn: [],
                  acceptanceCriteria: ["A."],
                  verification: [{ id: "a-test", kind: "test", ref: "test:a" }],
                  allowedWriteSet: ["a.ts"],
                },
                {
                  id: "b",
                  requirementRefs: [{ artifactPath: "b.md", line: 1 }],
                  dependsOn: [],
                  acceptanceCriteria: ["B."],
                  verification: [{ id: "b-test", kind: "test", ref: "test:b" }],
                  allowedWriteSet: ["b.ts"],
                },
              ],
            },
          }),
          digest: digest("3"),
        },
      ],
      1
    );
    const current = revision(
      [
        {
          path: "a.md",
          content: "- [ ] MUST durably keep A.",
          digest: digest("4"),
        },
        previous.files[1]!,
        previous.files[2]!,
      ],
      2
    );

    const result = compileSpec224IncrementalSpecSet({
      ...current,
      previousRevision: previous,
    });

    const packageA = result.workPackages.find(item => item.externalId === "a")!;
    const packageB = result.workPackages.find(item => item.externalId === "b")!;
    expect(result.impact.changedRequirementSourceKeys).toEqual([
      "artifact:a.md#L1",
    ]);
    expect(result.impact.invalidatedCurrentWorkPackageIds).toEqual([packageA.id]);
    expect(packageA.priorEvidenceStatus).toBe("INVALIDATED");
    expect(packageB.priorEvidenceStatus).toBeNull();
    expect(result.runnableWorkPackageIds).toEqual(
      expect.arrayContaining([packageA.id, packageB.id])
    );
  });
});
