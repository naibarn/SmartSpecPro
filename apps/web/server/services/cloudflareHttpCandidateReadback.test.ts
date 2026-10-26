import { describe, expect, it, vi } from "vitest";
import { verifyHttpCandidateProviderReceipt, type HttpCandidateReceipt } from "./cloudflareHttpCandidateReadback";
function fixture() {
  const accountRef = "a".repeat(32), suffix = "b".repeat(12), workerName = `smartspec-production-${suffix}-candidate`;
  const receipt: HttpCandidateReceipt = { schemaVersion: "cloudflare-production-native-preparation-receipt-v1", accountRef, workerName,
    deploymentId: "00000000-0000-4000-8000-000000000001", versionId: "00000000-0000-4000-8000-000000000002",
    workerSourceSha:"c".repeat(40),imageSourceSha:"d".repeat(40),manifestDigest:"e".repeat(64),
    applications: ["node","python"].map((runtime,index)=>({applicationId:String(index+1).repeat(32),namespaceId:String(index+1).repeat(32),
      name:`smartspec-production-${suffix}-${runtime}-http`, images:{[runtime]:`registry.cloudflare.com/${accountRef}/smartspec-staging-${suffix}-${runtime}-http@sha256:${"f".repeat(64)}`}})),
    containerStarts:0,runtimeConfigured:false,runtimeAcceptance:false,dnsMutation:false,trafficMutation:false,m2Preserved:true };
  const bindings=receipt.applications.map((app,index)=>({type:"durable_object_namespace",name:index===0?"NODE_HTTP":"PYTHON_HTTP",
    class_name:index===0?"ProductionNodeHttpContainer":"ProductionPythonHttpContainer",namespace_id:app.namespaceId}));
  const version={id:receipt.versionId,resources:{bindings,script_runtime:{containers:receipt.applications.map((app,index)=>({class_name:bindings[index].class_name,images:app.images}))}}};
  const apps=receipt.applications.map(app=>({id:app.applicationId,name:app.name,scheduling_policy:"durable_object",durable_objects:{namespace_id:app.namespaceId}}));
  const deployment={id:receipt.deploymentId,versions:[{version_id:receipt.versionId,percentage:100}]};
  const routes=[{id:"accepted-route",pattern:"smartaihub.app/*",script:"smartspec-cloudflare-runtime"}];
  const fetchImpl=vi.fn(async(url:any,init:any)=>{
    expect(init.method).toBe("GET");expect(init.redirect).toBe("error");
    const path=new URL(String(url)).pathname;
    const result=path.endsWith('/deployments')?{deployments:[deployment]}:path.includes('/versions/')?version:path.endsWith('/applications')?apps:routes;
    return Response.json({success:true,result});
  });
  return {receipt,accountRef,bindings,version,apps,deployment,routes,fetchImpl,input:{receipt,accountRef,token:"fixture-secret",fetchImpl}};
}
describe("canonical native Candidate provider readback",()=>{
  it("accepts a scoped compensated deployment only for the original immutable version",async()=>{
    const f=fixture(),deploymentId="00000000-0000-4000-8000-000000000003"; f.deployment.id=deploymentId;
    expect((await verifyHttpCandidateProviderReceipt({...f.input,restoredBaseline:{deploymentId,versionId:f.receipt.versionId}})).deploymentId).toBe(deploymentId);
    await expect(verifyHttpCandidateProviderReceipt({...f.input,restoredBaseline:{deploymentId,versionId:"00000000-0000-4000-8000-000000000004"}})).rejects.toThrow("RESTORED_BASELINE_DENIED");
  });
  it("independently verifies exact deployment, namespaces and immutable images with GET only, without claiming runtime acceptance",async()=>{
    const f=fixture(),result=await verifyHttpCandidateProviderReceipt(f.input);
    expect(result).toMatchObject({verified:true,deploymentId:f.receipt.deploymentId,versionId:f.receipt.versionId,m2RouteId:"accepted-route",
      runtimeBindingsConfigured:false,runtimeAcceptance:false,providerMutations:0});
    expect(result.applications).toHaveLength(2);expect(f.fetchImpl).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
  });
  it("rejects a foreign account before any provider call",async()=>{
    const f=fixture();await expect(verifyHttpCandidateProviderReceipt({...f.input,accountRef:"f".repeat(32)})).rejects.toThrow("ACCOUNT_DENIED");
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it.each(["deployment","version","namespace","image","application","route"])("rejects changed %s instead of adopting same-name resources",async(kind)=>{
    const f=fixture();
    if(kind==='deployment')f.deployment.id="00000000-0000-4000-8000-000000000003";
    if(kind==='version')f.deployment.versions[0].percentage=50;
    if(kind==='namespace')f.bindings[0].namespace_id="f".repeat(32);
    if(kind==='image')f.version.resources.script_runtime.containers[0].images={node:"registry/forged:latest"};
    if(kind==='application')f.apps[0].id="f".repeat(32);
    if(kind==='route')f.routes[0].script="foreign-worker";
    await expect(verifyHttpCandidateProviderReceipt(f.input)).rejects.toThrow(/CHANGED|MISMATCH/);
  });
  it("does not treat partial provider inventory or denied reads as verification",async()=>{
    const f=fixture();f.fetchImpl.mockImplementationOnce(async()=>Response.json({success:false,result:[]},{status:403}));
    await expect(verifyHttpCandidateProviderReceipt(f.input)).rejects.toThrow("READBACK_HTTP_403");
  });
});
