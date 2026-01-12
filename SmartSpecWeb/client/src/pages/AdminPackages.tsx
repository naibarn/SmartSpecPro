/**
 * Admin Packages Management Page
 * Allows admins to manage credit packages and pricing
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Edit,
  Trash2,
  Copy,
  Star,
  StarOff,
  Eye,
  EyeOff,
  RefreshCw,
  DollarSign,
  CreditCard,
  TrendingUp,
  GripVertical,
  X,
  Check,
  AlertTriangle,
} from "lucide-react";

interface PackageData {
  id: number;
  name: string;
  description: string | null;
  credits: number;
  priceUsd: number;
  stripePriceId: string | null;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  pricePerCredit: number;
}

interface PackageFormData {
  name: string;
  description: string;
  credits: string;
  priceUsd: string;
  stripePriceId: string;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: string;
}

const defaultFormData: PackageFormData = {
  name: "",
  description: "",
  credits: "",
  priceUsd: "",
  stripePriceId: "",
  isActive: true,
  isFeatured: false,
  sortOrder: "0",
};

export default function AdminPackages() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  // State
  const [showModal, setShowModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<PackageData | null>(null);
  const [formData, setFormData] = useState<PackageFormData>(defaultFormData);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Queries
  const { data: packages, isLoading, refetch } = trpc.packages.adminList.useQuery(
    undefined,
    { enabled: !!user && user.role === "admin" }
  );

  const { data: stats, refetch: refetchStats } = trpc.packages.stats.useQuery(
    undefined,
    { enabled: !!user && user.role === "admin" }
  );

  // Mutations
  const createMutation = trpc.packages.create.useMutation({
    onSuccess: () => {
      toast.success("Package created successfully");
      setShowModal(false);
      resetForm();
      refetch();
      refetchStats();
    },
    onError: (err) => {
      toast.error(`Failed to create package: ${err.message}`);
    },
  });

  const updateMutation = trpc.packages.update.useMutation({
    onSuccess: () => {
      toast.success("Package updated successfully");
      setShowModal(false);
      resetForm();
      refetch();
      refetchStats();
    },
    onError: (err) => {
      toast.error(`Failed to update package: ${err.message}`);
    },
  });

  const deleteMutation = trpc.packages.delete.useMutation({
    onSuccess: () => {
      toast.success("Package deleted successfully");
      setDeleteConfirm(null);
      refetch();
      refetchStats();
    },
    onError: (err) => {
      toast.error(`Failed to delete package: ${err.message}`);
    },
  });

  const toggleActiveMutation = trpc.packages.toggleActive.useMutation({
    onSuccess: (data) => {
      toast.success(`Package ${data.isActive ? "activated" : "deactivated"}`);
      refetch();
      refetchStats();
    },
    onError: (err) => {
      toast.error(`Failed to toggle status: ${err.message}`);
    },
  });

  const toggleFeaturedMutation = trpc.packages.toggleFeatured.useMutation({
    onSuccess: (data) => {
      toast.success(`Package ${data.isFeatured ? "featured" : "unfeatured"}`);
      refetch();
    },
    onError: (err) => {
      toast.error(`Failed to toggle featured: ${err.message}`);
    },
  });

  const duplicateMutation = trpc.packages.duplicate.useMutation({
    onSuccess: () => {
      toast.success("Package duplicated successfully");
      refetch();
      refetchStats();
    },
    onError: (err) => {
      toast.error(`Failed to duplicate package: ${err.message}`);
    },
  });

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  const resetForm = () => {
    setFormData(defaultFormData);
    setEditingPackage(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (pkg: PackageData) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      description: pkg.description || "",
      credits: pkg.credits.toString(),
      priceUsd: pkg.priceUsd.toString(),
      stripePriceId: pkg.stripePriceId || "",
      isActive: pkg.isActive,
      isFeatured: pkg.isFeatured,
      sortOrder: pkg.sortOrder.toString(),
    });
    setShowModal(true);
  };

  const handleSubmit = () => {
    const credits = parseInt(formData.credits);
    const priceUsd = parseFloat(formData.priceUsd);
    const sortOrder = parseInt(formData.sortOrder) || 0;

    if (!formData.name.trim()) {
      toast.error("Please enter a package name");
      return;
    }
    if (isNaN(credits) || credits <= 0) {
      toast.error("Please enter a valid number of credits");
      return;
    }
    if (isNaN(priceUsd) || priceUsd < 0) {
      toast.error("Please enter a valid price");
      return;
    }

    const data = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      credits,
      priceUsd,
      stripePriceId: formData.stripePriceId.trim() || undefined,
      isActive: formData.isActive,
      isFeatured: formData.isFeatured,
      sortOrder,
    };

    if (editingPackage) {
      updateMutation.mutate({ id: editingPackage.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  if (authLoading || !user || user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  const pricePerCredit = formData.credits && formData.priceUsd
    ? (parseFloat(formData.priceUsd) / parseInt(formData.credits)).toFixed(4)
    : "0";

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Package className="w-8 h-8 text-purple-500" />
              Admin: Credit Packages
            </h1>
            <p className="text-gray-600 mt-2">Manage credit packages and pricing</p>
          </div>
          <Button onClick={openCreateModal} className="bg-purple-600 hover:bg-purple-700">
            <Plus className="w-4 h-4 mr-2" />
            New Package
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Package className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Packages</p>
                  <p className="text-2xl font-bold">{stats.totalPackages}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Eye className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Active</p>
                  <p className="text-2xl font-bold">{stats.activePackages}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-yellow-100 rounded-lg">
                  <Star className="w-6 h-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Featured</p>
                  <p className="text-2xl font-bold">{stats.featuredPackages}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <DollarSign className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Price Range</p>
                  <p className="text-2xl font-bold">
                    ${stats.priceRange.min} - ${stats.priceRange.max}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Packages Table */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">All Packages</h2>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-purple-500 mx-auto" />
            </div>
          ) : packages && packages.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Package
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Credits
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Price
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Per Credit
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {packages.map((pkg) => (
                    <tr key={pkg.id} className={`hover:bg-gray-50 ${!pkg.isActive ? "opacity-50" : ""}`}>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              pkg.isFeatured
                                ? "bg-gradient-to-br from-yellow-400 to-orange-500"
                                : "bg-gradient-to-br from-purple-400 to-pink-500"
                            }`}
                          >
                            {pkg.isFeatured ? (
                              <Star className="w-5 h-5 text-white" />
                            ) : (
                              <CreditCard className="w-5 h-5 text-white" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {pkg.name}
                              {pkg.isFeatured && (
                                <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                                  Featured
                                </span>
                              )}
                            </p>
                            {pkg.description && (
                              <p className="text-sm text-gray-500 truncate max-w-xs">
                                {pkg.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-semibold text-gray-900">
                          {pkg.credits.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-semibold text-green-600">
                          ${pkg.priceUsd.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-gray-500">
                          ${pkg.pricePerCredit.toFixed(4)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            pkg.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {pkg.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActiveMutation.mutate({ id: pkg.id })}
                            title={pkg.isActive ? "Deactivate" : "Activate"}
                          >
                            {pkg.isActive ? (
                              <EyeOff className="w-4 h-4 text-gray-500" />
                            ) : (
                              <Eye className="w-4 h-4 text-green-500" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleFeaturedMutation.mutate({ id: pkg.id })}
                            title={pkg.isFeatured ? "Unfeature" : "Feature"}
                          >
                            {pkg.isFeatured ? (
                              <StarOff className="w-4 h-4 text-yellow-500" />
                            ) : (
                              <Star className="w-4 h-4 text-gray-400" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(pkg)}
                            title="Edit"
                          >
                            <Edit className="w-4 h-4 text-blue-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => duplicateMutation.mutate({ id: pkg.id })}
                            title="Duplicate"
                          >
                            <Copy className="w-4 h-4 text-purple-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirm(pkg.id)}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No packages yet</p>
              <Button onClick={openCreateModal} className="mt-4">
                Create First Package
              </Button>
            </div>
          )}
        </div>

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold">
                  {editingPackage ? "Edit Package" : "Create Package"}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Package Name *
                  </label>
                  <Input
                    placeholder="e.g., Starter Pack"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <Input
                    placeholder="Brief description of the package"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Credits *
                    </label>
                    <Input
                      type="number"
                      placeholder="100"
                      value={formData.credits}
                      onChange={(e) => setFormData({ ...formData, credits: e.target.value })}
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Price (USD) *
                    </label>
                    <Input
                      type="number"
                      placeholder="9.99"
                      value={formData.priceUsd}
                      onChange={(e) => setFormData({ ...formData, priceUsd: e.target.value })}
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>

                {/* Price per credit preview */}
                {formData.credits && formData.priceUsd && (
                  <div className="bg-purple-50 rounded-lg p-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-600" />
                    <span className="text-sm text-purple-700">
                      Price per credit: <strong>${pricePerCredit}</strong>
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stripe Price ID (optional)
                  </label>
                  <Input
                    placeholder="price_xxxxx"
                    value={formData.stripePriceId}
                    onChange={(e) => setFormData({ ...formData, stripePriceId: e.target.value })}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Required for Stripe checkout integration
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sort Order
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Lower numbers appear first
                  </p>
                </div>

                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isFeatured}
                      onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                    />
                    <span className="text-sm text-gray-700">Featured</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : editingPackage
                    ? "Update Package"
                    : "Create Package"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm mx-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Delete Package?</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDeleteConfirm(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  onClick={() => deleteMutation.mutate({ id: deleteConfirm })}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
