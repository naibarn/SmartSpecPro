import { createHash } from "node:crypto";

/**
 * A closure-required statement is either a Markdown task-list item, an
 * explicit SHALL/MUST statement, an uppercase REQUIRED label, or a direct
 * Never/Do not prohibition. Colons retain their immediately following
 * Markdown list/code/prose continuation so a condition or forbidden sequence
 * cannot be silently detached from its normative parent. Other prose is not
 * inferred as a requirement.
 */
export const SPEC224_EXPLICIT_REQUIREMENT_RULE =
  "Markdown task-list item, explicit SHALL/MUST statement, uppercase REQUIRED label, or direct Never/Do not prohibition with its immediate continuation";

export type Spec224BaselineSection = Readonly<{
  id: string;
  line: number;
  level: number;
  title: string;
}>;

export type Spec224BaselineRequirement = Readonly<{
  id: string;
  sourceRef: string;
  text: string;
}>;

export type Spec224SpecBaseline = Readonly<{
  contractVersion: "spec-224-baseline-v1";
  specId: string;
  revision: string;
  authorityRef: string;
  scopeEnvelopeRef: string;
  /** Hash of the exact UTF-8 source string before line-ending/whitespace normalization. */
  sourceArtifactDigest: string;
  /** Hash of the canonical normalized Markdown used for deterministic enumeration. */
  sourceDigest: string;
  baselineId: string;
  canonicalMarkdown: string;
  sections: readonly Spec224BaselineSection[];
  requirements: readonly Spec224BaselineRequirement[];
}>;

