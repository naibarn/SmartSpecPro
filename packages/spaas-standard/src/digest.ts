import { createHash } from "node:crypto";
import { type PackageDigestMetadata, type SpaasManifest } from "./model";
import type { NormalizedInventory } from "./paths";
import { canonicalJsonStringify } from "./canonicalize";
import { canonicalizePackagePath } from "./paths";
import { resolveValidationLimits } from "./limits";

export type DigestResult = { readonly ok: true; readonly digest: PackageDigestMetadata } | { readonly ok: false; readonly code: "DIGEST_INPUT_INVALID"|"DIGEST_LIMIT_EXCEEDED"; readonly message: string };
export function classifyDigestExclusion(path: string): string | undefined {
  if(path===".git"||path.startsWith(".git/")) return "vcs_metadata";
  if(path==="provenance/signatures"||path.startsWith("provenance/signatures/")) return "self_referential_attestation_envelope";
  return undefined;
}
export function computePackageDigest(input:{readonly manifest:SpaasManifest;readonly inventory:NormalizedInventory}):DigestResult {
  if(!input||typeof input!=="object"||Object.keys(input as object).some((key)=>key!=="manifest"&&key!=="inventory"))return {ok:false,code:"DIGEST_INPUT_INVALID",message:"Digest input contains unsupported fields."};
  const inv=input.inventory;
  if(!inv||typeof inv!=="object")return {ok:false,code:"DIGEST_INPUT_INVALID",message:"Digest inventory is malformed or exceeds its entry limit."};
  const limits=resolveValidationLimits(inv.limits);
  if(!Array.isArray(inv.entries)||!limits.ok||inv.entries.length>limits.limits.packageEntries||!inv.byPath||typeof inv.byPath.has!=="function"||typeof inv.byPath.get!=="function"||!Number.isSafeInteger(inv.totalBytes)||inv.totalBytes<0)return {ok:false,code:"DIGEST_INPUT_INVALID",message:"Digest inventory is malformed or exceeds its entry limit."};
  const seen=new Set<string>();let aggregate=0;let previous:Buffer|undefined;let manifestEntry=false;
  for(const entry of inv.entries){
    if(typeof entry.path!=="string"||!(entry.bytes instanceof Uint8Array))return {ok:false,code:"DIGEST_INPUT_INVALID",message:"Digest inventory contains malformed entry data."};
    const canonical=canonicalizePackagePath(entry.path,limits.limits.pathBytes,limits.limits.pathDepth),pathBytes=Buffer.from(entry.path,"utf8"),mapped=inv.byPath.get(entry.path as never);
    if(!canonical.ok||canonical.path!==entry.path||seen.has(entry.path)||entry.bytes.byteLength>limits.limits.entryBytes||!mapped||mapped.path!==entry.path||mapped.kind!=="file"||!Buffer.from(mapped.bytes).equals(Buffer.from(entry.bytes)))return {ok:false,code:"DIGEST_INPUT_INVALID",message:"Digest inventory is noncanonical or ambiguous."};
    if(previous&&Buffer.compare(previous,pathBytes)>=0)return {ok:false,code:"DIGEST_INPUT_INVALID",message:"Digest inventory entries are not in canonical bytewise order."};
    previous=pathBytes;seen.add(entry.path);aggregate+=entry.bytes.byteLength;
    if(aggregate>limits.limits.aggregateBytes)return {ok:false,code:"DIGEST_LIMIT_EXCEEDED",message:"Digest inventory exceeds its aggregate byte limit."};
    if(entry.path==="app.manifest.yaml")manifestEntry=true;
  }
  if(aggregate!==inv.totalBytes||seen.size!==inv.byPath.size||!manifestEntry)return {ok:false,code:"DIGEST_INPUT_INVALID",message:"Digest inventory accounting or authoritative manifest entry is invalid."};
  if(!isBoundedJson(input.manifest,limits.limits.yamlDepth,limits.limits.yamlNodes))return {ok:false,code:"DIGEST_LIMIT_EXCEEDED",message:"Canonical manifest exceeds its documented complexity or byte limit."};
  let manifest:Buffer;try{manifest=Buffer.from(canonicalJsonStringify(input.manifest),"utf8");}catch{return {ok:false,code:"DIGEST_INPUT_INVALID",message:"Canonical manifest is not JSON-compatible."};}if(manifest.byteLength>limits.limits.manifestBytes)return {ok:false,code:"DIGEST_LIMIT_EXCEEDED",message:"Canonical manifest exceeds its documented complexity or byte limit."};
  const hash=createHash("sha256"); hash.update("spaas-package-v1\0");hash.update("manifest\0"); const mlen=Buffer.alloc(8);mlen.writeBigUInt64BE(BigInt(manifest.length));hash.update(mlen);hash.update(manifest);
  const included:string[]=[]; const excluded:Array<{path:string;reason:string}>=[];
  const entries=inv.entries;
  for(const entry of entries){const reason=classifyDigestExclusion(entry.path);if(reason){excluded.push({path:entry.path,reason});continue;}if(entry.path==="app.manifest.yaml")continue;
    const path=Buffer.from(entry.path,"utf8");hash.update("entry\0");const plen=Buffer.alloc(4);plen.writeUInt32BE(path.length);hash.update(plen);hash.update(path);const len=Buffer.alloc(8);len.writeBigUInt64BE(BigInt(entry.bytes.length));hash.update(len);hash.update(entry.bytes);included.push(entry.path);
  }
  hash.update("end\0");return {ok:true,digest:Object.freeze({algorithm:"sha256",version:"spaas-package-v1",value:`spaas-package-v1:sha256:${hash.digest("hex")}`,includedPaths:Object.freeze(included),excludedPaths:Object.freeze(excluded.map((item)=>Object.freeze({...item})))})};
}

function isBoundedJson(root:unknown,maxDepth:number,maxNodes:number):boolean {
  const stack:Array<{value:unknown;depth:number}>=[{value:root,depth:1}],seen=new WeakSet<object>();let nodes=0;
  while(stack.length){const {value,depth}=stack.pop()!;nodes++;if(nodes>maxNodes||depth>maxDepth)return false;
    if(value===null||typeof value==="string"||typeof value==="boolean")continue;
    if(typeof value==="number"){if(!Number.isFinite(value))return false;continue;}
    if(typeof value!=="object")return false;
    if(seen.has(value))return false;seen.add(value);
    if(Array.isArray(value)){for(const item of value)stack.push({value:item,depth:depth+1});continue;}
    const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)return false;
    for(const key of Reflect.ownKeys(value)){if(typeof key!=="string")return false;nodes++;if(nodes>maxNodes)return false;const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!("value" in descriptor))return false;stack.push({value:descriptor.value,depth:depth+1});}
  }
  return true;
}
