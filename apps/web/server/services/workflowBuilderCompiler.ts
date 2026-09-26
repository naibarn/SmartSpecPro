import { createHash } from "node:crypto";

import {
  compileWorkflowDefinition,
  type WorkflowDefinitionV2,
} from "./workflowCompilerRuntimeContracts";
import {
  getNodeTypeManifest,
  searchNodeTypes,
  type NodeBindingRef,
} from "./workflowNodeContracts";

export class WorkflowCompilerError extends Error {
  readonly code:
    | "INTENT_REQUIRED"
    | "NO_READY_OPTION"
    | "CAPABILITY_GAP"
    | "CANDIDATE_INVALID";

  constructor(code: WorkflowCompilerError["code"], message = code) {
    super(message);
    this.name = "WorkflowCompilerError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type CompilerOption = {
  id: string;
  typeId: string;
  ready?: boolean;
  reasonCode: string;
  binding?: NodeBindingRef;
};

export type CompiledWorkflowCandidate = {
  candidateId: string;
  selectedOptionId: string;
  candidate: WorkflowDefinitionV2;
  diff: { addedNodes: number; removedNodes: number; changed: boolean };
  status: "draft";
  executionReadiness: { verified: false; reasonCode: "RUNTIME_READINESS_UNVERIFIED" };
  explanation: {
    summary: string;
    detectedCapabilities: string[];
    nodeTypes: string[];
  };
};

const acceptedCandidates = new Map<string, CompiledWorkflowCandidate>();

function hasAny(text: string, terms: string[]): boolean {
  return terms.some(term => text.includes(term));
}

function optionForType(options: CompilerOption[], typeId: string): CompilerOption {
  const registeredTypeIds = new Set(searchNodeTypes({ limit: 100 }).map(manifest => manifest.identity.typeId));
  if (!registeredTypeIds.has(typeId))
    throw new WorkflowCompilerError("CAPABILITY_GAP", `Unknown canonical node type ${typeId}`);
  const manifest = getNodeTypeManifest(typeId, "1.0.0");
  const option = options.find(candidate => candidate.typeId === typeId);
  if (!option) throw new WorkflowCompilerError("CAPABILITY_GAP", `No ready binding option for ${typeId}`);
  if (manifest.resolution.required &&
      (!option.binding || !manifest.resolution.allowedBindings.includes(option.binding.kind) ||
       !option.binding.ref.trim() || /(?:\.default|^default$|placeholder|unknown)/i.test(option.binding.ref)))
    throw new WorkflowCompilerError("CAPABILITY_GAP", `No concrete compatible binding for ${typeId}`);
  return option;
}

function configFor(typeId: string, intent: string): Record<string, unknown> {
  if (typeId === "ai.model") {
    return { prompt: `${intent}\n\nInput: {{request}}`, responseFormat: "text" };
  }
  if (typeId === "flow.router") return { mode: "condition" };
  if (typeId === "human.approval") return { title: "Review workflow output" };
  if (typeId === "data.transform") return { operation: "passthrough" };
  return {};
}

function buildCanonicalNode(input: {
  id: string;
  typeId: string;
  label: string;
  intent: string;
  binding?: NodeBindingRef;
  position: { x: number; y: number };
}) {
  return {
    id: input.id,
    typeId: input.typeId,
    typeVersion: "1.0.0",
    label: input.label,
    ...(input.binding ? { binding: structuredClone(input.binding) } : {}),
    config: configFor(input.typeId, input.intent),
    position: input.position,
  };
}

function buildCandidate(input: {
  intent: string;
  options: CompilerOption[];
  typeIds: string[];
  detected: string[];
}): WorkflowDefinitionV2 {
  const typeIds = [...new Set(input.typeIds)];
  const nodes = typeIds.map((typeId, index) => {
    const manifest = getNodeTypeManifest(typeId, "1.0.0");
    const option = manifest.resolution.required ? optionForType(input.options, typeId) : undefined;
    return buildCanonicalNode({
      id: `${typeId.replace(/[^A-Za-z0-9_-]/g, "-")}-${index + 1}`,
      typeId,
      label: manifest.semantic.summary,
      intent: input.intent,
      ...(option?.binding ? { binding: option.binding } : {}),
      position: { x: 360 + (index % 2) * 320, y: 160 + Math.floor(index / 2) * 180 },
    });
  });
  const edges = nodes.slice(1).map((node, index) => ({
    id: `edge-${index + 1}`,
    fromNodeId: nodes[index].id,
    fromPortId: "output",
    toNodeId: node.id,
    toPortId: "input",
    channel: "data" as const,
  }));
  const definition: WorkflowDefinitionV2 = {
    schemaVersion: "2",
    workflowId: "builder-draft",
    version: "1.0.0",
    interface: {
      inputs: { request: { schema: { type: "string" }, required: true } },
      outputs: {
        result: {
          schema: { type: "object" },
          source: { kind: "node-output", nodeId: nodes[nodes.length - 1].id, portId: "output" },
        },
      },
    },
    nodes,
    edges,
    bindings: [{
      id: `binding-${nodes[0].id}-request`,
      targetNodeId: nodes[0].id,
      targetPortId: "input",
      source: { kind: "workflow-input", inputId: "request" },
    }],
    scopes: [],
    policies: [],
    instrumentation: [],
    metadata: { builderIntent: input.intent.slice(0, 2000) },
  };
  try {
    compileWorkflowDefinition(definition);
  } catch (error) {
    throw new WorkflowCompilerError("CANDIDATE_INVALID", error instanceof Error ? error.message : "CANDIDATE_INVALID");
  }
  return definition;
}

export function compileWorkflowIntent(input: {
  intent: string;
  options: CompilerOption[];
}): CompiledWorkflowCandidate {
  const intent = input.intent.trim();
  if (!intent) throw new WorkflowCompilerError("INTENT_REQUIRED");
  const text = intent.toLowerCase();
  const usesCondition = hasAny(text, ["condition", "if ", "when ", "branch", "yes/no", "switch", "เงื่อนไข", "ถ้า"]);
  const usesHttp = hasAny(text, ["http", "api", "webhook", "request", "เรียก api", "ส่งข้อมูล"]);
  const usesSkill = hasAny(text, ["skill", "extract", "document", "เอกสาร", "ดึงข้อมูล", "ทักษะ"]);
  const usesApproval = hasAny(text, ["approval", "approve", "review", "อนุมัติ", "ตรวจสอบก่อนส่ง"]);
  const usesLlm = hasAny(text, ["llm", "prompt", "ai", "generate", "summar", "classif", "วิเคราะห์", "สรุป", "สร้าง", "แปลงภาษา"]) || (!usesHttp && !usesSkill);
  const detected = [
    ...(usesCondition ? ["flow.router"] : []),
    ...(usesHttp || usesSkill ? ["core.capability"] : []),
    ...(usesLlm ? ["ai.model"] : []),
    ...(usesApproval ? ["human.approval"] : []),
  ];
  // Client readiness is advisory only. The result remains a draft until a trusted runtime resolver verifies bindings.
  const registeredTypeIds = new Set(searchNodeTypes({ limit: 100 }).map(manifest => manifest.identity.typeId));
  const availableOptions = input.options.filter(option => registeredTypeIds.has(option.typeId));
  if (!availableOptions.length) throw new WorkflowCompilerError("NO_READY_OPTION");
  const typeIds = detected.length ? detected : [availableOptions[0].typeId];
  const candidate = buildCandidate({ intent, options: availableOptions, typeIds, detected });
  const candidateId = createHash("sha256").update(JSON.stringify(candidate), "utf8").digest("hex").slice(0, 32);
  const result: CompiledWorkflowCandidate = {
    candidateId,
    selectedOptionId: availableOptions.find(option => typeIds.includes(option.typeId))?.id ?? `semantic:${typeIds[0]}`,
    candidate,
    diff: { addedNodes: candidate.nodes.length, removedNodes: 0, changed: true },
    status: "draft",
    executionReadiness: { verified: false, reasonCode: "RUNTIME_READINESS_UNVERIFIED" },
    explanation: {
      summary: "Created a canonical workflow draft. Runtime and provider readiness have not been verified.",
      detectedCapabilities: [...new Set(detected)],
      nodeTypes: candidate.nodes.map(node => node.typeId),
    },
  };
  acceptedCandidates.set(candidateId, result);
  return result;
}

export function acceptWorkflowCandidate(input: {
  candidateId: string;
  idempotencyKey: string;
  candidate: WorkflowDefinitionV2;
}): { status: "accepted" | "replayed"; candidateId: string; semanticDefinition: WorkflowDefinitionV2 } {
  const previous = acceptedCandidates.get(`${input.candidateId}:${input.idempotencyKey}`);
  if (previous) return { status: "replayed", candidateId: input.candidateId, semanticDefinition: previous.candidate };
  compileWorkflowDefinition(input.candidate);
  const accepted = { status: "accepted" as const, candidateId: input.candidateId, semanticDefinition: structuredClone(input.candidate) };
  acceptedCandidates.set(`${input.candidateId}:${input.idempotencyKey}`, {
    candidateId: input.candidateId,
    selectedOptionId: "accepted",
    candidate: accepted.semanticDefinition,
      diff: { addedNodes: 0, removedNodes: 0, changed: false },
      status: "draft",
      executionReadiness: { verified: false, reasonCode: "RUNTIME_READINESS_UNVERIFIED" },
      explanation: { summary: "Accepted canonical workflow candidate.", detectedCapabilities: [], nodeTypes: accepted.semanticDefinition.nodes.map(node => node.typeId) },
  });
  return accepted;
}

export function compileWorkflowEdit(input: {
  intent: string;
  options: CompilerOption[];
  currentDefinition: WorkflowDefinitionV2;
  targetNodeId?: string;
}): CompiledWorkflowCandidate {
  const draft = compileWorkflowIntent(input);
  const current = structuredClone(input.currentDefinition);
  const generated = draft.candidate.nodes[0];
  const target = input.targetNodeId ? current.nodes.find(item => item.id === input.targetNodeId) : undefined;
  if (target) {
    Object.assign(target, { ...generated, id: target.id });
  } else {
    const previous = current.nodes.at(-1);
    const newNode = { ...generated, id: `${generated.id}-${current.nodes.length + 1}` };
    current.nodes.push(newNode);
    if (previous) current.edges.push({ id: `edge-${current.edges.length + 1}`, fromNodeId: previous.id, fromPortId: "output", toNodeId: newNode.id, toPortId: "input", channel: "data" });
  }
  const last = current.nodes.at(-1);
  if (last) current.interface.outputs.result.source = { kind: "node-output", nodeId: last.id, portId: "output" };
  compileWorkflowDefinition(current);
  const candidateId = createHash("sha256").update(JSON.stringify(current), "utf8").digest("hex").slice(0, 32);
  const result: CompiledWorkflowCandidate = {
    ...draft,
    candidateId,
    candidate: current,
    diff: { addedNodes: target ? 0 : 1, removedNodes: 0, changed: true },
    explanation: { ...draft.explanation, summary: target ? "Updated the selected canonical node." : "Added a canonical node to the workflow." },
  };
  acceptedCandidates.set(candidateId, result);
  return result;
}
