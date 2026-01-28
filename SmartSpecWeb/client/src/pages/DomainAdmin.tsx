/**
 * Domain Admin Dashboard
 * For domain admins to manage users in their domain
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
  RefreshCw,
  ChevronLeft,
  User,
  Shield,
  Ban,
  CheckCircle,
  UserCog,
  Globe,
  Palette,
  FileText,
} from "lucide-react";

interface UserData {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: "user" | "admin" | "domain_admin";
  credits: number;
  plan: "free" | "starter" | "pro" | "enterprise";
  loginMethod: string | null;
  registeredDomain: string | null;
  isDisabled: boolean;
  createdAt: Date;
  lastSignedIn: Date;
}

export default function DomainAdmin() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  // State
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);

  const limit = 20;

  // Queries - filter by current user's domain
  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = trpc.users.list.useQuery(
    {
      search: search || undefined,
      registeredDomain: user?.registeredDomain || undefined,
      limit,
      offset: page * limit
    },
    { enabled: !!user && (user.role === "domain_admin" || user.role === "admin") }
  );

  const { data: stats, refetch: refetchStats } = trpc.users.domainStats.useQuery(
    undefined,
    { enabled: !!user && (user.role === "domain_admin" || user.role === "admin") }
  );

  // Mutations
  const toggleStatusMutation = trpc.users.toggleUserStatus.useMutation({
    onSuccess: (data) => {
      toast.success(data.newStatus ? "User enabled" : "User disabled");
      refetchUsers();
      refetchStats();
    },
    onError: (err) => {
      toast.error(`Failed to toggle status: ${err.message}`);
    },
  });

  // Redirect if not domain admin or admin
  useEffect(() => {
    if (!authLoading && (!user || (user.role !== "domain_admin" && user.role !== "admin"))) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  if (authLoading || !user || (user.role !== "domain_admin" && user.role !== "admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  const totalPages = Math.ceil((usersData?.total || 0) / limit);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/dashboard')}
            className="text-gray-600 mb-4"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back to Dashboard
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <UserCog className="w-8 h-8 text-purple-500" />
                Domain Admin: User Management
              </h1>
              <p className="text-gray-600 mt-2">
                Manage users in domain: <span className="font-semibold">{user.registeredDomain || 'All domains'}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setLocation('/domain-admin/users')}
              >
                <Users className="w-4 h-4 mr-2" />
                Manage Users
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation('/domain-admin/content')}
              >
                <Globe className="w-4 h-4 mr-2" />
                Edit Content
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation('/domain-admin/theme')}
              >
                <Palette className="w-4 h-4 mr-2" />
                Edit Theme
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation('/domain-admin/invoice')}
              >
                <FileText className="w-4 h-4 mr-2" />
                Invoice Settings
              </Button>
            </div>
          </div>
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
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Active Users</p>
                  <p className="text-2xl font-bold">{stats.activeUsers}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-100 rounded-lg">
                  <Ban className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Disabled Users</p>
                  <p className="text-2xl font-bold">{stats.disabledUsers}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Globe className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Domain</p>
                  <p className="text-xl font-bold truncate">{stats.domain || 'All'}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Users List */}
        <div className="bg-white rounded-xl shadow-sm border">
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
                    className={`p-4 hover:bg-gray-50 transition-colors ${
                      u.isDisabled ? "bg-red-50/50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${
                          u.isDisabled ? "from-gray-400 to-gray-600" : "from-purple-400 to-pink-400"
                        } flex items-center justify-center text-white font-medium`}>
                          {(u.name || u.email || "U")[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 flex items-center gap-2">
                            {u.name || "No name"}
                            {u.role === "admin" && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                Admin
                              </span>
                            )}
                            {u.role === "domain_admin" && (
                              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                                Domain Admin
                              </span>
                            )}
                            {u.isDisabled && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Ban className="w-3 h-3" />
                                Disabled
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-gray-500">{u.email || u.openId}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">{u.credits.toLocaleString()} credits</p>
                          <p className="text-xs text-gray-500 capitalize">{u.plan} plan</p>
                        </div>
                        {/* Only show toggle for regular users, not admins */}
                        {u.role === "user" && (
                          <Button
                            size="sm"
                            variant={u.isDisabled ? "default" : "destructive"}
                            onClick={() => toggleStatusMutation.mutate({ userId: u.id })}
                            disabled={toggleStatusMutation.isPending}
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
                        )}
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
                    <ChevronLeft className="w-4 h-4 rotate-180" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
