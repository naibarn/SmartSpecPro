import { describe,expect,it } from "vitest";
import { canonicalizePackagePath,normalizePackageInventory,validatePackageStructure } from "../src";
import { entriesFor,parsedManifest } from "./helpers/spec261";

describe("package structure contract",()=>{
 it("normalizes NFC identities and rejects reserved or unsafe cross-host names",()=>{expect(canonicalizePackagePath("cafe\u0301/a.txt")).toMatchObject({ok:true,path:"café/a.txt"});for(const path of ["/etc/passwd","C:/secret","\\\\host\\share","a//b","../x","CON.txt","a."])expect(canonicalizePackagePath(path).ok).toBe(false);});
 it("rejects Unicode collisions rather than selecting a winner",()=>{const result=normalizePackageInventory([{path:"café.txt",kind:"file",bytes:new Uint8Array([1])},{path:"cafe\u0301.txt",kind:"file",bytes:new Uint8Array([2])}]);expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics[0]?.code).toBe("PACKAGE_PATH_COLLISION");});
 it("returns immutable bytes and a read-only lookup facade",()=>{const result=normalizePackageInventory(entriesFor());expect(result.ok).toBe(true);if(result.ok){const entry=result.inventory.entries[0]!;const mutable=entry.bytes;mutable[0]=0;expect(entry.bytes[0]).not.toBe(0);expect("set" in result.inventory.byPath).toBe(false);}});
 it("rejects malformed runtime descriptors without throwing",()=>{expect(normalizePackageInventory(null as never).ok).toBe(false);expect(normalizePackageInventory([null] as never).ok).toBe(false);});
 it("validates component and declared section references",()=>{const manifest={...parsedManifest(),sections:[{name:"migrations",path:"migrations/001.sql",required:true}]};const inv=normalizePackageInventory(entriesFor());expect(inv.ok).toBe(true);if(inv.ok){const result=validatePackageStructure(manifest,inv.inventory);expect(result.ok).toBe(false);expect(result.sectionReferences).toHaveLength(1);expect(result.diagnostics.some((d)=>d.code==="PACKAGE_SECTION_INVALID")).toBe(true);}});
});
