// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloudflareTenantIsolation } from "./CloudflareTenantIsolation";
const state=vi.hoisted(()=>({prepared:false,ready:true,mutate:vi.fn(),refetch:vi.fn(),error:null as any}));
vi.mock("react-i18next",()=>({useTranslation:()=>({i18n:{language:"en"}})}));
vi.mock("@/lib/trpc",()=>({trpc:{infrastructure:{
  getCloudflareProductionTenantIsolationPreflight:{useQuery:()=>({data:state.ready?{ready:true,prepared:state.prepared,actionDigest:"a".repeat(64),
    plan:{role:"sah_cf_prod_0123456789ab",createInactiveTestTenant:true}}:{ready:false,reason:"M1_ISOLATION_OWNER_REQUIRED"},refetch:state.refetch})},
  prepareCloudflareProductionTenantIsolation:{useMutation:()=>({mutateAsync:state.mutate,isPending:false,error:state.error})},
}}}));
beforeEach(()=>{state.ready=true;state.prepared=false;state.error=null;state.mutate.mockReset().mockResolvedValue(null);});
const scope={tenantId:"tenant-a",projectId:"project-a",jobId:"11111111-1111-4111-8111-111111111111"};
describe("bounded M1 Owner action",()=>{
  it("discloses RLS and fixture scope before dispatching one exact digest",async()=>{
    render(<CloudflareTenantIsolation {...scope}/>);
    expect(screen.getByText(/Create six synthetic rows/)).toBeInTheDocument();
    expect(screen.getByText(/One inactive test tenant/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    expect(state.mutate).toHaveBeenCalledWith({...scope,actionDigest:"a".repeat(64)});
  });
  it("reconciles already-prepared fixtures without offering another mutation",()=>{
    state.prepared=true;render(<CloudflareTenantIsolation {...scope}/>);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText(/Ready for the independent Cloudflare SQL/)).toBeInTheDocument();
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("shows the exact failed prerequisite instead of enabling an unverified scope",()=>{
    state.ready=false;render(<CloudflareTenantIsolation {...scope}/>);
    expect(screen.getByText("M1_ISOLATION_OWNER_REQUIRED")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
