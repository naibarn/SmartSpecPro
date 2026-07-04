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
  Download,
  ImagePlus,
  Loader2,
  ToggleLeft,
} from 'lucide-react';
import { TenantFeatureFlagsPanel } from '@/components/admin/TenantFeatureFlagsPanel';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm/ConfirmProvider';

interface Tenant {
  id: string;
  slug: string;
  name: string;
  primaryDomain: string;
  domains?: string[];
  logoUrl?: string;
  websiteLogoUrl?: string;
  faviconUrl?: string;
  isActive: boolean;
  plan?: string;
  status?: string;
  themeConfig?: any;
  theme?: any;
  seoConfig?: any;
  settings?: any;
  createdAt: string;
  updatedAt?: string;
}

interface ThemePreset {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  theme?: any;
  themeConfig?: any;
  preview?: string;
  isActive?: boolean;
}

export default function AdminTenants() {
  const { confirm } = useConfirm();
  const { user, isLoading, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingWebsiteLogo, setUploadingWebsiteLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [themePresets, setThemePresets] = useState<ThemePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [applyingPreset, setApplyingPreset] = useState(false);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingWebsiteLogoFile, setPendingWebsiteLogoFile] = useState<File | null>(null);
  const [pendingFaviconFile, setPendingFaviconFile] = useState<File | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    slug: '',
    name: '',
    primaryDomain: '',
    domains: '',
    logoUrl: '',
    websiteLogoUrl: '',
    faviconUrl: '',
    isActive: true,
  });

  // File upload handler
  // Upload file to a specific tenant
  const uploadFileToTenant = async (tenantId: string, type: 'logo' | 'website-logo' | 'favicon', file: File) => {
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const response = await fetch(`/api/admin/tenants/${tenantId}/upload`, {
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

    return await response.json();
  };

  const handleFileUpload = async (type: 'logo' | 'website-logo' | 'favicon', file: File) => {
    const maxSize = type === 'favicon' ? 1 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`File too large. Max size: ${type === 'favicon' ? '1MB' : '10MB'}`);
      return;
    }

    const fieldKey = type === 'logo' ? 'logoUrl' : type === 'website-logo' ? 'websiteLogoUrl' : 'faviconUrl';
    const label = type === 'logo' ? 'Logo' : type === 'website-logo' ? 'Website Logo' : 'Favicon';

    // If no tenant yet (create mode), store file for later upload and show preview
    if (!editingTenant) {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      if (type === 'logo') setPendingLogoFile(file);
      else if (type === 'website-logo') setPendingWebsiteLogoFile(file);
      else setPendingFaviconFile(file);

      setFormData(prev => ({ ...prev, [fieldKey]: dataUrl }));
      toast.success(`${label} selected. It will be uploaded when you create the tenant.`);
      return;
    }

    if (type === 'logo') setUploadingLogo(true);
    else if (type === 'website-logo') setUploadingWebsiteLogo(true);
    else setUploadingFavicon(true);

    try {
      const data = await uploadFileToTenant(editingTenant.id, type, file);
      setFormData(prev => ({ ...prev, [fieldKey]: data.url }));
      toast.success(`${label} uploaded successfully`);
      fetchTenants();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      if (type === 'logo') setUploadingLogo(false);
      else if (type === 'website-logo') setUploadingWebsiteLogo(false);
      else setUploadingFavicon(false);
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

  const applyThemePreset = async (presetId: string) => {
    if (!editingTenant) return;

    setApplyingPreset(true);
    try {
      const preset = themePresets.find(p => p.id === presetId);
      const themeConfig = preset?.theme || preset?.themeConfig;
      const response = await fetch(`/api/admin/tenants/${editingTenant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          domains: formData.domains ? formData.domains.split(',').map(d => d.trim()) : [],
          themeConfig: themeConfig,
        }),
      });

      if (response.ok) {
        toast.success('Theme preset applied! Refreshing to see changes...');
        setSelectedPresetId(presetId);
        await fetchTenants();
        // Also refresh editingTenant to show updated theme
        const updatedTenant = tenants.find(t => t.id === editingTenant.id);
        if (updatedTenant) {
          const preset = themePresets.find(p => p.id === presetId);
          setEditingTenant({ ...updatedTenant, themeConfig: preset?.theme || preset?.themeConfig });
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
        // API returns array directly, not {tenants: [...]}
        setTenants(Array.isArray(data) ? data : (data.tenants || []));
      }
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
    }
  };

  const handleCreate = async () => {
    try {
      // Strip data URLs from logo fields before sending (pending files will be uploaded after)
      const submitData = {
        ...formData,
        logoUrl: formData.logoUrl?.startsWith('data:') ? '' : formData.logoUrl,
        websiteLogoUrl: formData.websiteLogoUrl?.startsWith('data:') ? '' : formData.websiteLogoUrl,
        faviconUrl: formData.faviconUrl?.startsWith('data:') ? '' : formData.faviconUrl,
        domains: formData.domains ? formData.domains.split(',').map(d => d.trim()) : [],
      };

      const response = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(submitData),
      });

      if (response.ok) {
        const { tenant } = await response.json();

        // Upload pending files now that we have a tenant ID
        if (pendingLogoFile && tenant?.id) {
          try {
            await uploadFileToTenant(tenant.id, 'logo', pendingLogoFile);
          } catch (err) {
            console.error('Failed to upload logo:', err);
            toast.error('Tenant created but logo upload failed');
          }
        }
        if (pendingWebsiteLogoFile && tenant?.id) {
          try {
            await uploadFileToTenant(tenant.id, 'website-logo', pendingWebsiteLogoFile);
          } catch (err) {
            console.error('Failed to upload website logo:', err);
            toast.error('Tenant created but website logo upload failed');
          }
        }
        if (pendingFaviconFile && tenant?.id) {
          try {
            await uploadFileToTenant(tenant.id, 'favicon', pendingFaviconFile);
          } catch (err) {
            console.error('Failed to upload favicon:', err);
            toast.error('Tenant created but favicon upload failed');
          }
        }

        await fetchTenants();
        setIsCreateDialogOpen(false);
        resetForm();
        setPendingLogoFile(null);
        setPendingWebsiteLogoFile(null);
        setPendingFaviconFile(null);
        toast.success('Tenant created successfully');
      }
    } catch (error) {
      console.error('Failed to create tenant:', error);
      toast.error('Failed to create tenant');
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

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Are you sure you want to delete this tenant?',
      tone: 'danger',
    });
    if (!confirmed) return;

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
      websiteLogoUrl: '',
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
      websiteLogoUrl: tenant.websiteLogoUrl || '',
      faviconUrl: tenant.faviconUrl || '',
      isActive: tenant.isActive,
    });
    setEditingTenant(tenant);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
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
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 flex items-center justify-center">
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

      <main className="px-4 sm:px-6 lg:px-8 py-8">
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
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 flex items-center justify-center">
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
        <DialogContent className="w-[96vw] max-w-[96vw] sm:w-[94vw] sm:max-w-[94vw] lg:w-[92vw] lg:max-w-[92vw] xl:w-[88vw] xl:max-w-[88vw] h-[92vh] max-h-[92vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingTenant ? 'Edit Tenant' : 'Create New Tenant'}</DialogTitle>
            <DialogDescription>
              {editingTenant ? 'Update tenant information' : 'Add a new white label tenant'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(460px,1.18fr)] lg:items-start">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                  <div className="grid gap-4 sm:grid-cols-2">
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

                  <div className="mt-4">
                    <Label htmlFor="primaryDomain">Primary Domain *</Label>
                    <Input
                      id="primaryDomain"
                      placeholder="acme.com"
                      value={formData.primaryDomain}
                      onChange={(e) => setFormData({ ...formData, primaryDomain: e.target.value })}
                    />
                  </div>

                  <div className="mt-4">
                    <Label htmlFor="domains">Additional Domains (comma-separated)</Label>
                    <Input
                      id="domains"
                      placeholder="www.acme.com, acme.io"
                      value={formData.domains}
                      onChange={(e) => setFormData({ ...formData, domains: e.target.value })}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="logoUrl">Logo</Label>
                      <div className="space-y-2">
                        {formData.logoUrl && (
                          <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2">
                            <img
                              src={formData.logoUrl}
                              alt="Logo preview"
                              className="h-10 w-10 rounded object-contain"
                            />
                            <span className="flex-1 truncate text-xs text-gray-500">
                              {formData.logoUrl.split('/').pop()}
                            </span>
                            <a
                              href={formData.logoUrl}
                              download={formData.logoUrl.split('/').pop() || 'logo'}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-blue-500"
                                title="Download logo"
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            </a>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setFormData({ ...formData, logoUrl: '' })}
                              className="h-6 w-6 p-0 text-red-500"
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
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="faviconUrl">Favicon</Label>
                      <div className="space-y-2">
                        {formData.faviconUrl && (
                          <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2">
                            <img
                              src={formData.faviconUrl}
                              alt="Favicon preview"
                              className="h-6 w-6 object-contain"
                            />
                            <span className="flex-1 truncate text-xs text-gray-500">
                              {formData.faviconUrl.split('/').pop()}
                            </span>
                            <a
                              href={formData.faviconUrl}
                              download={formData.faviconUrl.split('/').pop() || 'favicon'}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-blue-500"
                                title="Download favicon"
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            </a>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setFormData({ ...formData, faviconUrl: '' })}
                              className="h-6 w-6 p-0 text-red-500"
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
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Label htmlFor="websiteLogoUrl">Website Logo (Public Pages)</Label>
                    <p className="mb-2 text-xs text-gray-500">Larger logo displayed on public website header and footer. Recommended: wide format (e.g. 400x80px).</p>
                    <div className="space-y-2">
                      {formData.websiteLogoUrl && (
                        <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2">
                          <img
                            src={formData.websiteLogoUrl}
                            alt="Website logo preview"
                            className="h-10 w-auto max-w-[200px] rounded object-contain"
                          />
                          <span className="flex-1 truncate text-xs text-gray-500">
                            {formData.websiteLogoUrl.split('/').pop()}
                          </span>
                          <a
                            href={formData.websiteLogoUrl}
                            download={formData.websiteLogoUrl.split('/').pop() || 'website-logo'}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-blue-500"
                              title="Download website logo"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </a>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setFormData({ ...formData, websiteLogoUrl: '' })}
                            className="h-6 w-6 p-0 text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input
                          id="websiteLogoUrl"
                          placeholder="https://... or upload"
                          value={formData.websiteLogoUrl}
                          onChange={(e) => setFormData({ ...formData, websiteLogoUrl: e.target.value })}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={uploadingWebsiteLogo}
                          onClick={() => document.getElementById('websiteLogoUpload')?.click()}
                          className="shrink-0"
                        >
                          {uploadingWebsiteLogo ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                        </Button>
                        <input
                          id="websiteLogoUpload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload('website-logo', file);
                            e.target.value = '';
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="isActive">Active</Label>
                  </div>

                  {editingTenant && themePresets.length > 0 && (
                    <div className="mt-4 border-t pt-4">
                      <Label className="mb-3 flex items-center gap-2">
                        <Palette className="w-4 h-4" />
                        Theme Preset
                      </Label>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {themePresets.map((preset) => {
                          const colors = preset.themeConfig || preset.theme || {};
                          const isSelected = editingTenant.themeConfig?.primaryColor === colors.primaryColor;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              disabled={applyingPreset}
                              onClick={() => applyThemePreset(preset.id)}
                              className={`relative rounded-lg border-2 p-3 text-left transition-all ${
                                isSelected
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                              }`}
                            >
                              {isSelected && (
                                <div className="absolute right-1 top-1">
                                  <Check className="w-4 h-4 text-blue-500" />
                                </div>
                              )}
                              <div className="mb-2 flex gap-1">
                                <div
                                  className="h-4 w-4 rounded-full"
                                  style={{ backgroundColor: colors.primaryColor || '#3b82f6' }}
                                />
                                <div
                                  className="h-4 w-4 rounded-full"
                                  style={{ backgroundColor: colors.secondaryColor || '#6366f1' }}
                                />
                                <div
                                  className="h-4 w-4 rounded-full"
                                  style={{ backgroundColor: colors.accentColor || '#8b5cf6' }}
                                />
                              </div>
                              <div className="truncate text-xs font-medium text-gray-900">
                                {preset.displayName || preset.name}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {applyingPreset && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Applying theme...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {editingTenant && (
                <div className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(92vh-2rem)] lg:overflow-y-auto lg:pr-1">
                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <ToggleLeft className="w-4 h-4 text-gray-500" />
                      <h3 className="text-sm font-semibold text-gray-700">Feature Flags</h3>
                    </div>
                    <div className="mt-3">
                      <TenantFeatureFlagsPanel tenantId={editingTenant.id} canEdit />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0">
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
