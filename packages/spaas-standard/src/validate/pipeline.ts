import type { Diagnostic, ManifestSupportContext, PackageDigestMetadata, PackageEntry, SpaasManifest, SpaasValidationLimitOverrides, ValidationStage } from "../model";
import { parseSpaasManifest } from "../parser";
import { normalizePackageInventory, validatePackageStructure } from "../paths";
import { validateDependencyGraph } from "./dependencies";
import { scanPackageSecrets } from "./secrets";
import { computePackageDigest } from "../digest";

export type ValidationProfile="offline-package"|"release"|"marketplace";
export type EvidenceStage="V3"|"V5"|"V6"|"V7"|"V8";
export type EvidenceCheck="dependency-resolution"|"runtime-placement"|"migration-rollback"|"package-tests"|"marketplace-policy";
export interface ExternalValidationEvidence {readonly stage:EvidenceStage;readonly checkId:EvidenceCheck;readonly outcome:"passed"|"failed";readonly schemaVersion:"spaas-evidence-v1";readonly digest:string;readonly manifestIdentity:string;readonly manifestVersion:string;readonly profile:ValidationProfile;readonly reasonCode:string;readonly evidenceId:string;readonly observedAt:string;readonly expiresAt:string}
export interface SpaasValidationInput {readonly manifest:string|Uint8Array;readonly support:ManifestSupportContext;readonly entries:readonly PackageEntry[];readonly profile:ValidationProfile;readonly externalEvidence?:readonly ExternalValidationEvidence[];readonly limits?:SpaasValidationLimitOverrides;readonly validationTime?:string}
export interface SpaasValidationStageReport {readonly stage:ValidationStage;readonly status:"passed"|"failed"|"not_evaluated";readonly mandatory:boolean;readonly reason?:string;readonly evidenceIds:readonly string[];readonly diagnostics:readonly Diagnostic[]}
export type SpaasValidationStages=readonly [SpaasValidationStageReport & {stage:"V1"},SpaasValidationStageReport & {stage:"V2"},SpaasValidationStageReport & {stage:"V3"},SpaasValidationStageReport & {stage:"V4"},SpaasValidationStageReport & {stage:"V5"},SpaasValidationStageReport & {stage:"V6"},SpaasValidationStageReport & {stage:"V7"},SpaasValidationStageReport & {stage:"V8"}];
export type SpaasValidationReport=
 | {readonly status:"valid";readonly profile:ValidationProfile;readonly stages:SpaasValidationStages;readonly manifestIdentity?:string;readonly manifestVersion?:string;readonly digest?:PackageDigestMetadata;readonly diagnostics:readonly Diagnostic[];readonly formatVersion:"spaas-validation-v1"}
 | {readonly status:"invalid";readonly profile:ValidationProfile;readonly stages:SpaasValidationStages;readonly failedStage:SpaasValidationStageReport & {status:"failed"};readonly manifestIdentity?:string;readonly manifestVersion?:string;readonly digest?:PackageDigestMetadata;readonly diagnostics:readonly Diagnostic[];readonly formatVersion:"spaas-validation-v1"}
 | {readonly status:"needs_context";readonly profile:ValidationProfile;readonly stages:SpaasValidationStages;readonly missingRequiredStage:SpaasValidationStageReport & {status:"not_evaluated";mandatory:true};readonly manifestIdentity?:string;readonly manifestVersion?:string;readonly digest?:PackageDigestMetadata;readonly diagnostics:readonly Diagnostic[];readonly formatVersion:"spaas-validation-v1"};

