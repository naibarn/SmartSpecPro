import { createHash } from "node:crypto";

export type ComputerUseSemantic = "click" | "type" | "submit";
export type ComputerUseRoute = "structured" | "semantic" | "localRunner" | "visual";
export type CertificationCase = { id: string; status: "passed" | "failed" };

export type ComputerUseQualification = {
  contractVersion: "p213-v1";
  qualificationId: string;
  providerId: string;
  providerVersion: string;
  engineRef: "computer-use:spec-208";
  supportedSemantics: ComputerUseSemantic[];
  capabilitySnapshotRevision: string;
  capabilitySnapshotFresh: boolean;
  fallbackOrder: ComputerUseRoute[];
  mandatoryCases: CertificationCase[];
  providerNeutral: boolean;
  secondEngineIntroduced: boolean;
};

export type ComputerUseCertificationEvidenceCase = {
  id: string;
  status: "passed" | "failed";
  evidenceRefs: string[];
};

export type ComputerUseCertificationEvidenceBundle = {
  contractVersion: "p213-evidence-v1";
  sourceCommit: string;
  specRevision: string;
  runnerVersion: string;
  runnerSessionId: string;
  adapterVersion: string;
  browserVersion: string;
  decisionProvider: string;
  calibrationRevision: string;
  capabilitySnapshotRevision: string;
  configurationRevision: string;
  liveRunnerProof: boolean;
  independentlyVerified: boolean;
  caseResults: ComputerUseCertificationEvidenceCase[];
  timestamp: string;
  finalResult: "PASS" | "BLOCKED";
  evidenceSha256: string;
};

export class ComputerUseCertificationError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "ComputerUseCertificationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const SEMANTICS: ComputerUseSemantic[] = ["click", "type", "submit"];
const ROUTES: ComputerUseRoute[] = ["structured", "semantic", "localRunner", "visual"];

function id(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim() || !ID.test(value.trim())) throw new ComputerUseCertificationError(code);
  return value.trim();
}

function version(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || !/^[0-9A-Za-z][0-9A-Za-z_.:-]{0,127}$/.test(value.trim())) {
    throw new ComputerUseCertificationError("PROVIDER_VERSION_INVALID");
  }
  return value.trim();
}

export function buildComputerUseQualification(input: {
  qualificationId: string;
  providerId: string;
  providerVersion: string;
  engineRef: string;
  supportedSemantics: readonly string[];
  capabilitySnapshotRevision: string;
  capabilitySnapshotFresh: boolean;
  fallbackOrder: readonly ComputerUseRoute[];
  mandatoryCases: CertificationCase[];
  providerNeutral: boolean;
  secondEngineIntroduced: boolean;
}): ComputerUseQualification {
  if (input.engineRef !== "computer-use:spec-208" || input.secondEngineIntroduced) throw new ComputerUseCertificationError("SECOND_ENGINE_FORBIDDEN");
  if (!input.capabilitySnapshotFresh) throw new ComputerUseCertificationError("CAPABILITY_SNAPSHOT_STALE");
  if (input.fallbackOrder.length !== ROUTES.length || input.fallbackOrder.some((route, index) => route !== ROUTES[index])) {
    throw new ComputerUseCertificationError("FALLBACK_ORDER_INVALID");
  }
  const supportedSemantics = input.supportedSemantics.map(semantic => {
    if (!SEMANTICS.includes(semantic as ComputerUseSemantic)) throw new ComputerUseCertificationError("SEMANTIC_UNSUPPORTED");
    return semantic as ComputerUseSemantic;
  });
  return {
    contractVersion: "p213-v1",
    qualificationId: id(input.qualificationId, "QUALIFICATION_ID_INVALID"),
    providerId: id(input.providerId, "PROVIDER_ID_INVALID"),
    providerVersion: version(input.providerVersion),
    engineRef: "computer-use:spec-208",
    supportedSemantics,
    capabilitySnapshotRevision: id(input.capabilitySnapshotRevision, "CAPABILITY_REVISION_INVALID"),
    capabilitySnapshotFresh: true,
    fallbackOrder: [...input.fallbackOrder],
    mandatoryCases: structuredClone(input.mandatoryCases),
    providerNeutral: input.providerNeutral,
    secondEngineIntroduced: false,
  };
}

