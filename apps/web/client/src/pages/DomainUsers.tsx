/**
 * Domain Users Management Page
 * Allows domain admins to view and manage users in their domain
 * Features: list users, toggle status, transfer credits
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@smartspec/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Users,
  Search,
  CreditCard,
  Send,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  User,
  Shield,
  Calendar,
  Clock,
  Ban,
  CheckCircle,
  ArrowLeft,
  X,
} from "lucide-react";

interface DomainUser {
  id: number;
  name: string | null;
  email: string | null;
  role: "user" | "admin" | "domain_admin";
  credits: number;
  plan: "free" | "starter" | "pro" | "enterprise";
  isDisabled: boolean;
  createdAt: Date;
  lastSignedIn: Date;
}

export default function DomainUsers() {
  const { user, isLoading: authLoading, refreshUser } = useAuth();
  const [, setLocation] = useLocation();

  // State
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedUser, setSelectedUser] = useState<DomainUser | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote] = useState("");

  const limit = 20;

  // Queries
  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = trpc.users.listByDomain.useQuery(
    { search: search || undefined, limit, offset: page * limit },
    { enabled: !!user && (user.role === "domain_admin" || user.role === "admin") }
  );

  const { data: stats, refetch: refetchStats } = trpc.users.domainStats.useQuery(
    undefined,
    { enabled: !!user && (user.role === "domain_admin" || user.role === "admin") }
  );

  // Mutations
  const toggleStatusMutation = trpc.users.toggleUserStatus.useMutation({
    onSuccess: (data) => {
      toast.success(`User ${data.newStatus ? 'disabled' : 'enabled'} successfully`);
      refetchUsers();
      refetchStats();
    },
    onError: (err) => {
      toast.error(`Failed to update user status: ${err.message}`);
    },
  });

  const transferCreditsMutation = trpc.users.transferCredits.useMutation({
    onSuccess: (data) => {
      toast.success(`Transferred ${transferAmount} credits successfully. Your new balance: ${data.senderNewBalance}`);
      setShowTransferModal(false);
      setTransferAmount("");
      setTransferNote("");
      setSelectedUser(null);
      refetchUsers();
      refetchStats();
      refreshUser(); // Refresh current user's balance
    },
    onError: (err) => {
      toast.error(`Failed to transfer credits: ${err.message}`);
    },
  });

  // Redirect if not domain admin
  useEffect(() => {
    if (!authLoading && (!user || (user.role !== "domain_admin" && user.role !== "admin"))) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user || (user.role !== "domain_admin" && user.role !== "admin")) {
    return null;
  }

  const users = usersData?.users || [];
  const total = usersData?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const handleToggleStatus = (userId: number) => {
    if (confirm("Are you sure you want to toggle this user's status?")) {
      toggleStatusMutation.mutate({ userId });
    }
  };

  const handleTransfer = () => {
    if (!selectedUser || !transferAmount) return;

    const amount = parseInt(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (amount > (user?.credits || 0)) {
      toast.error("Insufficient credits for transfer");
      return;
    }

    transferCreditsMutation.mutate({
      toUserId: selectedUser.id,
      amount,
      note: transferNote || undefined,
    });
  };

  const openTransferModal = (targetUser: DomainUser) => {
    setSelectedUser(targetUser);
    setShowTransferModal(true);
  };


  const getRoleBadge = (role: string) => {
    const colors = {
      user: "bg-gray-100 text-gray-700",
      domain_admin: "bg-blue-100 text-blue-700",
      admin: "bg-purple-100 text-purple-700",
    };
    return colors[role as keyof typeof colors] || colors.user;
  };

  const getPlanBadge = (plan: string) => {
    const colors = {
      free: "bg-gray-100 text-gray-600",
      starter: "bg-green-100 text-green-700",
      pro: "bg-blue-100 text-blue-700",
      enterprise: "bg-purple-100 text-purple-700",
    };
    return colors[plan as keyof typeof colors] || colors.free;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/dashboard")}
              className="rounded-full"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Domain Users</h1>
              <p className="text-sm text-gray-500">
                Manage users in your domain
                {stats?.domain && ` (${stats.domain})`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-gray-500">Your Credits</p>
              <p className="text-lg font-semibold text-purple-600">
                {user?.credits?.toLocaleString() || 0}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchUsers();
                refetchStats();
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Users</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats?.totalUsers || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Active Users</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats?.activeUsers || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <Ban className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Disabled Users</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats?.disabledUsers || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Credits</p>
                <p className="text-2xl font-bold text-gray-900">
                  {(stats?.totalCredits || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Search users by name or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="pl-10"
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {usersLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto" />
              <p className="text-gray-500 mt-4">Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No users found in your domain</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Credits
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plan
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Active
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                              <User className="w-5 h-5 text-purple-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {u.name || "No Name"}
                              </p>
                              <p className="text-sm text-gray-500">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadge(
                              u.role
                            )}`}
                          >
                            {u.role === "domain_admin" ? "Domain Admin" : u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-medium text-gray-900">
                            {u.credits.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getPlanBadge(
                              u.plan
                            )}`}
                          >
                            {u.plan}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {u.isDisabled ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              <Ban className="w-3 h-3 mr-1" />
                              Disabled
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {formatDate(u.lastSignedIn)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Don't show actions for self or other domain admins */}
                            {u.id !== Number(user?.id) && u.role !== "domain_admin" && u.role !== "admin" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openTransferModal(u as DomainUser)}
                                  title="Transfer Credits"
                                >
                                  <Send className="w-4 h-4 mr-1" />
                                  Transfer
                                </Button>
                                <Button
                                  variant={u.isDisabled ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => handleToggleStatus(u.id)}
                                  className={u.isDisabled ? "bg-green-600 hover:bg-green-700" : "text-red-600 border-red-200 hover:bg-red-50"}
                                >
                                  {u.isDisabled ? (
                                    <>
                                      <CheckCircle className="w-4 h-4 mr-1" />
                                      Enable
                                    </>
                                  ) : (
                                    <>
                                      <Ban className="w-4 h-4 mr-1" />
                                      Disable
                                    </>
                                  )}
                                </Button>
                              </>
                            )}
                            {u.id === Number(user?.id) && (
                              <span className="text-sm text-gray-400 italic">You</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                  <p className="text-sm text-gray-500">
                    Showing {page * limit + 1} to{" "}
                    {Math.min((page + 1) * limit, total)} of {total} users
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-gray-600">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Transfer Credits Modal */}
      {showTransferModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Transfer Credits</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowTransferModal(false);
                  setSelectedUser(null);
                  setTransferAmount("");
                  setTransferNote("");
                }}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-1">Transfer to</p>
                <p className="font-medium text-gray-900">
                  {selectedUser.name || selectedUser.email || "User"}
                </p>
                <p className="text-sm text-gray-500">{selectedUser.email}</p>
                <p className="text-sm text-gray-500 mt-2">
                  Current balance: <span className="font-medium">{selectedUser.credits.toLocaleString()}</span>
                </p>
              </div>

              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-sm text-purple-600 mb-1">Your balance</p>
                <p className="text-xl font-bold text-purple-700">
                  {(user?.credits || 0).toLocaleString()} credits
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount to Transfer
                </label>
                <Input
                  type="number"
                  min="1"
                  max={user?.credits || 0}
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="Enter amount"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Note (optional)
                </label>
                <Input
                  type="text"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  placeholder="Reason for transfer"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowTransferModal(false);
                    setSelectedUser(null);
                    setTransferAmount("");
                    setTransferNote("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  onClick={handleTransfer}
                  disabled={
                    !transferAmount ||
                    parseInt(transferAmount) <= 0 ||
                    parseInt(transferAmount) > (user?.credits || 0) ||
                    transferCreditsMutation.isPending
                  }
                >
                  {transferCreditsMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Transferring...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Transfer
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
