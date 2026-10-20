import { DurableObject } from "cloudflare:workers";
import { NativeRunnerContainerController } from "./nativeRunnerContainer";
import type { RunnerContainerAssignment } from "./runnerContainer";

type RunnerEnvironment = { CLOUDFLARE_RUNNER_IMAGE_REF?: string };
/** Exporting this class does not provision a namespace or enable execution. */
export class CanonicalRunnerContainer extends DurableObject<RunnerEnvironment> {
  private controller() {
    if (!this.ctx.container) throw new Error("RUNNER_CONTAINER_BINDING_REQUIRED");
    return new NativeRunnerContainerController(this.ctx.container, this.ctx.storage, this.env.CLOUDFLARE_RUNNER_IMAGE_REF ?? "");
  }
  startRunner(assignment: RunnerContainerAssignment) {
    return this.ctx.blockConcurrencyWhile(async () => {
      // Ownership/deadline validation must precede alarm mutation. Register
      // cleanup before boot; if alarm persistence fails, never start.
      return this.controller().start(assignment, () => this.ctx.storage.setAlarm(Date.parse(assignment.expiresAt!)));
    });
  }
  inspectRunner(instanceId: string) { return this.controller().inspect(instanceId); }
  stopRunner(instanceId: string) { return this.ctx.blockConcurrencyWhile(() => this.controller().stop(instanceId)); }
  alarm() { return this.ctx.blockConcurrencyWhile(() => this.controller().expire()); }
}
