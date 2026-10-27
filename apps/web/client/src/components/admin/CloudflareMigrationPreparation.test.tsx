// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloudflareMigrationPreparation } from "./CloudflareMigrationPreparation";
const state=vi.hoisted(()=>({databaseReady:true,prepared:false,imageReady:true,imageAccepted:false,imagesPublished:false,prepare:vi.fn(),publish:vi.fn(),refetch:vi.fn()}));
vi.mock("react-i18next",()=>({useTranslation:()=>({i18n:{language:"en"}})}));
vi.mock("./CloudflareTenantIsolation",()=>({CloudflareTenantIsolation:()=>null}));
vi.mock("./CloudflareImagePublication",()=>({CloudflareImagePublication:()=>null}));
vi.mock("./CloudflareNativeCandidatePreparation",()=>({CloudflareNativeCandidatePreparation:()=>null}));
vi.mock("@/lib/trpc",()=>({trpc:{infrastructure:{
  getCloudflareProductionTenantIsolationPreflight:{useQuery:()=>({data:{ready:state.databaseReady,prepared:state.prepared,actionDigest:"a".repeat(64)},refetch:state.refetch})},
  getCloudflareHttpImagePairPreflight:{useQuery:()=>({data:{ready:state.imageReady,planDigest:"b".repeat(64)}})},
  getCloudflareHttpImagePairSubmission:{useQuery:()=>({data:{jobs:state.imagesPublished?[{status:"succeeded"},{status:"succeeded"}]:state.imageAccepted?[{status:"queued"},{status:"running"}]:[]},refetch:state.refetch})},
  prepareCloudflareProductionTenantIsolation:{useMutation:()=>({mutateAsync:state.prepare})},
  queueCloudflareHttpImagePair:{useMutation:()=>({mutateAsync:state.publish})},
}}}));
const scope={tenantId:"tenant-a",projectId:"project-a",jobId:"11111111-1111-4111-8111-111111111111"};
beforeEach(()=>{sessionStorage.clear();state.databaseReady=true;state.prepared=false;state.imageReady=true;state.imageAccepted=false;state.imagesPublished=false;
  state.prepare.mockReset().mockResolvedValue(null);state.publish.mockReset().mockResolvedValue(null);});
describe("one Owner action for independently ready migration preparation",()=>{
  it("dispatches both existing exact-scope operations from one confirmation",async()=>{
    render(<CloudflareMigrationPreparation {...scope}/>);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button"));
    expect(state.prepare).toHaveBeenCalledWith({...scope,actionDigest:"a".repeat(64)});
    expect(state.publish).toHaveBeenCalledWith({tenantId:scope.tenantId,projectId:scope.projectId,submissionId:expect.any(String),planDigest:"b".repeat(64)});
  });
  it("continues image publication when the independent database operation fails",async()=>{
    state.prepare.mockRejectedValueOnce(Error("fixture denied"));render(<CloudflareMigrationPreparation {...scope}/>);
    await userEvent.click(screen.getByRole("button"));
    expect(state.prepare).toHaveBeenCalledTimes(1);expect(state.publish).toHaveBeenCalledTimes(1);
  });
  it("does not repeat accepted work and blocks an unverified database scope",async()=>{
    state.databaseReady=false;state.imageAccepted=true;render(<CloudflareMigrationPreparation {...scope}/>);
    expect(screen.getByRole("button")).toBeDisabled();expect(state.prepare).not.toHaveBeenCalled();expect(state.publish).not.toHaveBeenCalled();
  });
  it("keeps the publication Submission ID across a response loss and reload",async()=>{
    state.prepared=true;state.publish.mockRejectedValueOnce(Error("lost response"));
    const view=render(<CloudflareMigrationPreparation {...scope}/>);await userEvent.click(screen.getByRole("button"));
    const request=state.publish.mock.calls[0][0];view.unmount();
    render(<CloudflareMigrationPreparation {...scope}/>);await userEvent.click(screen.getByRole("button"));
    expect(state.publish.mock.calls[1][0]).toEqual(request);expect(state.prepare).not.toHaveBeenCalled();
  });
  it("never repeats database preparation after canonical M1 acceptance",async()=>{
    render(<CloudflareMigrationPreparation {...scope} databaseAccepted/>);
    expect(screen.getByText(/M1_ACCEPTED/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    expect(state.prepare).not.toHaveBeenCalled();expect(state.publish).toHaveBeenCalledTimes(1);
  });
  it("collapses completed M1 and image publication and removes the obsolete combined action",()=>{
    state.prepared=true;state.imageAccepted=true;state.imagesPublished=true;
    render(<CloudflareMigrationPreparation {...scope} databaseAccepted/>);
    expect(screen.getByRole("heading",{name:"Preparation complete · candidate acceptance is next"})).toBeInTheDocument();
    expect(screen.getByText("M1 accepted · database and tenant isolation").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Node/Python image pair published · VERIFIED").closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByRole("button",{name:"Confirm remaining preparation"})).not.toBeInTheDocument();
  });
});
