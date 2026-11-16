import { test } from "node:test";
import assert from "node:assert/strict";
import { selectRemotionRuntimeContract } from "./runtime-remotion-contract.mjs";

const input = {
  sourcePackageVersion: "0.1.6",
  installedPackageVersion: "0.1.6",
  requiredContracts: ["2026-08-04.2", "2026-11-15.1"],
  installedContracts: ["2026-08-04.2", "2026-11-15.1"],
};
test("advertises the implemented silence-trim contract while retaining base support", () => {
  assert.deepEqual(selectRemotionRuntimeContract(input), {
    packageVersion: "0.1.6", platformContractVersion: "2026-11-15.1",
  });
});
test("rejects an old sidecar even when its package version is unchanged", () => {
  assert.throws(() => selectRemotionRuntimeContract({ ...input, installedContracts: ["2026-08-04.2"] }), /contract drift/);
});
test("does not infer contract support from a missing export or package version", () => {
  assert.throws(() => selectRemotionRuntimeContract({ ...input, installedContracts: undefined }), /contract drift/);
  assert.throws(() => selectRemotionRuntimeContract({ ...input, installedPackageVersion: "0.1.5" }), /package drift/);
});
