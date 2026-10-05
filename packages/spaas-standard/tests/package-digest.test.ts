import {describe,expect,it} from "vitest";
import {computePackageDigest,normalizePackageInventory} from "../src";
import type {SpaasManifest} from "../src/model";

describe("versioned package digest",()=>{
 it("matches the canonical v1 framing golden vector",()=>{const inventory=normalizePackageInventory([{path:"app.manifest.yaml",kind:"file",bytes:new Uint8Array()},{path:"a.txt",kind:"file",bytes:new TextEncoder().encode("abc")}]);expect(inventory.ok).toBe(true);if(inventory.ok){const result=computePackageDigest({manifest:{a:1} as unknown as SpaasManifest,inventory:inventory.inventory});expect(result.ok).toBe(true);if(result.ok)expect(result.digest.value).toBe("spaas-package-v1:sha256:3ddb79185a2cf1827e79a56ad3067330f37e14360fbce2d682392d4236dc2856");}});
 it("rejects an over-limit canonical inventory supplied directly",()=>{const inventory=normalizePackageInventory([{path:"app.manifest.yaml",kind:"file",bytes:new Uint8Array()},{path:"a.txt",kind:"file",bytes:new Uint8Array([1,2])}],{entryBytes:1});expect(inventory.ok).toBe(false);});
 it("returns stable errors for malformed public input",()=>{expect(computePackageDigest(null as never)).toMatchObject({ok:false,code:"DIGEST_INPUT_INVALID"});expect(computePackageDigest({manifest:{} as SpaasManifest,inventory:null as never})).toMatchObject({ok:false,code:"DIGEST_INPUT_INVALID"});});
});
