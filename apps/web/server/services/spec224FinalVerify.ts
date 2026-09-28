import { Spec224ClosureError } from "./spec224RequirementClosureContracts";
import { createRequirementClosurePersistenceService } from "./spec224RequirementClosurePersistence";
import {
  createDevelopmentRunService,
  type DevelopmentRunPersistenceAdapter,
} from "./spec224DevelopmentRunPersistence";
import {
  validateSpec224VerificationProvenance,
  type Spec224VerificationProvenance,
} from "./spec224VerificationProvenance";
import type {
  DevelopmentEvent,
  DevelopmentRun,
} from "./spec224DevelopmentRunContracts";

const FINAL_EVIDENCE_REF = /^evidence:final[-:][A-Za-z0-9_./:@#-]{1,181}$/;

export type Spec224FinalVerifyInput = {
  runId: string;
  tenantId: string;
  actorId: number;
  expectedRevision: number;
  expectedFencingVersion: number;
  idempotencyKey: string;
  finalEvidenceRef: string;
  /** Optional until every canonical caller can provide the live tuple. */
  provenance?: Spec224VerificationProvenance;
};

export type Spec224FinalVerifyResult =
  | {
      status: "FAIL";
      outcome: "REPAIR_REQUIRED";
      closureErrorCode: string;
      run: DevelopmentRun;
      revision: number;
    }
  | {
      status: "PASS";
      outcome: "COMPLETED";
      accepted: boolean;
      run: DevelopmentRun;
      revision: number;
      event: DevelopmentEvent | null;
    };

function assertFinalEvidenceRef(value: string): string {
  if (!FINAL_EVIDENCE_REF.test(value)) {
    throw new Error("FINAL_VERIFY_EVIDENCE_INVALID");
  }
  return value;
}

export function createSpec224FinalVerifyService(
  adapter: DevelopmentRunPersistenceAdapter
) {
  const runs = createDevelopmentRunService(adapter);
  const closure = createRequirementClosurePersistenceService(adapter);

  return {
    async verify(
      input: Spec224FinalVerifyInput
    ): Promise<Spec224FinalVerifyResult> {
      const finalEvidenceRef = assertFinalEvidenceRef(input.finalEvidenceRef);
      const record = await runs.get(input);
      const isDuplicateCompletion = record.run.state === "COMPLETED";
      if (record.run.state !== "FINAL_VERIFY" && !isDuplicateCompletion) {
        throw new Error("FINAL_VERIFY_RUN_REQUIRED");
      }
      if (
        !isDuplicateCompletion &&
        record.revision !== input.expectedRevision
      ) {
        throw new Error("RUN_PROJECTION_STALE");
      }

      if (input.provenance) {
        const persisted = await closure.get(input);
        validateSpec224VerificationProvenance({
          provenance: input.provenance,
          expectedSpecDigest: persisted.graph.baseline.digest,
        });
      }

      try {
        await closure.assertFinalVerifyReady(input);
      } catch (error) {
        if (error instanceof Spec224ClosureError) {
          return {
            status: "FAIL",
            outcome: "REPAIR_REQUIRED",
            closureErrorCode: error.code,
            run: record.run,
            revision: record.revision,
          };
        }
        throw error;
      }

      const completion = await runs.command({
        ...input,
        command: {
          kind: "transition",
          nextState: "COMPLETED",
          eventType: "RUN_COMPLETED",
          payload: {
            action: "final_verify_completed",
            finalEvidenceRef,
          },
          evidenceRefs: [finalEvidenceRef],
        },
      });
      return {
        status: "PASS",
        outcome: "COMPLETED",
        accepted: completion.accepted,
        run: completion.run,
        revision: completion.revision,
        event: completion.event,
      };
    },
  };
}
