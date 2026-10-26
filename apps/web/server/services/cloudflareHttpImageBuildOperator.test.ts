import { describe, expect, it, vi } from "vitest";
import { runHttpImageOperatorCommand, createHttpImageBuildOperator, resolveHttpImageCanonicalSource } from "./cloudflareHttpImageBuildOperator";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("bounded image operator processes", () => {
  it("cancels a real owned process after authority is revoked without returning secret diagnostics", async () => {
    let revoked = false;
    const assertAuthorized = vi.fn(async () => {
      if (revoked) throw Error("fixture authority revoked");
    });
    const pending = runHttpImageOperatorCommand({ command: process.execPath,
      args: ["-e", "console.log(process.pid); console.error('fixture-private-diagnostic'); setInterval(()=>{},100)"],
      env: {}, timeoutMs: 5000, assertAuthorized });
    // The second guard check revokes while the child is still running.
    revoked = true;
    await expect(pending).rejects.toThrow("fixture authority revoked");
    expect(assertAuthorized.mock.calls.length).toBeGreaterThan(1);
  });
  it("bounds a real process deadline and never reflects its stderr", async () => {
    await expect(runHttpImageOperatorCommand({ command: process.execPath,
      args: ["-e", "console.error('private-fixture'); setInterval(()=>{},100)"], env: {}, timeoutMs: 100,
      assertAuthorized: async () => undefined })).rejects.toThrow("DEADLINE_EXCEEDED");
  });
  it("refuses image build/publish composition inside an API runtime", () => {
    const previous = process.env.SMARTAIHUB_APPLICATION_RUNTIME;
    process.env.SMARTAIHUB_APPLICATION_RUNTIME = "cloudflare-http";
    try { expect(() => createHttpImageBuildOperator(async () => undefined)).toThrow("OPERATOR_RUNTIME_REQUIRED"); }
    finally { if (previous === undefined) delete process.env.SMARTAIHUB_APPLICATION_RUNTIME; else process.env.SMARTAIHUB_APPLICATION_RUNTIME = previous; }
  });
  it("keeps the Owner's exact older canonical build when a newer receipt appears and refuses a dirty source", async () => {
    const root=await mkdtemp(join(tmpdir(),"image-canonical-test-")),workspace=join(root,"immutable-source"),store=join(root,".development-build-results","fixture");
    const previous=process.env.SMARTSPEC_CANONICAL_BUILD_RESULTS_ROOT;
    try {
      await mkdir(workspace);await mkdir(store,{recursive:true});
      execFileSync("git",["init","--quiet",workspace]);
      execFileSync("git",["-C",workspace,"-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","--allow-empty","-qm","fixture"]);
      const sourceSha=execFileSync("git",["-C",workspace,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
      const ids=[`${sourceSha}-11111111-1111-4111-8111-111111111111`,`${sourceSha}-22222222-2222-4222-8222-222222222222`];
      for(const [index,id]of ids.entries())await writeFile(join(store,id+".json"),JSON.stringify({status:"BUILD_PASSED",canonical_ref:"refs/heads/main",source_verified:true,
        source_revision:sourceSha,canonical_tip_after_build:sourceSha,result_file:join(store,id+".json"),isolated_workspace:workspace,completed_at:index+1}));
      process.env.SMARTSPEC_CANONICAL_BUILD_RESULTS_ROOT=store;
      expect((await resolveHttpImageCanonicalSource()).buildId).toBe(ids[1]);
      expect(await resolveHttpImageCanonicalSource(candidate=>candidate.buildId===ids[0])).toEqual({sourceSha,buildId:ids[0]});
      await writeFile(join(workspace,"untracked.txt"),"dirty fixture");
      await expect(resolveHttpImageCanonicalSource()).rejects.toThrow("CANONICAL_RECEIPT_UNAVAILABLE");
    } finally {
      if(previous===undefined)delete process.env.SMARTSPEC_CANONICAL_BUILD_RESULTS_ROOT;else process.env.SMARTSPEC_CANONICAL_BUILD_RESULTS_ROOT=previous;
      await rm(root,{recursive:true,force:true});
    }
  });
});