export function assertComputerUseCertification(qualification: ComputerUseQualification): true {
  if (!qualification.providerNeutral) throw new ComputerUseCertificationError("PROVIDER_LOCK_IN");
  if (qualification.secondEngineIntroduced || qualification.engineRef !== "computer-use:spec-208") {
    throw new ComputerUseCertificationError("SECOND_ENGINE_FORBIDDEN");
  }
  if (!qualification.capabilitySnapshotFresh) throw new ComputerUseCertificationError("CAPABILITY_SNAPSHOT_STALE");
  if (qualification.mandatoryCases.some(testCase => testCase.status !== "passed")) {
    throw new ComputerUseCertificationError("CERTIFICATION_CASE_FAILED");
  }
  return true;
}

function requiredEvidenceText(value: unknown, code: string): string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new ComputerUseCertificationError(code);
  return value.trim();
}

export function buildComputerUseCertificationEvidenceBundle(input: {
  sourceCommit: string;
  specRevision: string;
  runnerVersion: string;
  runnerSessionId: string;
  adapterVersion: string;
  browserVersion: string;
  decisionProvider: string;
  calibrationRevision: string;
  capabilitySnapshotRevision: string;
  configurationRevision: string;
  liveRunnerProof: boolean;
  independentlyVerified?: boolean;
  caseResults: ComputerUseCertificationEvidenceCase[];
  timestamp: string;
  requestedResult?: "PASS" | "BLOCKED";
}): ComputerUseCertificationEvidenceBundle {
  const caseResults = structuredClone(input.caseResults);
  const base = {
    contractVersion: "p213-evidence-v1" as const,
    sourceCommit: requiredEvidenceText(input.sourceCommit, "CERTIFICATION_EVIDENCE_INCOMPLETE"),
    specRevision: requiredEvidenceText(input.specRevision, "CERTIFICATION_EVIDENCE_INCOMPLETE"),
    runnerVersion: requiredEvidenceText(input.runnerVersion, "CERTIFICATION_EVIDENCE_INCOMPLETE"),
    runnerSessionId: requiredEvidenceText(input.runnerSessionId, "CERTIFICATION_EVIDENCE_INCOMPLETE"),
    adapterVersion: requiredEvidenceText(input.adapterVersion, "CERTIFICATION_EVIDENCE_INCOMPLETE"),
    browserVersion: requiredEvidenceText(input.browserVersion, "CERTIFICATION_EVIDENCE_INCOMPLETE"),
    decisionProvider: requiredEvidenceText(input.decisionProvider, "CERTIFICATION_EVIDENCE_INCOMPLETE"),
    calibrationRevision: requiredEvidenceText(input.calibrationRevision, "CERTIFICATION_EVIDENCE_INCOMPLETE"),
    capabilitySnapshotRevision: requiredEvidenceText(input.capabilitySnapshotRevision, "CERTIFICATION_EVIDENCE_INCOMPLETE"),
    configurationRevision: requiredEvidenceText(input.configurationRevision, "CERTIFICATION_EVIDENCE_INCOMPLETE"),
    liveRunnerProof: input.liveRunnerProof === true,
    independentlyVerified: input.independentlyVerified === true,
    caseResults,
    timestamp: requiredEvidenceText(input.timestamp, "CERTIFICATION_EVIDENCE_INCOMPLETE"),
  };
  const casesComplete =
    caseResults.length === 20 &&
    caseResults.every(
      testCase =>
        testCase.status === "passed" &&
        testCase.id.trim().length > 0 &&
        testCase.evidenceRefs.length > 0 &&
        testCase.evidenceRefs.every(reference => reference.trim().length > 0),
    );
  const finalResult =
    base.liveRunnerProof && base.independentlyVerified && casesComplete
      ? "PASS"
      : "BLOCKED";
  if (input.requestedResult === "PASS" && finalResult !== "PASS")
    throw new ComputerUseCertificationError("CERTIFICATION_EVIDENCE_INCOMPLETE");
  const evidenceSha256 = createHash("sha256")
    .update(JSON.stringify({ ...base, finalResult }))
    .digest("hex");
  return Object.freeze({ ...base, finalResult, evidenceSha256 });
}
