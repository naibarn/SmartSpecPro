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
  Upload,
  ImagePlus,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

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

interface ThemePreset {
  id: number;
  name: string;
  displayName: string;
  description?: string;
  themeConfig: any;
  isActive: boolean;
}

export default function AdminTenants() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [themePresets, setThemePresets] = useState<ThemePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
  const [applyingPreset, setApplyingPreset] = useState(false);

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

  // File upload handler
  const handleFileUpload = async (type: 'logo' | 'favicon', file: File) => {
    if (!editingTenant) {
      toast.error('Please save the tenant first before uploading files');
      return;
    }

    const maxSize = type === 'favicon' ? 1 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`File too large. Max size: ${type === 'favicon' ? '1MB' : '5MB'}`);
      return;
    }

    type === 'logo' ? setUploadingLogo(true) : setUploadingFavicon(true);

    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch(`/api/admin/tenants/${editingTenant.id}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type,
          fileBase64: base64,
          fileName: file.name,
          fileType: file.type,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await response.json();

      // Update form data with new URL
      setFormData(prev => ({
        ...prev,
        [type === 'logo' ? 'logoUrl' : 'faviconUrl']: data.url,
      }));

      toast.success(`${type === 'logo' ? 'Logo' : 'Favicon'} uploaded successfully`);
      fetchTenants(); // Refresh list
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      type === 'logo' ? setUploadingLogo(false) : setUploadingFavicon(false);
    }
  };

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
    fetchThemePresets();
  }, []);

  const fetchThemePresets = async () => {
    try {
      const response = await fetch('/api/tenant/theme-presets', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setThemePresets(data.presets || []);
      }
    } catch (error) {
      console.error('Failed to fetch theme presets:', error);
    }
  };

  const applyThemePreset = async (presetId: number) => {
    if (!editingTenant) return;

    setApplyingPreset(true);
    try {
      const response = await fetch(`/api/admin/tenants/${editingTenant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          domains: formData.domains ? formData.domains.split(',').map(d => d.trim()) : [],
          themeConfig: themePresets.find(p => p.id === presetId)?.themeConfig,
        }),
      });

      if (response.ok) {
        toast.success('Theme preset applied! Refreshing to see changes...');
        setSelectedPresetId(presetId);
        await fetchTenants();
        // Also refresh editingTenant to show updated theme
        const updatedTenant = tenants.find(t => t.id === editingTenant.id);
        if (updatedTenant) {
          setEditingTenant({ ...updatedTenant, themeConfig: themePresets.find(p => p.id === presetId)?.themeConfig });
        }
      } else {
        toast.error('Failed to apply theme preset');
      }
    } catch (error) {
      console.error('Failed to apply theme preset:', error);
      toast.error('Failed to apply theme preset');
    } finally {
      setApplyingPreset(false);
    }
  };

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
                <Label htmlFor="logoUrl">Logo</Label>
                <div className="space-y-2">
                  {formData.logoUrl && (
                    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                      <img
                        src={formData.logoUrl}
                        alt="Logo preview"
                        className="w-10 h-10 object-contain rounded"
                      />
                      <span className="text-xs text-gray-500 truncate flex-1">
                        {formData.logoUrl.split('/').pop()}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormData({ ...formData, logoUrl: '' })}
                        className="text-red-500 h-6 w-6 p-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      id="logoUrl"
                      placeholder="https://... or upload"
                      value={formData.logoUrl}
                      onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                      className="flex-1"
                    />
                    {editingTenant && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingLogo}
                        onClick={() => document.getElementById('logoUpload')?.click()}
                        className="shrink-0"
                      >
                        {uploadingLogo ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    <input
                      id="logoUpload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload('logo', file);
                        e.target.value = '';
                      }}
                    />
                  </div>
                  {!editingTenant && (
                    <p className="text-xs text-gray-500">Save tenant first to enable upload</p>
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="faviconUrl">Favicon</Label>
                <div className="space-y-2">
                  {formData.faviconUrl && (
                    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                      <img
                        src={formData.faviconUrl}
                        alt="Favicon preview"
                        className="w-6 h-6 object-contain"
                      />
                      <span className="text-xs text-gray-500 truncate flex-1">
                        {formData.faviconUrl.split('/').pop()}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormData({ ...formData, faviconUrl: '' })}
                        className="text-red-500 h-6 w-6 p-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      id="faviconUrl"
                      placeholder="https://... or upload"
                      value={formData.faviconUrl}
                      onChange={(e) => setFormData({ ...formData, faviconUrl: e.target.value })}
                      className="flex-1"
                    />
                    {editingTenant && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingFavicon}
                        onClick={() => document.getElementById('faviconUpload')?.click()}
                        className="shrink-0"
                      >
                        {uploadingFavicon ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    <input
                      id="faviconUpload"
                      type="file"
                      accept="image/*,.ico"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload('favicon', file);
                        e.target.value = '';
                      }}
                    />
                  </div>
                  {!editingTenant && (
                    <p className="text-xs text-gray-500">Save tenant first to enable upload</p>
                  )}
                </div>
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

            {/* Theme Preset Selector - Only show when editing */}
            {editingTenant && themePresets.length > 0 && (
              <div className="pt-4 border-t">
                <Label className="flex items-center gap-2 mb-3">
                  <Palette className="w-4 h-4" />
                  Theme Preset
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {themePresets.map((preset) => {
                    const isSelected = editingTenant.themeConfig?.primaryColor === preset.themeConfig?.primaryColor;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        disabled={applyingPreset}
                        onClick={() => applyThemePreset(preset.id)}
                        className={`relative p-3 rounded-lg border-2 transition-all text-left ${
                          isSelected
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-1 right-1">
                            <Check className="w-4 h-4 text-purple-500" />
                          </div>
                        )}
                        <div className="flex gap-1 mb-2">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: preset.themeConfig?.primaryColor || '#3b82f6' }}
                          />
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: preset.themeConfig?.secondaryColor || '#6366f1' }}
                          />
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: preset.themeConfig?.accentColor || '#8b5cf6' }}
                          />
                        </div>
                        <div className="text-xs font-medium text-gray-900 truncate">
                          {preset.displayName}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {applyingPreset && (
                  <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Applying theme...
                  </div>
                )}
              </div>
            )}
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
