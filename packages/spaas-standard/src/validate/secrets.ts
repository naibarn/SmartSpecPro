import type { Diagnostic } from "../model";
import type { NormalizedInventory } from "../paths";
import type { PackageStructureResult } from "../paths";

export interface SecretScanResult { readonly clean: boolean; readonly complete: boolean; readonly findings: readonly { readonly path: string; readonly ruleId: string; readonly location?:string }[]; readonly diagnostics: readonly Diagnostic[]; readonly scannedBytes: number }
const PATH_RULES: ReadonlyArray<[RegExp, string]> = [[/(^|\/)\.env(?:\.[^/]+)?$/i,"SECRET_PATH_ENV_FILE"],[/(^|\/)(?:id_rsa|id_ed25519|id_ecdsa|.*(?:private[-_]?key|credentials?|secrets?)(?:\.[^/]*)?)$/i,"SECRET_PATH_CREDENTIAL_FILE"],[/\.(?:pem|key|p12|pfx|jks|keystore)$/i,"SECRET_PATH_PRIVATE_KEY"]];
const ASSIGNMENT = /(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["']?([A-Za-z0-9_+/=-]{20,})/i;
const PEM = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
export function scanPackageSecrets(input: NormalizedInventory|PackageStructureResult, maxBytes = 64 * 1024 * 1024): SecretScanResult {
  if(!input||typeof input!=="object")return Object.freeze({clean:false,complete:false,findings:Object.freeze([]),diagnostics:Object.freeze([{code:"SECRET_SCAN_INPUT_INVALID",stage:"V4",severity:"error",location:"/entries",message:"Secret scan input is malformed."}]),scannedBytes:0});
  const inventory="inventory" in input?input.inventory:input;
  const structure="inventory" in input?input:undefined;
  if(!inventory||typeof inventory!=="object"||!Array.isArray(inventory.entries)||!inventory.limits||typeof inventory.limits!=="object"||!Number.isSafeInteger(inventory.limits.scanBytes)||!Number.isSafeInteger(inventory.limits.entryBytes)||!Number.isSafeInteger(inventory.limits.yamlNodes)||inventory.entries.some((entry)=>!entry||typeof entry.path!=="string"||!(entry.bytes instanceof Uint8Array))||structure&&(!structure.manifest||typeof structure.manifest!=="object"))return Object.freeze({clean:false,complete:false,findings:Object.freeze([]),diagnostics:Object.freeze([{code:"SECRET_SCAN_INPUT_INVALID",stage:"V4",severity:"error",location:"/entries",message:"Secret scan inventory is malformed."}]),scannedBytes:0});
  const findings: Array<{path:string;ruleId:string;location?:string}> = []; const diagnostics: Diagnostic[]=[]; let scannedBytes=0;let ruleEvaluations=0;
  const maxScanBytes=Math.min(maxBytes,inventory.limits.scanBytes),maxEntryBytes=Math.min(inventory.limits.entryBytes,inventory.limits.scanBytes),maxFindings=1024,maxRuleEvaluations=Math.min(inventory.limits.yamlNodes,200_000);
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1){return Object.freeze({clean:false,complete:false,findings:Object.freeze([]),diagnostics:Object.freeze([{code:"SECRET_SCAN_LIMIT_EXCEEDED",stage:"V4",severity:"error",location:"/entries",message:"Secret scanning limit is invalid."}]),scannedBytes:0});}
  for (const entry of inventory.entries) {
    if(ruleEvaluations+PATH_RULES.length>maxRuleEvaluations){diagnostics.push({code:"SECRET_SCAN_LIMIT_EXCEEDED",stage:"V4",severity:"error",location:entry.path,message:"Secret scanning exceeds its configured rule-work limit."});break;}
    ruleEvaluations+=PATH_RULES.length;
    for (const [pattern,ruleId] of PATH_RULES) {if(pattern.test(entry.path)) findings.push(Object.freeze({path:entry.path,ruleId}));}
    if(findings.length>maxFindings){diagnostics.push({code:"SECRET_SCAN_LIMIT_EXCEEDED",stage:"V4",severity:"error",location:entry.path,message:"Secret scanning exceeds its finding limit."});break;}
    if(isBinary(entry.bytes))continue;
    scannedBytes += entry.bytes.byteLength;
    if(entry.bytes.byteLength>maxEntryBytes||scannedBytes>maxScanBytes) { diagnostics.push({code:"SECRET_SCAN_LIMIT_EXCEEDED",stage:"V4",severity:"error",location:entry.path,message:"Secret scanning exceeds its configured byte limit."}); break; }
    let text:string; try { text=new TextDecoder("utf-8",{fatal:true}).decode(entry.bytes); } catch { diagnostics.push({code:"SECRET_SCAN_INPUT_INVALID",stage:"V4",severity:"error",location:entry.path,message:"A text candidate is not valid UTF-8."}); continue; }
    if(ruleEvaluations+2>maxRuleEvaluations){diagnostics.push({code:"SECRET_SCAN_LIMIT_EXCEEDED",stage:"V4",severity:"error",location:entry.path,message:"Secret scanning exceeds its configured rule-work limit."});break;}ruleEvaluations+=2;
    if(PEM.test(text)) findings.push(Object.freeze({path:entry.path,ruleId:"SECRET_PRIVATE_KEY_PEM"}));
    if(ASSIGNMENT.test(text)) findings.push(Object.freeze({path:entry.path,ruleId:"SECRET_CREDENTIAL_ASSIGNMENT"}));
    if(findings.length>maxFindings){diagnostics.push({code:"SECRET_SCAN_LIMIT_EXCEEDED",stage:"V4",severity:"error",location:entry.path,message:"Secret scanning exceeds its finding limit."});break;}
  }
  if(structure){
    const stack:Array<{value:unknown;location:string}>=[{value:structure.manifest,location:""}];let nodes=0;
    while(stack.length){const current=stack.pop()!;nodes++;if(nodes>inventory.limits.yamlNodes){diagnostics.push({code:"SECRET_SCAN_LIMIT_EXCEEDED",stage:"V4",severity:"error",location:"/app.manifest.yaml",message:"Manifest reference inspection exceeds its work limit."});break;}
      if(Array.isArray(current.value)){for(let i=current.value.length-1;i>=0;i--)stack.push({value:current.value[i],location:`${current.location}/${i}`});continue;}
      if(current.value&&typeof current.value==="object"){const pairs=Object.entries(current.value);for(let i=pairs.length-1;i>=0;i--){const [key,value]=pairs[i]!;const location=`${current.location}/${key.replaceAll("~","~0").replaceAll("/","~1")}`;if(/^(?:secretRef|bindingRef|authorizationBindingRef|credentialRef)$/i.test(key)&&typeof value==="string"&&looksLikeCredential(value)){findings.push(Object.freeze({path:"app.manifest.yaml",ruleId:"SECRET_CREDENTIAL_ASSIGNMENT",location}));}else stack.push({value,location});}}
    }
    if(findings.length>maxFindings)diagnostics.push({code:"SECRET_SCAN_LIMIT_EXCEEDED",stage:"V4",severity:"error",location:"/app.manifest.yaml",message:"Secret scanning exceeds its finding limit."});
  }
  const unique=[...new Map(findings.map((f)=>[`${f.path}\0${f.ruleId}\0${f.location??""}`,f])).values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:(a.location??"")<(b.location??"")?-1:(a.location??"")>(b.location??"")?1:a.ruleId<b.ruleId?-1:1);
  for(const f of unique) diagnostics.push({code:f.ruleId.startsWith("SECRET_PATH")?"SECRET_SENSITIVE_PATH":"SECRET_EMBEDDED",stage:"V4",severity:"error",location:f.location??f.path,message:"A package secret-safety rule was matched."});
  return Object.freeze({clean:unique.length===0&&diagnostics.length===0,complete:diagnostics.every((d)=>d.code!=="SECRET_SCAN_LIMIT_EXCEEDED"&&d.code!=="SECRET_SCAN_INPUT_INVALID"),findings:Object.freeze(unique.map((item)=>Object.freeze({...item}))),diagnostics:Object.freeze(diagnostics.map((item)=>Object.freeze({...item}))),scannedBytes});
}

function looksLikeCredential(value:string):boolean{return /^(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{24,}|[A-Za-z0-9+/]{40,}={0,2})$/.test(value);}

function isBinary(bytes:Uint8Array):boolean {
  const signatures:number[][]=[[0x89,0x50,0x4e,0x47],[0xff,0xd8,0xff,0xe0],[0x50,0x4b,0x03,0x04],[0x47,0x49,0x46,0x38],[0x25,0x50,0x44,0x46]];
  return signatures.some((signature)=>signature.every((value,index)=>bytes[index]===value));
}
