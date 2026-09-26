import { describe, expect, it } from "vitest";

import {
  CONNECT_SCHEMA_REVISION,
  MIN_COMPATIBLE_RUNNER_VERSION,
  RUNNER_CONTRACT_VERSION,
  getRunnerCompatibilityMetadata,
  negotiateRunnerCompatibility,
} from "../runnerContracts";

describe("Runner Control Plane compatibility contract", () => {
  it("publishes an explicit control-plane and connect-schema identity", () => {
    expect(getRunnerCompatibilityMetadata()).toEqual({
      controlPlaneContractVersion: RUNNER_CONTRACT_VERSION,
      connectSchemaRevision: CONNECT_SCHEMA_REVISION,
      minRunnerVersion: MIN_COMPATIBLE_RUNNER_VERSION,
    });
  });

  it("accepts a Runner that advertises the current contract and schema", () => {
    expect(
      negotiateRunnerCompatibility({
        runnerVersion: "0.1.0",
        supportedRunnerContractVersions: [RUNNER_CONTRACT_VERSION],
        supportedConnectSchemaRevisions: [CONNECT_SCHEMA_REVISION],
      })
    ).toEqual({ compatible: true });
  });

  it("classifies an unsupported Runner contract explicitly", () => {
    expect(
      negotiateRunnerCompatibility({
        runnerVersion: "0.1.0",
        supportedRunnerContractVersions: ["sah-runner-v0"],
        supportedConnectSchemaRevisions: [CONNECT_SCHEMA_REVISION],
      })
    ).toMatchObject({
      compatible: false,
      code: "UNSUPPORTED_RUNNER_CONTRACT",
    });
  });

  it("classifies a Runner below the minimum version explicitly", () => {
    expect(
      negotiateRunnerCompatibility({
        runnerVersion: "0.0.9",
        supportedRunnerContractVersions: [RUNNER_CONTRACT_VERSION],
        supportedConnectSchemaRevisions: [CONNECT_SCHEMA_REVISION],
      })
    ).toMatchObject({
      compatible: false,
      code: "RUNNER_UPGRADE_REQUIRED",
    });
  });
});