export class Spec224SpecBaselineError extends Error {
  constructor(
    public readonly code: string,
    message = code
  ) {
    super(message);
    this.name = "Spec224SpecBaselineError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const REF = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_./:@#-]{1,191}$/;
const MAX_SOURCE_BYTES = 1024 * 1024;
const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const TASK_LIST_ITEM = /^\s*[-*+]\s+\[[ xX]\]\s+\S/;
const NORMATIVE_KEYWORD = /\b(?:SHALL|MUST)\b/i;
const REQUIRED_LABEL = /\bREQUIRED\b/;
const DIRECT_PROHIBITION = /^(?:[-*+]\s+)?(?:never|do not|don't)\b/i;
const FENCE = /^\s*(?:```|~~~)/;
const RAW_SECRET =
  /(?:\bsk-[A-Za-z0-9_-]{20,}\b|\b(?:ghp|github_pat)_[A-Za-z0-9_-]{20,}\b|\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-/+=]{20,})/i;

function invalid(code: string): never {
  throw new Spec224SpecBaselineError(code);
}

function validateId(value: unknown, code: string): string {
  if (typeof value !== "string") invalid(code);
  const normalized = value.trim();
  if (!normalized || !ID.test(normalized)) invalid(code);
  return normalized;
}

function validateRef(value: unknown, code: string): string {
  if (typeof value !== "string") invalid(code);
  const normalized = value.trim();
  if (!normalized || !REF.test(normalized)) invalid(code);
  return normalized;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function deriveSpec224RequirementId(input: {
  specId: string;
  revision: string;
  sourceArtifactDigest: string;
  sourceDigest: string;
  line: number;
  text: string;
}): string {
  return `req:${sha256(
    [
      input.specId,
      input.revision,
      input.sourceArtifactDigest,
      input.sourceDigest,
      input.line,
      input.text,
    ].join("\n")
  ).slice(0, 40)}`;
}

function stableId(
  prefix: string,
  specId: string,
  revision: string,
  sourceArtifactDigest: string,
  sourceDigest: string,
  line: number,
  value: string
): string {
  return `${prefix}:${sha256(
    [specId, revision, sourceArtifactDigest, sourceDigest, line, value].join(
      "\n"
    )
  ).slice(0, 40)}`;
}

export function normalizeSpec224Markdown(sourceMarkdown: unknown): string {
  if (typeof sourceMarkdown !== "string") invalid("SOURCE_INVALID");
  if (sourceMarkdown.includes("\0")) invalid("SOURCE_UNTRUSTED");
  const normalized = sourceMarkdown
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.trimEnd())
    .join("\n")
    .trim();
  if (!normalized) invalid("SOURCE_EMPTY");
  if (Buffer.byteLength(normalized, "utf8") > MAX_SOURCE_BYTES)
    invalid("SOURCE_OVERSIZED");
  if (RAW_SECRET.test(normalized)) invalid("SOURCE_SECRET_REJECTED");
  return normalized;
}

function enumerateSections(
  specId: string,
  revision: string,
  sourceArtifactDigest: string,
  sourceDigest: string,
  canonicalMarkdown: string
): readonly Spec224BaselineSection[] {
  const sections: Spec224BaselineSection[] = [];
  for (const [index, line] of canonicalMarkdown.split("\n").entries()) {
    const match = HEADING.exec(line);
    if (!match) continue;
    const level = match[1]!.length;
    const title = match[2]!.trim().replace(/\s+/g, " ");
    sections.push(
      Object.freeze({
        id: stableId(
          "section",
          specId,
          revision,
          sourceArtifactDigest,
          sourceDigest,
          index + 1,
          `${level}\n${title}`
        ),
        line: index + 1,
        level,
        title,
      })
    );
  }
  return Object.freeze(sections);
}

function enumerateRequirements(
  specId: string,
  revision: string,
  sourceArtifactDigest: string,
  sourceDigest: string,
  canonicalMarkdown: string
): readonly Spec224BaselineRequirement[] {
  const lines = canonicalMarkdown.split("\n");
  const requirements: Spec224BaselineRequirement[] = [];
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const statement = line.trim();
    if (!statement || HEADING.test(line)) continue;
    if (
      !TASK_LIST_ITEM.test(line) &&
      !NORMATIVE_KEYWORD.test(statement) &&
      !REQUIRED_LABEL.test(statement) &&
      !DIRECT_PROHIBITION.test(statement)
    ) {
      continue;
    }
    const startLine = index + 1;
    const parts = [statement.replace(/^[-*+]\s+\[[ xX]\]\s+/, "")];
    let endLine = startLine;
    let nextIndex = index + 1;

    if (statement.endsWith(":")) {
      let continuationFence = false;
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const continuation = lines[cursor]!;
        const trimmed = continuation.trim();
        if (HEADING.test(continuation) || trimmed === "---") {
          nextIndex = cursor;
          break;
        }
        if (FENCE.test(continuation)) {
          continuationFence = !continuationFence;
          continue;
        }
        if (!trimmed) continue;
        if (
          !continuationFence &&
          (TASK_LIST_ITEM.test(continuation) ||
            NORMATIVE_KEYWORD.test(trimmed) ||
            REQUIRED_LABEL.test(trimmed) ||
            DIRECT_PROHIBITION.test(trimmed))
        ) {
          nextIndex = cursor;
          break;
        }
        parts.push(trimmed.replace(/^[-*+]\s+/, ""));
        endLine = cursor + 1;
        nextIndex = cursor + 1;
      }
    }
    const text = parts.join(" ");
    const sourceRef =
      endLine === startLine
        ? `spec:${specId}@${revision}#L${startLine}`
        : `spec:${specId}@${revision}#L${startLine}-L${endLine}`;
    requirements.push(
      Object.freeze({
        id: deriveSpec224RequirementId({
          specId,
          revision,
          sourceArtifactDigest,
          sourceDigest,
          line: startLine,
          text,
        }),
        sourceRef,
        text,
      })
    );
    index = nextIndex - 1;
  }
  return Object.freeze(requirements);
}

export function buildSpec224SpecBaseline(input: {
  specId: string;
  revision: string;
  authorityRef: string;
  scopeEnvelopeRef: string;
  sourceMarkdown: string;
}): Spec224SpecBaseline {
  const specId = validateId(input.specId, "SPEC_ID_INVALID");
  const revision = validateId(input.revision, "REVISION_INVALID");
  const authorityRef = validateRef(input.authorityRef, "AUTHORITY_REF_INVALID");
  const scopeEnvelopeRef = validateRef(
    input.scopeEnvelopeRef,
    "SCOPE_ENVELOPE_REF_INVALID"
  );
  const sourceArtifactDigest = sha256(input.sourceMarkdown);
  const canonicalMarkdown = normalizeSpec224Markdown(input.sourceMarkdown);
  const sourceDigest = sha256(canonicalMarkdown);
  const baselineId = `baseline:${sha256(
    [specId, revision, sourceArtifactDigest, sourceDigest].join("\n")
  ).slice(0, 40)}`;

  return Object.freeze({
    contractVersion: "spec-224-baseline-v1",
    specId,
    revision,
    authorityRef,
    scopeEnvelopeRef,
    sourceArtifactDigest,
    sourceDigest,
    baselineId,
    canonicalMarkdown,
    sections: enumerateSections(
      specId,
      revision,
      sourceArtifactDigest,
      sourceDigest,
      canonicalMarkdown
    ),
    requirements: enumerateRequirements(
      specId,
      revision,
      sourceArtifactDigest,
      sourceDigest,
      canonicalMarkdown
    ),
  });
}

/**
 * Keeps baseline evidence factual: it forwards only the source-addressed
 * requirements captured by the explicit rule, with no inferred state or work.
 */
export function toRequirementClosureInput(
  baseline: Spec224SpecBaseline
): Array<{ id: string; sourceRef: string; text: string }> {
  return baseline.requirements.map(requirement => ({ ...requirement }));
}
