import {describe,expect,it,vi} from "vitest";
vi.mock("../db",()=>({getDb:()=>({})}));
vi.mock("./cloudflareOriginConfiguration",()=>({withCloudflareOriginConfiguration:async(_db:any,_input:any,operation:any)=>
  operation({descriptor:{ingressMode:"production-origin-bridge-v1"},secrets:{token:"fixture"}})}));
describe("Production runtime origin adapter",()=>{
  it("restores immutable references omitted by the encrypted configuration callback",async()=>{
    const before=process.env.DATABASE_URL;process.env.DATABASE_URL="postgresql://isolated-fixture";
    try{
      const {createCloudflareProductionDeploymentRuntime}=await import("./cloudflareProductionDeploymentRuntime");
      const runtime=createCloudflareProductionDeploymentRuntime()!;
      const configurationRef=`cf-origin:${"b".repeat(64)}`,configurationDigest="b".repeat(64);
      await runtime.withOriginConfiguration({target:{tenantId:"fixture",projectId:"fixture"} as any,configurationRef,configurationDigest,
        operation:async value=>{expect(value.configurationRef).toBe(configurationRef);expect(value.configurationDigest).toBe(configurationDigest);
          expect(value.descriptor.ingressMode).toBe("production-origin-bridge-v1");}});
    }finally{if(before===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=before;}
  });
});
