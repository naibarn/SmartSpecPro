import type { Diagnostic, SpaasValidationLimitOverrides } from "../model";
import { resolveValidationLimits } from "../limits";
import type { PackageStructureResult } from "../paths";

export interface DependencyGraphEdge { readonly kind: "component"|"capability"|"skill"; readonly from: string; readonly to: string; readonly required: boolean; readonly versionRange?: string }
export interface DependencyGraphResult {
  readonly prerequisiteValid:boolean;
  readonly order: readonly string[];
  readonly edges: readonly DependencyGraphEdge[];
  readonly cycles: readonly (readonly string[])[];
  readonly diagnostics: readonly Diagnostic[];
  readonly localDiagnostics: readonly Diagnostic[];
  readonly policyDiagnostics: readonly Diagnostic[];
  readonly contextual: readonly string[];
  readonly externalRequired: readonly string[];
}
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const RANGE=/^(?:\*|(?:\^|~|>=|<=|>|<)?\s*\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\s+(?:\|\||>=|<=|>|<|=)\s*(?:\^|~)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)*)$/;

function productionIntent(manifest:SpaasManifest):boolean {
  const candidates=[manifest.publication,manifest.distribution,manifest.lifecycle];
  return candidates.some((candidate)=>candidate!==null&&typeof candidate==="object"&&Object.values(candidate).some((value)=>typeof value==="string"&&/^(production|prod|release)$/i.test(value)));
}

function canonicalCycle(adjacency:Map<string,string[]>,leftover:Set<string>):readonly string[]|undefined {
  const color=new Map<string,0|1|2>();
  for(const start of [...leftover].sort(compare)){
    if(color.get(start))continue;
    const stack:Array<{id:string;next:number;targets:string[]}>= [{id:start,next:0,targets:(adjacency.get(start)??[]).filter((id)=>leftover.has(id)).sort(compare)}];
    color.set(start,1);
    while(stack.length){
      const frame=stack[stack.length-1]!;
      if(frame.next>=frame.targets.length){color.set(frame.id,2);stack.pop();continue;}
      const target=frame.targets[frame.next++]!;const targetColor=color.get(target)??0;
      if(targetColor===0){color.set(target,1);stack.push({id:target,next:0,targets:(adjacency.get(target)??[]).filter((id)=>leftover.has(id)).sort(compare)});continue;}
      if(targetColor===1){const path=stack.map((item)=>item.id);const at=path.indexOf(target);const cycle=[...path.slice(at),target];const body=cycle.slice(0,-1);let min=0;for(let i=1;i<body.length;i++)if(compare(body[i]!,body[min]!)<0)min=i;return Object.freeze([...body.slice(min),...body.slice(0,min),body[min]!]);}
    }
  }
  return undefined;
}

