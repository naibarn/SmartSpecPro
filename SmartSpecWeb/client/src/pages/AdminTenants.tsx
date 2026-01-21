/**
 * Admin Tenants Management Page
 * CRUD operations for multi-tenant white label system
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Building2,
  Globe,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  Check,
  X,
  Palette,
  Settings as SettingsIcon,
} from 'lucide-react';

interface Tenant {
  id: number;
  slug: string;
  name: string;
  primaryDomain: string;
  domains: string[];
  logoUrl?: string;
  faviconUrl?: string;
  isActive: boolean;
  themeConfig?: any;
  seoConfig?: any;
  settings?: any;
  createdAt: string;
}

export default function AdminTenants() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    slug: '',
    name: '',
    primaryDomain: '',
    domains: '',
    logoUrl: '',
    faviconUrl: '',
    isActive: true,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/login');
      return;
    }
    if (user && user.role !== 'admin') {
      setLocation('/dashboard');
    }
  }, [isLoading, isAuthenticated, user, setLocation]);

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      const response = await fetch('/api/admin/tenants', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setTenants(data.tenants || []);
      }
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
    }
  };

  const handleCreate = async () => {
    try {
      const response = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          domains: formData.domains ? formData.domains.split(',').map(d => d.trim()) : [],
        }),
      });

      if (response.ok) {
        await fetchTenants();
        setIsCreateDialogOpen(false);
        resetForm();
      }
    } catch (error) {
      console.error('Failed to create tenant:', error);
    }
  };

  const handleUpdate = async () => {
    if (!editingTenant) return;

    try {
      const response = await fetch(`/api/admin/tenants/${editingTenant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          domains: formData.domains ? formData.domains.split(',').map(d => d.trim()) : [],
        }),
      });

      if (response.ok) {
        await fetchTenants();
        setEditingTenant(null);
        resetForm();
      }
    } catch (error) {
      console.error('Failed to update tenant:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this tenant?')) return;

    try {
      const response = await fetch(`/api/admin/tenants/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        await fetchTenants();
      }
    } catch (error) {
      console.error('Failed to delete tenant:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      slug: '',
      name: '',
      primaryDomain: '',
      domains: '',
      logoUrl: '',
      faviconUrl: '',
      isActive: true,
    });
  };

  const openEditDialog = (tenant: Tenant) => {
    setFormData({
      slug: tenant.slug,
      name: tenant.name,
      primaryDomain: tenant.primaryDomain,
      domains: tenant.domains?.join(', ') || '',
      logoUrl: tenant.logoUrl || '',
      faviconUrl: tenant.faviconUrl || '',
      isActive: tenant.isActive,
    });
    setEditingTenant(tenant);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/dashboard')}
                className="text-gray-600"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Tenant Management</h1>
                  <p className="text-sm text-gray-500">Manage white label tenants</p>
                </div>
              </div>
            </div>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Tenant
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Tenants Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tenants.map((tenant) => (
            <motion.div
              key={tenant.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {tenant.logoUrl ? (
                    <img
                      src={tenant.logoUrl}
                      alt={tenant.name}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-gray-900">{tenant.name}</h3>
                    <p className="text-sm text-gray-500">{tenant.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {tenant.isActive ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : (
                    <X className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Globe className="w-4 h-4" />
                  {tenant.primaryDomain}
                </div>
                {tenant.domains && tenant.domains.length > 0 && (
                  <div className="text-xs text-gray-500">
                    +{tenant.domains.length} more domain(s)
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => openEditDialog(tenant)}
                >
                  <Pencil className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => handleDelete(tenant.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>

        {tenants.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">No tenants yet. Create your first tenant!</p>
          </div>
        )}
      </main>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen || !!editingTenant} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false);
          setEditingTenant(null);
          resetForm();
        }
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTenant ? 'Edit Tenant' : 'Create New Tenant'}</DialogTitle>
            <DialogDescription>
              {editingTenant ? 'Update tenant information' : 'Add a new white label tenant'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Tenant Name *</Label>
                <Input
                  id="name"
                  placeholder="Acme Corp"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  placeholder="acme-corp"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="primaryDomain">Primary Domain *</Label>
              <Input
                id="primaryDomain"
                placeholder="acme.com"
                value={formData.primaryDomain}
                onChange={(e) => setFormData({ ...formData, primaryDomain: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="domains">Additional Domains (comma-separated)</Label>
              <Input
                id="domains"
                placeholder="www.acme.com, acme.io"
                value={formData.domains}
                onChange={(e) => setFormData({ ...formData, domains: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="logoUrl">Logo URL</Label>
                <Input
                  id="logoUrl"
                  placeholder="https://..."
                  value={formData.logoUrl}
                  onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="faviconUrl">Favicon URL</Label>
                <Input
                  id="faviconUrl"
                  placeholder="https://..."
                  value={formData.faviconUrl}
                  onChange={(e) => setFormData({ ...formData, faviconUrl: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300"
              />
              <Label htmlFor="isActive">Active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreateDialogOpen(false);
              setEditingTenant(null);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button onClick={editingTenant ? handleUpdate : handleCreate}>
              {editingTenant ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