const ORDER:readonly ValidationStage[]=["V1","V2","V3","V4","V5","V6","V7","V8"];
const CHECKS:Readonly<Record<Exclude<ValidationStage,"V1"|"V2"|"V4">,EvidenceCheck>>={V3:"dependency-resolution",V5:"runtime-placement",V6:"migration-rollback",V7:"package-tests",V8:"marketplace-policy"};
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
type MutableStage={status:"passed"|"failed"|"not_evaluated";mandatory:boolean;reason?:string;evidenceIds:readonly string[];diagnostics:Diagnostic[]};
const record=(status:MutableStage["status"],mandatory:boolean,diagnostics:Diagnostic[]=[],reason?:string,evidenceIds:readonly string[]=[]):MutableStage=>({status,mandatory,diagnostics,reason,evidenceIds});
const object=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
const nonempty=(value:unknown):boolean=>Array.isArray(value)?value.length>0:!!object(value)&&Object.keys(object(value)!).length>0;
function applicable(manifest:SpaasManifest,stage:"V5"|"V6"|"V7"|"V8"):boolean {
  const sections=manifest.sections??[];
  if(stage==="V5")return nonempty(manifest.runtime)||nonempty(manifest.hosting)||nonempty(manifest.requires&&object(manifest.requires)?.capabilities)||manifest.components.some((item)=>nonempty(item.executionPolicy));
  if(stage==="V6")return sections.some((item)=>item.name==="migrations")||manifest.components.some((item)=>item.type==="data-migration")||nonempty(object(manifest.operations)?.migrations);
  if(stage==="V7")return sections.some((item)=>item.name==="tests")||nonempty(manifest.tests);
  const intent=object(manifest.publication)??object(manifest.distribution);
  return Boolean(intent&&Object.values(intent).some((value)=>value===true||typeof value==="string"&&!/^(none|disabled|not_applicable)$/i.test(value)));
}
function explicitlyRequired(manifest:SpaasManifest,stage:"V5"|"V6"|"V7"|"V8"):boolean {
  const sections=manifest.sections??[];
  if(stage==="V5"){
    const runtime=object(manifest.runtime),hosting=object(manifest.hosting),requirements=object(manifest.requires);
    return runtime?.required===true||hosting?.required===true||(Array.isArray(requirements?.capabilities)&&requirements!.capabilities.some((item)=>!object(item)||object(item)!.required!==false))||manifest.components.some((component)=>object(component.executionPolicy)?.required===true);
  }
  if(stage==="V6")return sections.some((item)=>item.name==="migrations"&&item.required!==false)||manifest.components.some((item)=>item.type==="data-migration")||object(manifest.operations)?.migrations!==undefined;
  if(stage==="V7")return sections.some((item)=>item.name==="tests"&&item.required!==false)||object(manifest.tests)?.required===true;
  const intent=object(manifest.publication)??object(manifest.distribution);
  return intent?.required===true||intent?.publish===true;
}
function evidenceWindow(item:ExternalValidationEvidence,now:unknown):boolean {
  if(typeof now!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(now))return false;
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(item.observedAt)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(item.expiresAt))return false;
  const observed=Date.parse(item.observedAt),expiry=Date.parse(item.expiresAt),validation=Date.parse(now);
  return Number.isFinite(observed)&&Number.isFinite(expiry)&&Number.isFinite(validation)&&observed<=validation&&validation<expiry&&expiry>observed;
}
function validateEvidence(item:ExternalValidationEvidence,stage:EvidenceStage,manifest:SpaasManifest,digest:PackageDigestMetadata,profile:ValidationProfile,validationTime:unknown):boolean {
  const keys=["stage","checkId","outcome","schemaVersion","digest","manifestIdentity","manifestVersion","profile","reasonCode","evidenceId","observedAt","expiresAt"].sort(compare);
  const actual=Object.keys(item as object).sort(compare);
  return keys.length===actual.length&&keys.every((key,index)=>key===actual[index])&&item.stage===stage&&item.checkId===CHECKS[stage]&&item.schemaVersion==="spaas-evidence-v1"&&item.digest===digest.value&&item.manifestIdentity===manifest.metadata.id&&item.manifestVersion===manifest.metadata.version&&item.profile===profile&&(item.outcome==="passed"||item.outcome==="failed")&&/^[A-Z0-9_]{1,64}$/.test(item.reasonCode)&&/^[A-Za-z0-9._:-]{1,128}$/.test(item.evidenceId)&&evidenceWindow(item,validationTime);
}
function diagnostic(code:Diagnostic["code"],stage:ValidationStage,location:string,message:string,severity:Diagnostic["severity"]="error"):Diagnostic{return Object.freeze({code,stage,location,message,severity});}
function sortDiagnostics(items:Diagnostic[]):Diagnostic[]{const rank={error:0,warning:1,info:2};return items.sort((a,b)=>ORDER.indexOf(a.stage)-ORDER.indexOf(b.stage)||compare(a.location,b.location)||compare(a.code,b.code)||rank[a.severity]-rank[b.severity]);}

