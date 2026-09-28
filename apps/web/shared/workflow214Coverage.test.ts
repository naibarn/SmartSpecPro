import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CORE_NODE_TYPE_IDS, getNodeTypeManifest } from "../server/services/workflowNodeContracts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const spec212Dir = resolve(
  repoRoot,
  "specs/feature/212-AI Workflow studio capability validation benchmark harness"
);
const spec214Path = resolve(repoRoot, "specs/feature/214-node-type-contract-architecture/spec.md");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(spec212Dir, path), "utf8")) as T;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
}

describe("Spec 214 / Spec 212 R20 static coverage contracts", () => {
  it("accounts for all 112 pre-canonical names without granting alias authority", () => {
    const disposition = readJson<{
      source: string;
      entry_count: number;
      alias_authority: boolean;
      entries: Array<{ old_name: string; disposition: string; canonical_target: string }>;
    }>("spec-214-112-nodeType-clean-slate-disposition.json");
    const validDispositions = new Set([
      "ambiguous-remove", "canonical-node", "composition", "control-plane",
      "preset-or-binding", "remove-node", "runtime-internal",
    ]);
    expect(disposition.entry_count).toBe(112);
    expect(disposition.alias_authority).toBe(false);
    expect(disposition.entries).toHaveLength(112);
    expect(new Set(disposition.entries.map(item => item.old_name)).size).toBe(112);
    expect(disposition.entries.every(item => item.old_name && item.canonical_target && validDispositions.has(item.disposition))).toBe(true);
    expect(disposition.source).toBe("specs/feature/214-node-type-contract-architecture/spec.md#appendix-a");
    expect(readJson<{ files: Record<string, { sha256?: string; records?: number }> }>("spec-212-corpus-manifest-r20.json").files["spec-214-112-nodeType-clean-slate-disposition.json"]).toMatchObject({ records: 112, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const source = readFileSync(spec214Path, "utf8").split("# Appendix A — Disposition of All 112 Implemented")[1];
    expect(source).toBeTruthy();
    const appendixEntries = [...source!.matchAll(/^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm)]
      .map(([, old_name, disposition, canonical_target]) => ({ old_name, disposition: disposition.trim(), canonical_target: canonical_target.trim() }));
    expect(disposition.entries).toEqual(appendixEntries);
    for (const entry of disposition.entries) {
      expect(() => getNodeTypeManifest(entry.old_name, "1.0.0"), entry.old_name).toThrow("NODE_TYPE_UNKNOWN");
    }
  });

  it("keeps R20 corpus identity and node taxonomy aligned to Spec 214 revision 6", () => {
    const coverage = readJson<{
      spec_214_revision: number;
      canonical_core_node_types: string[];
      coverage_rule: string;
      corpus: { use_case_count: number; required_locales: string[]; canonical_prompt_executions: number; first_id: string; last_id: string };
      current_profile_must_match_manifest: Record<string, unknown>;
    }>("spec-214-spec212-coverage-manifest-r20.json");
    const profile = readJson<{
      node_taxonomy: { revision: number; canonical_core_type_count: number };
      authoritative_artifacts: { implemented_node_disposition: string | null };
      coverage_expectation: { implemented_node_disposition: string | null; node_disposition_entries: number; spec_214_revision: number };
    }>(
      "spec-212-current-contract-profile-r20.json"
    );
    const corpus = readJson<{ spec_revision: number; use_case_count: number; canonical_prompt_executions: number; required_locales: string[]; first_id: string; last_id: string }>(
      "spec-212-corpus-manifest-r20.json"
    );
    const useCases = readJson<Array<{ th?: string; en?: string }>>("spec-212-use-cases-2930-bilingual.json");

    expect(coverage.spec_214_revision).toBe(6);
    expect(profile.node_taxonomy.revision).toBe(6);
    expect(profile.node_taxonomy.canonical_core_type_count).toBe(16);
    expect(profile.authoritative_artifacts.implemented_node_disposition).toContain("spec-214-112-nodeType-clean-slate-disposition.json");
    expect(profile.coverage_expectation).toMatchObject({ implemented_node_disposition: profile.authoritative_artifacts.implemented_node_disposition, node_disposition_entries: 112, spec_214_revision: 6 });
    expect(coverage.current_profile_must_match_manifest).toMatchObject({ canonical_core_node_type_count: 16, use_case_count: 2930, canonical_prompt_executions: 5860 });
    expect(coverage.canonical_core_node_types).toEqual(CORE_NODE_TYPE_IDS);
    expect(coverage.coverage_rule).toBe("semantic-invariants-not-golden-graph");
    expect(corpus.spec_revision).toBe(20);
    expect(useCases).toHaveLength(2_930);
    expect(useCases.every(item => typeof item.th === "string" && item.th.length > 0 && typeof item.en === "string" && item.en.length > 0)).toBe(true);
    expect(corpus.use_case_count).toBe(useCases.length);
    expect(corpus.canonical_prompt_executions).toBe(useCases.length * 2);
    expect(corpus.required_locales).toEqual(["th", "en"]);
    expect(coverage.corpus).toMatchObject({
      use_case_count: corpus.use_case_count,
      canonical_prompt_executions: corpus.canonical_prompt_executions,
      first_id: corpus.first_id,
      last_id: corpus.last_id,
    });
  });

  it("binds all use-case identities and referenced artifact hashes to R20 content", () => {
    const corpusManifest = readJson<{ files: Record<string, { sha256?: string; records?: number }> }>("spec-212-corpus-manifest-r20.json");
    const index = readJson<{ identity_revision: number; entry_count: number; first_id: string; last_id: string; entries: Array<{ id: string; sha256: string }> }>("spec-212-use-case-identity-r20.json");
    const useCases = readJson<Array<{ th: string; en: string }>>("spec-212-use-cases-2930-bilingual.json");
    expect(index).toMatchObject({ identity_revision: 20, entry_count: 2930, first_id: "UC-0001", last_id: "UC-2930" });
    expect(index.entries).toHaveLength(useCases.length);
    expect(corpusManifest.files["spec-212-use-case-identity-r20.json"]).toMatchObject({ records: 2930, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    for (const [position, record] of useCases.entries()) {
      expect(index.entries[position]).toEqual({
        id: `UC-${String(position + 1).padStart(4, "0")}`,
        sha256: createHash("sha256").update(canonicalJson(record), "utf8").digest("hex"),
      });
    }
    for (const [name, reference] of Object.entries(corpusManifest.files)) {
      if (!reference.sha256) continue;
      const path = name.startsWith("specs/") ? resolve(repoRoot, name) : resolve(spec212Dir, name);
      expect(createHash("sha256").update(readFileSync(path)).digest("hex"), name).toBe(reference.sha256);
    }
  });
});
