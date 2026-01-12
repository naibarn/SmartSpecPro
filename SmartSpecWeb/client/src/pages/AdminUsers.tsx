/**
 * Admin Users Management Page
 * Allows admins to view and manage users, credits, and transactions
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Users,
  Search,
  CreditCard,
  Plus,
  Minus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  User,
  Shield,
  Calendar,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface UserData {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: "user" | "admin";
  credits: number;
  plan: "free" | "starter" | "pro" | "enterprise";
  loginMethod: string | null;
  createdAt: Date;
  lastSignedIn: Date;
}

interface Transaction {
  id: number;
  amount: number;
  type: string;
  description: string | null;
  balanceAfter: number;
  referenceId: string | null;
  createdAt: Date;
  metadata: any;
}

export default function AdminUsers() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  
  // State
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditType, setCreditType] = useState<"bonus" | "refund" | "adjustment">("bonus");
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditAction, setCreditAction] = useState<"add" | "deduct">("add");

  const limit = 20;

  // Queries
  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = trpc.users.list.useQuery(
    { search: search || undefined, limit, offset: page * limit },
    { enabled: !!user && user.role === "admin" }
  );

  const { data: stats, refetch: refetchStats } = trpc.users.stats.useQuery(
    undefined,
    { enabled: !!user && user.role === "admin" }
  );

  const { data: selectedUserData, refetch: refetchSelectedUser } = trpc.users.get.useQuery(
    { id: selectedUser?.id || 0 },
    { enabled: !!selectedUser }
  );

  // Mutations
  const addCreditsMutation = trpc.users.addCredits.useMutation({
    onSuccess: (data) => {
      toast.success(`Added ${creditAmount} credits. New balance: ${data.newBalance}`);
      setShowCreditModal(false);
      setCreditAmount("");
      setCreditReason("");
      refetchUsers();
      refetchSelectedUser();
      refetchStats();
    },
    onError: (err) => {
      toast.error(`Failed to add credits: ${err.message}`);
    },
  });

  const deductCreditsMutation = trpc.users.deductCredits.useMutation({
    onSuccess: (data) => {
      toast.success(`Deducted ${creditAmount} credits. New balance: ${data.newBalance}`);
      setShowCreditModal(false);
      setCreditAmount("");
      setCreditReason("");
      refetchUsers();
      refetchSelectedUser();
      refetchStats();
    },
    onError: (err) => {
      toast.error(`Failed to deduct credits: ${err.message}`);
    },
  });

  const updateUserMutation = trpc.users.update.useMutation({
    onSuccess: () => {
      toast.success("User updated successfully");
      refetchUsers();
      refetchSelectedUser();
    },
    onError: (err) => {
      toast.error(`Failed to update user: ${err.message}`);
    },
  });

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  if (authLoading || !user || user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  const handleCreditSubmit = () => {
    if (!selectedUser || !creditAmount || !creditReason) {
      toast.error("Please fill in all fields");
      return;
    }

    const amount = parseInt(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (creditAction === "add") {
      addCreditsMutation.mutate({
        userId: selectedUser.id,
        amount,
        type: creditType,
        description: creditReason,
      });
    } else {
      deductCreditsMutation.mutate({
        userId: selectedUser.id,
        amount,
        description: creditReason,
      });
    }
  };

  const openCreditModal = (user: UserData, action: "add" | "deduct") => {
    setSelectedUser(user);
    setCreditAction(action);
    setShowCreditModal(true);
  };

  const totalPages = Math.ceil((usersData?.total || 0) / limit);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Shield className="w-8 h-8 text-purple-500" />
            Admin: User Management
          </h1>
          <p className="text-gray-600 mt-2">Manage users, credits, and view transaction history</p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Users className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Users</p>
                  <p className="text-2xl font-bold">{stats.totalUsers}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <CreditCard className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Credits</p>
                  <p className="text-2xl font-bold">{stats.totalCredits.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Clock className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Active Today</p>
                  <p className="text-2xl font-bold">{stats.activity.today}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <Shield className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Admins</p>
                  <p className="text-2xl font-bold">{stats.totalAdmins}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Users List */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border">
            <div className="p-4 border-b">
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search by name or email..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                    className="pl-10"
                  />
                </div>
                <Button variant="outline" onClick={() => refetchUsers()}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {usersLoading ? (
              <div className="p-8 text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-purple-500 mx-auto" />
              </div>
            ) : (
              <>
                <div className="divide-y">
                  {usersData?.users.map((u) => (
                    <div
                      key={u.id}
                      className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                        selectedUser?.id === u.id ? "bg-purple-50" : ""
                      }`}
                      onClick={() => setSelectedUser(u as UserData)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-medium">
                            {(u.name || u.email || "U")[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {u.name || "No name"}
                              {u.role === "admin" && (
                                <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                                  Admin
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-gray-500">{u.email || u.openId}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">{u.credits.toLocaleString()} credits</p>
                          <p className="text-xs text-gray-500 capitalize">{u.plan} plan</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                <div className="p-4 border-t flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    Showing {page * limit + 1} - {Math.min((page + 1) * limit, usersData?.total || 0)} of{" "}
                    {usersData?.total || 0}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-gray-600">
                      Page {page + 1} of {totalPages || 1}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* User Details */}
          <div className="bg-white rounded-xl shadow-sm border">
            {selectedUser && selectedUserData ? (
              <>
                <div className="p-4 border-b">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-xl font-medium">
                      {(selectedUserData.user.name || selectedUserData.user.email || "U")[0].toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {selectedUserData.user.name || "No name"}
                      </h3>
                      <p className="text-sm text-gray-500">{selectedUserData.user.email}</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {/* Credits */}
                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg p-4 text-white">
                    <p className="text-sm opacity-80">Credit Balance</p>
                    <p className="text-3xl font-bold">{selectedUserData.user.credits.toLocaleString()}</p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-white/20 hover:bg-white/30 text-white"
                        onClick={() => openCreditModal(selectedUserData.user as UserData, "add")}
                      >
                        <Plus className="w-4 h-4 mr-1" /> Add
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-white/20 hover:bg-white/30 text-white"
                        onClick={() => openCreditModal(selectedUserData.user as UserData, "deduct")}
                      >
                        <Minus className="w-4 h-4 mr-1" /> Deduct
                      </Button>
                    </div>
                  </div>

                  {/* User Info */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Role</span>
                      <span className="font-medium capitalize">{selectedUserData.user.role}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Plan</span>
                      <span className="font-medium capitalize">{selectedUserData.user.plan}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Login Method</span>
                      <span className="font-medium">{selectedUserData.user.loginMethod || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Joined</span>
                      <span className="font-medium">
                        {new Date(selectedUserData.user.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Last Active</span>
                      <span className="font-medium">
                        {new Date(selectedUserData.user.lastSignedIn).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Recent Transactions */}
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Recent Transactions</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedUserData.recentTransactions.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">No transactions yet</p>
                      ) : (
                        selectedUserData.recentTransactions.map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              {t.amount > 0 ? (
                                <ArrowUpRight className="w-4 h-4 text-green-500" />
                              ) : (
                                <ArrowDownRight className="w-4 h-4 text-red-500" />
                              )}
                              <div>
                                <p className="text-sm font-medium capitalize">{t.type}</p>
                                <p className="text-xs text-gray-500">
                                  {t.description?.slice(0, 30)}
                                  {(t.description?.length || 0) > 30 ? "..." : ""}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p
                                className={`text-sm font-medium ${
                                  t.amount > 0 ? "text-green-600" : "text-red-600"
                                }`}
                              >
                                {t.amount > 0 ? "+" : ""}
                                {t.amount}
                              </p>
                              <p className="text-xs text-gray-500">
                                {new Date(t.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-gray-500">
                <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Select a user to view details</p>
              </div>
            )}
          </div>
        </div>

        {/* Credit Modal */}
        {showCreditModal && selectedUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-semibold mb-4">
                {creditAction === "add" ? "Add Credits" : "Deduct Credits"}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                {creditAction === "add" ? "Adding credits to" : "Deducting credits from"}{" "}
                <strong>{selectedUser.name || selectedUser.email}</strong>
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <Input
                    type="number"
                    placeholder="Enter amount"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                    min="1"
                  />
                </div>

                {creditAction === "add" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select
                      className="w-full border rounded-lg p-2"
                      value={creditType}
                      onChange={(e) => setCreditType(e.target.value as any)}
                    >
                      <option value="bonus">Bonus</option>
                      <option value="refund">Refund</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <Input
                    placeholder="Enter reason for this adjustment"
                    value={creditReason}
                    onChange={(e) => setCreditReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowCreditModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className={`flex-1 ${
                    creditAction === "add"
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
                  onClick={handleCreditSubmit}
                  disabled={addCreditsMutation.isPending || deductCreditsMutation.isPending}
                >
                  {addCreditsMutation.isPending || deductCreditsMutation.isPending
                    ? "Processing..."
                    : creditAction === "add"
                    ? "Add Credits"
                    : "Deduct Credits"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