/** Pure bounded local graph analysis; external resolution is represented as context or failure. */
export function validateDependencyGraph(structure:PackageStructureResult,overrides?:SpaasValidationLimitOverrides):DependencyGraphResult {
  if(!structure||typeof structure!=="object"||typeof structure.ok!=="boolean"||!structure.manifest||typeof structure.manifest!=="object"||!Array.isArray(structure.manifest.components)||!structure.inventory||typeof structure.inventory!=="object")return Object.freeze({prerequisiteValid:false,order:Object.freeze([]),edges:Object.freeze([]),cycles:Object.freeze([]),diagnostics:Object.freeze([]),localDiagnostics:Object.freeze([]),policyDiagnostics:Object.freeze([]),contextual:Object.freeze([]),externalRequired:Object.freeze([])});
  const manifest=structure.manifest;
  const diagnostics:Diagnostic[]=[],contextual:string[]=[],edges:DependencyGraphEdge[]=[];
  const externalRequired:string[]=[];
  const limits=resolveValidationLimits(overrides),components=manifest.components;
  const ids=components.map((item)=>typeof item.id==="string"?item.id:"").sort(compare),componentById=new Map(components.map((item)=>[String(item.id),item]));
  if(!structure.ok)return Object.freeze({prerequisiteValid:false,order:Object.freeze([]),edges:Object.freeze([]),cycles:Object.freeze([]),diagnostics:Object.freeze([]),localDiagnostics:Object.freeze([]),policyDiagnostics:Object.freeze([]),contextual:Object.freeze([]),externalRequired:Object.freeze([])});
  if(!limits.ok||ids.length>limits.limits.graphNodes){diagnostics.push({code:"DEPENDENCY_LIMIT_EXCEEDED",stage:"V3",severity:"error",location:"/components",message:"Dependency graph exceeds its configured node limit."});const frozen=Object.freeze(diagnostics.map((item)=>Object.freeze({...item})));return Object.freeze({prerequisiteValid:true,order:Object.freeze([]),edges:Object.freeze([]),cycles:Object.freeze([]),diagnostics:frozen,localDiagnostics:frozen,policyDiagnostics:Object.freeze([]),contextual:Object.freeze([]),externalRequired:Object.freeze([])});}
  const known=new Set(ids),adjacency=new Map(ids.map((id)=>[id,[] as string[]])),indegree=new Map(ids.map((id)=>[id,0])),seen=new Set<string>();let edgeCount=0;
  const localDiagnostics:Diagnostic[]=[],policyDiagnostics:Diagnostic[]=[];
  const emit=(code:Diagnostic["code"],location:string,message:string,category:"local"|"policy"="local")=>(category==="local"?localDiagnostics:policyDiagnostics).push({code,stage:"V3",severity:"error",location,message});
  for(const component of components){
    const from=String(component.id),rawDependencies=Array.isArray(component.dependsOn)?component.dependsOn:[];
    for(const raw of rawDependencies){
      edgeCount++;if(edgeCount>limits.limits.graphEdges){emit("DEPENDENCY_LIMIT_EXCEEDED","/components","Dependency graph exceeds its configured edge limit.");const frozenLocal=Object.freeze(localDiagnostics.map((item)=>Object.freeze({...item})));return Object.freeze({prerequisiteValid:true,order:Object.freeze([]),edges:Object.freeze([]),cycles:Object.freeze([]),diagnostics:frozenLocal,localDiagnostics:frozenLocal,policyDiagnostics:Object.freeze([]),contextual:Object.freeze(contextual.sort(compare)),externalRequired:Object.freeze(externalRequired.sort(compare))});}
      const item:Record<string,unknown>=typeof raw==="string"?(raw.startsWith("skill:")?{skill:raw.slice(6)}:raw.startsWith("capability:")?{capability:raw.slice(11)}:{component:raw}):raw as Record<string,unknown>;
      const kind=item.component!==undefined?"component":item.skill!==undefined?"skill":item.capability!==undefined?"capability":undefined;
      const to=String(kind?item[kind]:"");const required=item.required!==false;const loc=`/components/${encodeURIComponent(from)}/dependsOn/${encodeURIComponent(`${kind??"unknown"}:${to}`)}`;
      if(!kind||!to){emit("DEPENDENCY_INVALID",loc,"Dependency edge has an invalid target shape.");continue;}
      if(typeof item.versionRange==="string"&&!RANGE.test(item.versionRange)){emit("DEPENDENCY_VERSION_INVALID",loc,"Dependency version range has an unsupported syntax.","policy");continue;}
      const key=`${from}\0${kind}\0${to}\0${String(item.versionRange??"")}`;if(seen.has(key)){emit("DEPENDENCY_DUPLICATE",loc,"Duplicate dependency edges are prohibited.");continue;}seen.add(key);
      if(kind==="component"||(kind==="skill"&&known.has(to)&&componentById.get(to)?.type==="skill")){
        if(!known.has(to)){emit("DEPENDENCY_UNRESOLVED",loc,"A required component endpoint is not locally declared.");continue;}
        if(from===to){emit("DEPENDENCY_SELF_REFERENCE",loc,"Self dependencies are prohibited.");continue;}
        edges.push(Object.freeze({kind:"component",from,to,required,...(typeof item.versionRange==="string"?{versionRange:item.versionRange}:{})}));
        adjacency.get(to)!.push(from);indegree.set(from,indegree.get(from)!+1);continue;
      }
      if(kind==="skill"||kind==="capability"){
        const optionalSafe=item.required===false&&item.omissionSafe===true;
        if(optionalSafe)contextual.push(`${from}:${kind}:${to}`);else externalRequired.push(`${from}:${kind}:${to}`);
        edges.push(Object.freeze({kind,from,to,required,...(typeof item.versionRange==="string"?{versionRange:item.versionRange}:{})}));continue;
      }
      emit("DEPENDENCY_UNRESOLVED",loc,"A required component endpoint is not locally declared.");
    }
    if(productionIntent(manifest)){
      const version=typeof component.version==="string"?component.version:"";
      const source=typeof component.source==="string"?component.source:"";
      const mutable=(/^(latest|main|master|head|\*|branch[:/])/i.test(version)||/^git(?:\+|:)/i.test(source))&&!component.digest;
      if(mutable)emit("DEPENDENCY_MUTABLE_REFERENCE",`/components/${encodeURIComponent(from)}/version`,`Production package references must be immutable or content-pinned.`,"policy");
    }
  }
  const ready=ids.filter((id)=>indegree.get(id)===0).sort(compare),order:string[]=[];
  while(ready.length){const id=ready.shift()!;order.push(id);for(const next of adjacency.get(id)!.sort(compare)){indegree.set(next,indegree.get(next)!-1);if(indegree.get(next)===0){ready.push(next);ready.sort(compare);}}}
  const leftover=new Set(ids.filter((id)=>indegree.get(id)!>0));let cycles:readonly (readonly string[])[]=[];
  if(leftover.size){const cycle=canonicalCycle(adjacency,leftover);if(cycle){cycles=Object.freeze([cycle]);emit("DEPENDENCY_CYCLE","/components","The component dependency graph contains a cycle.");}}
  diagnostics.push(...localDiagnostics,...policyDiagnostics);diagnostics.sort((a,b)=>compare(a.location,b.location)||compare(a.code,b.code));
  edges.sort((a,b)=>compare(a.from,b.from)||compare(a.kind,b.kind)||compare(a.to,b.to));
  localDiagnostics.sort((a,b)=>compare(a.location,b.location)||compare(a.code,b.code));policyDiagnostics.sort((a,b)=>compare(a.location,b.location)||compare(a.code,b.code));
  return Object.freeze({prerequisiteValid:true,order:Object.freeze(order),edges:Object.freeze(edges),cycles,diagnostics:Object.freeze(diagnostics.map((item)=>Object.freeze({...item}))),localDiagnostics:Object.freeze(localDiagnostics.map((item)=>Object.freeze({...item}))),policyDiagnostics:Object.freeze(policyDiagnostics.map((item)=>Object.freeze({...item}))),contextual:Object.freeze(contextual.sort(compare)),externalRequired:Object.freeze(externalRequired.sort(compare))});
}