/** Pure in-memory V1–V8 composer. External evidence is data, never an executable callback. */
export function validateSpaasPackage(input:SpaasValidationInput):SpaasValidationReport {
  if(!input||typeof input!=="object"||Array.isArray(input)||!(["offline-package","release","marketplace"] as unknown[]).includes((input as SpaasValidationInput).profile)){
    const profile:ValidationProfile="offline-package",items:SpaasValidationStageReport[]=[];
    for(const stage of ORDER)items.push(Object.freeze({stage,status:stage==="V1"?"failed":"not_evaluated",mandatory:stage==="V1",...(stage==="V1"?{}:{reason:"A prerequisite stage did not produce trusted package facts."}),evidenceIds:Object.freeze([]),diagnostics:Object.freeze(stage==="V1"?[diagnostic("MANIFEST_DOCUMENT_INVALID","V1","/","Validation input or profile is malformed.")]:[])}));
    const diagnostics=Object.freeze(items.flatMap((item)=>item.diagnostics));
    return Object.freeze({status:"invalid",profile,stages:Object.freeze(items) as unknown as SpaasValidationStages,failedStage:items[0] as SpaasValidationStageReport&{status:"failed"},diagnostics,formatVersion:"spaas-validation-v1"});
  }
  const stages=new Map<ValidationStage,MutableStage>();
  const parser=parseSpaasManifest(input.manifest,input.support,input.limits);
  stages.set("V1",record(parser.ok?"passed":"failed",true,parser.ok?[]:[...parser.diagnostics]));
  let manifest:SpaasManifest|undefined,digest:PackageDigestMetadata|undefined;
  const external:unknown[]=Array.isArray(input.externalEvidence)?[...input.externalEvidence]:[];
  const malformedEvidenceContainer=input.externalEvidence!==undefined&&!Array.isArray(input.externalEvidence);
  const unknownEvidence=external.filter((item)=>!object(item)||!["V3","V5","V6","V7","V8"].includes(String(object(item)!.stage)));
  if(!parser.ok){for(const stage of ["V2","V3","V4"] as const)stages.set(stage,record("not_evaluated",stage!=="V3",[],"A prerequisite stage did not produce trusted package facts."));}
  else {
    manifest=parser.manifest;
    const invResult=normalizePackageInventory(input.entries,input.limits);
    if(!invResult.ok){stages.set("V2",record("failed",true,[...invResult.diagnostics]));for(const stage of ["V3","V4"] as const)stages.set(stage,record("not_evaluated",stage==="V4",[],"A prerequisite stage did not produce trusted package facts."));}
    else {
      const inventory=invResult.inventory;
      const supplied=typeof input.manifest==="string"?new TextEncoder().encode(input.manifest):input.manifest;
      const authority=inventory.byPath.get("app.manifest.yaml" as import("../paths").CanonicalPackagePath);
      const structure=validatePackageStructure(manifest,inventory);
      const digestResult=computePackageDigest({manifest,inventory});
      const v2=[...structure.diagnostics];
      if(!authority||!Buffer.from(authority.bytes).equals(Buffer.from(supplied)))v2.push(diagnostic("PACKAGE_REFERENCE_MISSING","V2","/app.manifest.yaml","The authoritative manifest entry does not match the supplied manifest bytes."));
      if(digestResult.ok)digest=digestResult.digest;else v2.push(diagnostic(digestResult.code,"V2","/digest",digestResult.message));
      stages.set("V2",record(v2.length?"failed":"passed",true,v2));
      const graph=validateDependencyGraph(structure,input.limits);
      if(graph.prerequisiteValid&&graph.localDiagnostics.length){
        const localGraphDiagnostics=graph.localDiagnostics.map((item)=>diagnostic(item.code,"V2",item.location,item.message,item.severity));
        stages.set("V2",record("failed",true,[...v2,...localGraphDiagnostics]));
      }
      if(!graph.prerequisiteValid)stages.set("V3",record("not_evaluated",input.profile!=="offline-package",[],"Structural validation did not produce trusted dependency facts."));
      else {
      const v3items=external.filter((item)=>object(item)?.stage==="V3");
      const matched=v3items.filter((item)=>digest&&validateEvidence(item as ExternalValidationEvidence,"V3",manifest!,digest,input.profile,input.validationTime));
      const v3Applicable=graph.externalRequired.length>0||graph.contextual.length>0;
      const v3Mandatory=graph.externalRequired.length>0||input.profile!=="offline-package"&&graph.contextual.length>0||graph.policyDiagnostics.length>0;
      const v3Diag=[...graph.policyDiagnostics];
      if(malformedEvidenceContainer||unknownEvidence.length)v3Diag.push(diagnostic("VALIDATION_EVIDENCE_UNSUPPORTED","V3","/externalEvidence","External evidence collection contains an unsupported or malformed item."));
      if(v3items.length&&(matched.length!==v3items.length||matched.length!==1))v3Diag.push(diagnostic("VALIDATION_EVIDENCE_MISMATCH","V3","/V3/evidence","Dependency evidence is malformed, ambiguous, expired, or not bound to this package."));
      if(v3items.length&&!v3Applicable)v3Diag.push(diagnostic("VALIDATION_EVIDENCE_UNSUPPORTED","V3","/V3/evidence","Evidence was supplied for dependencies not declared by the manifest."));
      const validEvidence=matched[0] as ExternalValidationEvidence|undefined;
      if(validEvidence?.outcome==="failed")v3Diag.push(diagnostic("VALIDATION_EVIDENCE_INVALID","V3","/V3/evidence","Trusted dependency evidence reports a failed check."));
      let v3Status:MutableStage["status"];
      if(v3Diag.length)v3Status="failed";
      else if(graph.localDiagnostics.length)v3Status="not_evaluated";
      else if(v3Applicable&&!validEvidence)v3Status="not_evaluated";
      else v3Status="passed";
      stages.set("V3",record(v3Status,v3Mandatory,v3Diag,v3Status==="not_evaluated"?(graph.localDiagnostics.length?"Local dependency integrity did not produce trusted policy facts.":"Trusted digest-bound dependency evidence was not supplied."):undefined,validEvidence?.outcome==="passed"?[validEvidence.evidenceId]:[]));
      }
      const secret=scanPackageSecrets(structure,input.limits?.scanBytes);
      stages.set("V4",record(secret.clean&&secret.complete?"passed":"failed",true,[...secret.diagnostics]));
      for(const stage of ["V5","V6","V7","V8"] as const){
        const isApplicable=applicable(manifest,stage),mandatory=isApplicable&&(input.profile!=="offline-package"||explicitlyRequired(manifest,stage));
        const stageItems=external.filter((item)=>object(item)?.stage===stage);
        if(!isApplicable){
          if(stageItems.length){stages.set(stage,record("failed",false,[diagnostic("VALIDATION_EVIDENCE_UNSUPPORTED",stage,`/${stage}/evidence`,"Evidence was supplied for a check not declared by the manifest.")]));}
          else stages.set(stage,record("not_evaluated",false,[diagnostic("NOT_APPLICABLE",stage,`/${stage}`,"This check is not applicable to the declared package.","info")],"NOT_APPLICABLE"));
          continue;
        }
        const good=stageItems.filter((item)=>digest&&validateEvidence(item as ExternalValidationEvidence,stage,manifest!,digest,input.profile,input.validationTime));
        if(stageItems.length&&(good.length!==1||good.length!==stageItems.length)){
          stages.set(stage,record("failed",mandatory,[diagnostic("VALIDATION_EVIDENCE_MISMATCH",stage,`/${stage}/evidence`,"Evidence is malformed, ambiguous, expired, or not bound to this package.")]));continue;
        }
        const accepted=good[0] as ExternalValidationEvidence|undefined;
        if(!accepted)stages.set(stage,record("not_evaluated",mandatory,[],"Trusted digest-bound external evidence was not supplied."));
        else if(accepted.outcome==="failed")stages.set(stage,record("failed",mandatory,[diagnostic("VALIDATION_EVIDENCE_INVALID",stage,`/${stage}/evidence`,"Trusted external evidence reports a failed check.")],undefined,[accepted.evidenceId]));
        else stages.set(stage,record("passed",mandatory,[],undefined,[accepted.evidenceId]));
      }
    }
  }
  const stageRows=ORDER.map((stage)=>{const row=stages.get(stage)??record("not_evaluated",false,[],"A prerequisite stage did not produce trusted package facts.");return Object.freeze({stage,status:row.status,mandatory:row.mandatory,...(row.reason?{reason:row.reason}:{}),evidenceIds:Object.freeze([...row.evidenceIds].sort(compare)),diagnostics:Object.freeze(sortDiagnostics([...row.diagnostics]))});});
  const diagnostics=Object.freeze(sortDiagnostics(stageRows.flatMap((stage)=>stage.diagnostics)));
  const failedRow=stageRows.find((row)=>row.mandatory&&row.status==="failed");
  const missing=stageRows.find((row)=>row.status==="not_evaluated"&&row.mandatory);
  const status=failedRow?"invalid":missing?"needs_context":"valid";
  const common={profile:input.profile,stages:Object.freeze(stageRows) as unknown as SpaasValidationStages,...(manifest?{manifestIdentity:manifest.metadata.id,manifestVersion:manifest.metadata.version}:{}),...(digest?{digest}:{}),diagnostics,formatVersion:"spaas-validation-v1" as const};
  if(status==="invalid")return Object.freeze({...common,status,failedStage:failedRow! as SpaasValidationStageReport&{status:"failed"}});
  if(status==="needs_context")return Object.freeze({...common,status,missingRequiredStage:missing! as SpaasValidationStageReport&{status:"not_evaluated";mandatory:true}});
  return Object.freeze({...common,status});
}
