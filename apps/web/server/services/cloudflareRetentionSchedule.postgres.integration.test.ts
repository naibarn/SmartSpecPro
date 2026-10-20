import type { Request, Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { createSpec260EvidenceRetentionSweep } from "../../../cloudflare/src/spec260BackgroundWork";
import { createSpec260EvidenceRetentionScheduleHandler } from "../routes/spec260EvidenceRetentionSchedule";

const suite=process.env.RUN_CLOUDFLARE_STAGING_DB_INTEGRATION==="true"?describe:describe.skip;
suite("Worker retention schedule through the canonical PostgreSQL occurrence/outbox ledger",()=>{
  let disposable:Awaited<ReturnType<typeof import("./__tests__/support/spec277DisposablePostgres").createSpec277DisposablePostgres>>;
  let sql:postgres.Sql,closeDb:()=>Promise<void>,createJob:typeof import("./jobControlPlaneGateway").createControlPlaneJob;
  const original={DATABASE_URL:process.env.DATABASE_URL,NODE_ENV:process.env.NODE_ENV,DB_POOL_SIZE:process.env.DB_POOL_SIZE};
  beforeAll(async()=>{
    disposable=await(await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    sql=postgres(disposable.databaseUrl,{max:2});
    await(await import("./__tests__/support/spec277AutoTeamRuntimeSchema")).installSpec277AutoTeamRuntimeSchema(sql);
    process.env.DATABASE_URL=disposable.databaseUrl;process.env.NODE_ENV="test";process.env.DB_POOL_SIZE="2";vi.resetModules();
    createJob=(await import("./jobControlPlaneGateway")).createControlPlaneJob;closeDb=(await import("../db")).closeDb;
  },30_000);
  afterAll(async()=>{
    if(closeDb)await closeDb();if(sql)await sql.end({timeout:5});if(disposable)await disposable.close();
    for(const[key,value]of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  },20_000);
  it("coalesces a duplicate and missed tick to one real system job, one occurrence and one outbox intent",async()=>{
    const now=new Date(),token="disposable-purpose-specific-schedule-token",tenantId="disposable-system-tenant";
    const handler=createSpec260EvidenceRetentionScheduleHandler({authenticate:value=>value===token,systemTenant:()=>tenantId,createJob,now:()=>now});
    const admissions:Array<{jobId:string;created:boolean}>=[];
    // In-process HTTP adapter only. Access is checked by Worker request tests;
    // this fixture proves real gateway/database admission, not live Access.
    const fetcher:typeof fetch=async input=>{
      const request=input as globalThis.Request;
      const req={method:request.method,body:await request.json(),header:(name:string)=>request.headers.get(name)??undefined} as unknown as Request;
      let status=500,payload:unknown;
      const res={status(value:number){status=value;return this;},set(){return this;},json(value:unknown){payload=value;return this;}} as unknown as Response;
      await handler(req,res);
      if(status===202)admissions.push(payload as {jobId:string;created:boolean});
      return new globalThis.Response(JSON.stringify(payload),{status,headers:{"content-type":"application/json"}});
    };
    const env={CLOUDFLARE_ACTIVATION:"enabled",CLOUDFLARE_JOB_TRANSPORT:"workflows",CLOUDFLARE_RETENTION_SCHEDULE:"evidence-retention",
      CLOUDFLARE_RETENTION_TENANT_ID:tenantId,CLOUDFLARE_RETENTION_EXPIRES_AT:new Date(now.getTime()+60_000).toISOString(),
      PLATFORM_EDGE_ORIGIN:"https://origin.private.example",PLATFORM_EDGE_PRIVATE_HOST:"origin.private.example",PLATFORM_EDGE_TOKEN:token,
      AUTH_ORIGIN:"https://origin.private.example",AUTH_ORIGIN_PRIVATE_HOST:"origin.private.example",AUTH_ORIGIN_TOKEN:"disposable-origin-token",
      AUTH_ORIGIN_ACCESS_CLIENT_ID:"disposable-access-id",AUTH_ORIGIN_ACCESS_CLIENT_SECRET:"disposable-access-secret",
      AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS:'["https://staging.example.workers.dev"]'};
    const sweep=createSpec260EvidenceRetentionSweep(fetcher);
    expect(await sweep({scheduledTime:now.getTime(),maxRows:100},env)).toBe("completed");
    expect(await sweep({scheduledTime:now.getTime(),maxRows:100},env)).toBe("completed");
    expect(await sweep({scheduledTime:now.getTime()-600_000,maxRows:100},env)).toBe("completed");
    expect(admissions).toHaveLength(3);expect(new Set(admissions.map(a=>a.jobId)).size).toBe(1);
    expect(admissions.map(a=>a.created)).toEqual([true,false,false]);
    const jobs=await sql`SELECT * FROM worker_jobs WHERE "tenantId"=${tenantId}`;
    expect(jobs).toHaveLength(1);expect(jobs[0]).toMatchObject({jobType:"emergency.evidence.retention",status:"queued",runtimeType:"node_job_worker"});
    expect(await sql`SELECT id FROM worker_job_outbox WHERE "workerJobId"=${jobs[0].id}`).toHaveLength(1);
    expect(await sql`SELECT * FROM worker_job_schedule_occurrences WHERE "workerJobId"=${jobs[0].id}`).toHaveLength(1);
    expect(await sql`SELECT id FROM worker_job_attempts WHERE "workerJobId"=${jobs[0].id}`).toHaveLength(0);
    env.CLOUDFLARE_RETENTION_TENANT_ID="foreign-system-tenant";
    expect(await sweep({scheduledTime:now.getTime(),maxRows:100},env)).toBe("retry");
    expect(await sql`SELECT id FROM worker_jobs`).toHaveLength(1);
  });
});
