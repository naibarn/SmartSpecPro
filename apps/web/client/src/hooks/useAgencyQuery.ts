import { trpc } from "@/lib/trpc";

export function useAgencyList() {
  return trpc.agency.list.useQuery({});
}

export function useAgencyById(agencyId: string | undefined) {
  return trpc.agency.getById.useQuery(
    { id: agencyId! },
    { enabled: !!agencyId },
  );
}

export function useAgencyConversations(agencyId: string | undefined) {
  return trpc.agency.listConversations.useQuery(
    { agencyId: agencyId! },
    { enabled: !!agencyId },
  );
}

export function useCreateAgency() {
  const utils = trpc.useUtils();
  return trpc.agency.create.useMutation({
    onSuccess: () => {
      utils.agency.list.invalidate();
    },
  });
}

export function useSendAgencyMessage() {
  return trpc.agency.sendMessage.useMutation();
}
