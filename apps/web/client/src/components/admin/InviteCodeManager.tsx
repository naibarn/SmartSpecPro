/**
 * InviteCodeManager — Admin UI for managing invite codes
 * CRUD table with create dialog, usage details, and user reactivation
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/** Shape of a single invite code row from the list query */
interface InviteCodeRow {
  id: number;
  code: string;
  label: string | null;
  type: "admin" | "user";
  ownerId: number;
  ownerName: string | null;
  ownerEmail: string | null;
  bonusCreditsForNewUser: number;
  bonusCreditsForOwner: number;
  maxUses: number | null;
  currentUses: number;
  expiresAt: Date | string | null;
  isActive: boolean;
  description: string | null;
  createdAt: Date | string;
}

/** Shape of a single usage detail row */
interface UsageDetailRow {
  id: number;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  userIsDisabled: boolean | null;
  userDisabledReason: string | null;
  creditsGivenToUser: number;
  creditsGivenToOwner: number;
  createdAt: Date | string;
}
import {
  Plus,
  Copy,
  ChevronDown,
  ChevronUp,
  ToggleLeft,
  Users,
  Link2,
  RefreshCw,
  Trash2,
} from "lucide-react";

export default function InviteCodeManager() {
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [expandedCode, setExpandedCode] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "admin" | "user">("all");

  // Queries
  const { data, isLoading } = trpc.inviteCode.list.useQuery({ type: filter });

  // Mutations
  const createMut = trpc.inviteCode.create.useMutation({
    onSuccess: () => {
      toast.success("Invite code created");
      setShowCreate(false);
      utils.inviteCode.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = trpc.inviteCode.update.useMutation({
    onSuccess: () => {
      toast.success("Invite code updated");
      setEditingId(null);
      utils.inviteCode.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = trpc.inviteCode.delete.useMutation({
    onSuccess: () => {
      toast.success("Invite code deactivated");
      utils.inviteCode.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const reactivateUserMut = trpc.inviteCode.reactivateUser.useMutation({
    onSuccess: () => {
      toast.success("User reactivated");
      utils.inviteCode.getUsageDetails.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Create form state
  const [createForm, setCreateForm] = useState({
    code: "",
    label: "",
    bonusCreditsForNewUser: 0,
    maxUses: 0,
    expiresAt: "",
    description: "",
  });

  const handleCreate = () => {
    createMut.mutate({
      code: createForm.code || undefined,
      label: createForm.label || undefined,
      bonusCreditsForNewUser: createForm.bonusCreditsForNewUser,
      maxUses: createForm.maxUses || undefined,
      expiresAt: createForm.expiresAt ? new Date(createForm.expiresAt).toISOString() : undefined,
      description: createForm.description || undefined,
    });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied!");
  };

  const copyLink = (code: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/signup?invite=${code}`);
    toast.success("Invite link copied!");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Admin Invite Codes</h3>
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "admin" | "user")}
            className="text-sm border rounded-lg px-2 py-1"
          >
            <option value="all">All Codes</option>
            <option value="admin">Admin Only</option>
            <option value="user">User Only</option>
          </select>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="w-4 h-4 mr-1" />
            Create Code
          </Button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="p-4 bg-gray-50 rounded-lg border space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Label</label>
              <Input
                value={createForm.label}
                onChange={(e) => setCreateForm((p) => ({ ...p, label: e.target.value }))}
                placeholder='e.g. "โค้ด Facebook"'
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Custom Code <span className="text-gray-400">(optional)</span>
              </label>
              <Input
                value={createForm.code}
                onChange={(e) => setCreateForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="Auto-generated if blank"
                maxLength={32}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bonus Credits for New User</label>
              <Input
                type="number"
                min={0}
                value={createForm.bonusCreditsForNewUser}
                onChange={(e) => setCreateForm((p) => ({ ...p, bonusCreditsForNewUser: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Max Uses <span className="text-gray-400">(0 = unlimited)</span>
              </label>
              <Input
                type="number"
                min={0}
                value={createForm.maxUses}
                onChange={(e) => setCreateForm((p) => ({ ...p, maxUses: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Expires At</label>
              <Input
                type="datetime-local"
                value={createForm.expiresAt}
                onChange={(e) => setCreateForm((p) => ({ ...p, expiresAt: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Input
                value={createForm.description}
                onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Internal notes"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      )}

      {/* Codes table */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : !data?.codes.length ? (
        <div className="text-center py-8 text-gray-500">No invite codes yet</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Label</th>
                <th className="text-left px-4 py-2 font-medium">Code</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Bonus</th>
                <th className="text-left px-4 py-2 font-medium">Uses</th>
                <th className="text-left px-4 py-2 font-medium">Expires</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.codes.map((code) => (
                <CodeRow
                  key={code.id}
                  code={code}
                  expanded={expandedCode === code.id}
                  onToggle={() => setExpandedCode(expandedCode === code.id ? null : code.id)}
                  onCopy={() => copyCode(code.code)}
                  onCopyLink={() => copyLink(code.code)}
                  onToggleActive={() =>
                    updateMut.mutate({ id: code.id, isActive: !code.isActive })
                  }
                  onDeactivate={() => {
                    if (window.confirm(`Deactivate invite code "${code.code}"?`)) {
                      deleteMut.mutate({ id: code.id });
                    }
                  }}
                  onReactivateUser={(userId) => reactivateUserMut.mutate({ userId })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > (data.limit ?? 50) && (
        <div className="text-center text-sm text-gray-500">
          Showing {data.codes.length} of {data.total} codes
        </div>
      )}
    </div>
  );
}

function CodeRow({
  code,
  expanded,
  onToggle,
  onCopy,
  onCopyLink,
  onToggleActive,
  onDeactivate,
  onReactivateUser,
}: {
  code: InviteCodeRow;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onCopyLink: () => void;
  onToggleActive: () => void;
  onDeactivate: () => void;
  onReactivateUser: (userId: number) => void;
}) {
  const { data: usageDetails } = trpc.inviteCode.getUsageDetails.useQuery(
    { codeId: code.id },
    { enabled: expanded },
  );

  const isExpired = code.expiresAt && new Date(code.expiresAt) < new Date();
  const isExhausted = code.maxUses !== null && code.currentUses >= code.maxUses;

  return (
    <>
      <tr className={code.isActive ? "" : "opacity-60"}>
        <td className="px-4 py-3">{code.label || "-"}</td>
        <td className="px-4 py-3">
          <code className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono">
            {code.code}
          </code>
        </td>
        <td className="px-4 py-3">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              code.type === "admin"
                ? "bg-purple-100 text-purple-700"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {code.type}
          </span>
        </td>
        <td className="px-4 py-3">{code.bonusCreditsForNewUser}</td>
        <td className="px-4 py-3">
          {code.currentUses}
          {code.maxUses !== null ? `/${code.maxUses}` : ""}
        </td>
        <td className="px-4 py-3 text-xs">
          {code.expiresAt
            ? new Date(code.expiresAt).toLocaleDateString()
            : "Never"}
        </td>
        <td className="px-4 py-3">
          {!code.isActive ? (
            <span className="text-xs text-red-600">Inactive</span>
          ) : isExpired ? (
            <span className="text-xs text-amber-600">Expired</span>
          ) : isExhausted ? (
            <span className="text-xs text-amber-600">Exhausted</span>
          ) : (
            <span className="text-xs text-green-600">Active</span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-1 justify-end">
            <button
              onClick={onCopy}
              className="p-1 hover:bg-gray-100 rounded"
              title="Copy code"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={onCopyLink}
              className="p-1 hover:bg-gray-100 rounded"
              title="Copy invite link"
            >
              <Link2 className="w-4 h-4" />
            </button>
            {!code.isActive && (
              <button
                onClick={onToggleActive}
                className="p-1 hover:bg-gray-100 rounded"
                title="Activate invite code"
                aria-label="Activate invite code"
              >
                <ToggleLeft className="w-4 h-4 text-gray-400" />
              </button>
            )}
            {code.isActive && (
              <button
                onClick={onDeactivate}
                className="p-1 hover:bg-red-50 rounded text-red-600"
                title="Deactivate invite code"
                aria-label="Deactivate invite code"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onToggle}
              className="p-1 hover:bg-gray-100 rounded"
              title="View usage"
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="px-4 py-3 bg-gray-50">
            <div className="text-sm">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4" />
                <span className="font-medium">Registered Users ({usageDetails?.length ?? 0})</span>
              </div>
              {!usageDetails?.length ? (
                <p className="text-gray-500 text-xs">No registrations yet</p>
              ) : (
                <div className="space-y-1">
                  {usageDetails.map((u: UsageDetailRow) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between text-xs bg-white p-2 rounded border"
                    >
                      <div>
                        <span className="font-medium">{u.userName || "Unknown"}</span>
                        <span className="text-gray-400 ml-2">{u.userEmail}</span>
                        {u.creditsGivenToUser > 0 && (
                          <span className="ml-2 text-green-600">+{u.creditsGivenToUser} credits</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {u.userIsDisabled && (
                          <>
                            <span className="text-red-500">
                              Disabled{u.userDisabledReason ? ` (${u.userDisabledReason})` : ""}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs"
                              onClick={() => onReactivateUser(u.userId)}
                            >
                              <RefreshCw className="w-3 h-3 mr-1" />
                              Reactivate
                            </Button>
                          </>
                        )}
                        <span className="text-gray-400">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
