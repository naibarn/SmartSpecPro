/**
 * Admin Gallery Management Page
 * CRUD operations for gallery items (images, videos, websites)
 * Features: Bulk actions, Drag & drop, Pagination, Analytics, Like button
 */

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import {
  Image,
  Video,
  Globe,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Star,
  StarOff,
  Upload,
  Search,
  BarChart3,
  Loader2,
  X,
  Download,
  Heart,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  CheckSquare,
  Square,
  AlertTriangle,
  TrendingUp,
  Users,
  Activity,
  RefreshCw,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type GalleryType = "image" | "video" | "website";
type AspectRatio = "1:1" | "9:16" | "16:9";
type ViewMode = "grid" | "analytics";

interface GalleryItem {
  id: number;
  type: GalleryType;
  title: string;
  description: string | null;
  aspectRatio: AspectRatio;
  fileKey: string | null;
  fileUrl: string | null;
  thumbnailKey: string | null;
  thumbnailUrl: string | null;
  duration: string | null;
  demoUrl: string | null;
  tags: string[] | null;
  views: number;
  likes: number;
  downloads: number;
  isPublished: boolean;
  isFeatured: boolean;
  authorId: number | null;
  authorName: string | null;
  authorAvatar: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FormData {
  type: GalleryType;
  title: string;
  description: string;
  aspectRatio: AspectRatio;
  fileUrl: string;
  thumbnailUrl: string;
  duration: string;
  demoUrl: string;
  tags: string;
  isPublished: boolean;
  isFeatured: boolean;
  authorName: string;
  sortOrder: number;
}

const defaultFormData: FormData = {
  type: "image",
  title: "",
  description: "",
  aspectRatio: "16:9",
  fileUrl: "",
  thumbnailUrl: "",
  duration: "",
  demoUrl: "",
  tags: "",
  isPublished: true,
  isFeatured: false,
  authorName: "",
  sortOrder: 0,
};

const ITEMS_PER_PAGE = 12;

export default function AdminGallery() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  
  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [activeTab, setActiveTab] = useState<"all" | GalleryType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  
  // Dialog state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [formData, setFormData] = useState<FormData>(defaultFormData);
  
  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  
  // Drag state
  const [draggedItem, setDraggedItem] = useState<number | null>(null);

  // tRPC queries
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.gallery.adminList.useQuery({
    type: activeTab === "all" ? undefined : activeTab,
    search: searchQuery || undefined,
    limit: ITEMS_PER_PAGE,
    offset: page * ITEMS_PER_PAGE,
  });
  
  const { data: totalCount } = trpc.gallery.count.useQuery({
    type: activeTab === "all" ? undefined : activeTab,
    search: searchQuery || undefined,
  });
  
  const { data: stats, refetch: refetchStats } = trpc.gallery.stats.useQuery();
  const { data: analytics } = trpc.gallery.analytics.useQuery(
    { days: 30 },
    { enabled: viewMode === "analytics" }
  );

  // tRPC mutations
  const createMutation = trpc.gallery.create.useMutation({
    onSuccess: () => {
      toast.success("Gallery item created successfully");
      setIsCreateDialogOpen(false);
      setFormData(defaultFormData);
      utils.gallery.adminList.invalidate();
      utils.gallery.stats.invalidate();
      utils.gallery.count.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to create: ${error.message}`);
    },
  });

  const updateMutation = trpc.gallery.update.useMutation({
    onSuccess: () => {
      toast.success("Gallery item updated successfully");
      setIsEditDialogOpen(false);
      setSelectedItem(null);
      utils.gallery.adminList.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const deleteMutation = trpc.gallery.delete.useMutation({
    onSuccess: () => {
      toast.success("Gallery item deleted successfully");
      setIsDeleteDialogOpen(false);
      setSelectedItem(null);
      utils.gallery.adminList.invalidate();
      utils.gallery.stats.invalidate();
      utils.gallery.count.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  const togglePublishMutation = trpc.gallery.togglePublish.useMutation({
    onSuccess: (data) => {
      toast.success(data.isPublished ? "Item published" : "Item unpublished");
      utils.gallery.adminList.invalidate();
    },
  });

  const toggleFeaturedMutation = trpc.gallery.toggleFeatured.useMutation({
    onSuccess: (data) => {
      toast.success(data.isFeatured ? "Item featured" : "Item unfeatured");
      utils.gallery.adminList.invalidate();
    },
  });

  const likeMutation = trpc.gallery.like.useMutation({
    onSuccess: () => {
      toast.success("Liked!");
      utils.gallery.adminList.invalidate();
      utils.gallery.stats.invalidate();
    },
  });

  const uploadFileMutation = trpc.gallery.uploadFile.useMutation();
  
  const updateSortOrderMutation = trpc.gallery.updateSortOrder.useMutation({
    onSuccess: () => {
      toast.success("Order updated");
      utils.gallery.adminList.invalidate();
    },
  });

  // Bulk mutations
  const bulkDeleteMutation = trpc.gallery.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`Deleted ${data.count} items`);
      setSelectedIds(new Set());
      setSelectMode(false);
      setIsBulkDeleteDialogOpen(false);
      utils.gallery.adminList.invalidate();
      utils.gallery.stats.invalidate();
      utils.gallery.count.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  const bulkPublishMutation = trpc.gallery.bulkPublish.useMutation({
    onSuccess: (data) => {
      toast.success(`Updated ${data.count} items`);
      setSelectedIds(new Set());
      utils.gallery.adminList.invalidate();
    },
  });

  const bulkFeatureMutation = trpc.gallery.bulkFeature.useMutation({
    onSuccess: (data) => {
      toast.success(`Updated ${data.count} items`);
      setSelectedIds(new Set());
      utils.gallery.adminList.invalidate();
    },
  });

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  // File upload handler
  const handleFileUpload = useCallback(
    async (file: File, type: "main" | "thumbnail") => {
      setIsUploading(true);
      setUploadProgress(0);

      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(",")[1];
            resolve(base64);
          };
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const fileBase64 = await base64Promise;

        let folder: "images" | "videos" | "thumbnails" | "websites" = "images";
        if (type === "thumbnail") {
          folder = "thumbnails";
        } else if (file.type.startsWith("video/")) {
          folder = "videos";
        }

        setUploadProgress(50);

        const result = await uploadFileMutation.mutateAsync({
          fileName: file.name,
          fileType: file.type,
          fileBase64,
          folder,
        });

        setUploadProgress(100);

        if (type === "main") {
          setFormData((prev) => ({ ...prev, fileUrl: result.fileUrl }));
        } else {
          setFormData((prev) => ({ ...prev, thumbnailUrl: result.fileUrl }));
        }

        toast.success("File uploaded successfully");
      } catch (error) {
        toast.error("Failed to upload file");
        console.error(error);
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [uploadFileMutation]
  );

  // Form handlers
  const handleCreate = () => {
    createMutation.mutate({
      type: formData.type,
      title: formData.title,
      description: formData.description || undefined,
      aspectRatio: formData.aspectRatio,
      fileUrl: formData.fileUrl || undefined,
      thumbnailUrl: formData.thumbnailUrl || undefined,
      duration: formData.duration || undefined,
      demoUrl: formData.demoUrl || undefined,
      tags: formData.tags ? formData.tags.split(",").map((t) => t.trim()) : undefined,
      isPublished: formData.isPublished,
      isFeatured: formData.isFeatured,
      authorName: formData.authorName || undefined,
      sortOrder: formData.sortOrder,
    });
  };

  const handleUpdate = () => {
    if (!selectedItem) return;
    updateMutation.mutate({
      id: selectedItem.id,
      data: {
        type: formData.type,
        title: formData.title,
        description: formData.description || undefined,
        aspectRatio: formData.aspectRatio,
        fileUrl: formData.fileUrl || undefined,
        thumbnailUrl: formData.thumbnailUrl || undefined,
        duration: formData.duration || undefined,
        demoUrl: formData.demoUrl || undefined,
        tags: formData.tags ? formData.tags.split(",").map((t) => t.trim()) : undefined,
        isPublished: formData.isPublished,
        isFeatured: formData.isFeatured,
        authorName: formData.authorName || undefined,
        sortOrder: formData.sortOrder,
      },
    });
  };

  const handleDelete = () => {
    if (!selectedItem) return;
    deleteMutation.mutate({ id: selectedItem.id });
  };

  const openEditDialog = (item: GalleryItem) => {
    setSelectedItem(item);
    setFormData({
      type: item.type,
      title: item.title,
      description: item.description || "",
      aspectRatio: item.aspectRatio,
      fileUrl: item.fileUrl || "",
      thumbnailUrl: item.thumbnailUrl || "",
      duration: item.duration || "",
      demoUrl: item.demoUrl || "",
      tags: item.tags?.join(", ") || "",
      isPublished: item.isPublished,
      isFeatured: item.isFeatured,
      authorName: item.authorName || "",
      sortOrder: item.sortOrder,
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (item: GalleryItem) => {
    setSelectedItem(item);
    setIsDeleteDialogOpen(true);
  };

  // Selection handlers
  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (items) {
      setSelectedIds(new Set(items.map((item) => item.id)));
    }
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Drag handlers
  const handleDragStart = (id: number) => {
    setDraggedItem(id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === targetId) return;
  };

  const handleDrop = (targetId: number) => {
    if (draggedItem === null || !items) return;

    const draggedIndex = items.findIndex((item) => item.id === draggedItem);
    const targetIndex = items.findIndex((item) => item.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newOrder = items.map((item, index) => ({
      id: item.id,
      sortOrder: index === draggedIndex ? targetIndex : index === targetIndex ? draggedIndex : index,
    }));

    updateSortOrderMutation.mutate(newOrder);
    setDraggedItem(null);
  };

  // Get type icon
  const getTypeIcon = (type: GalleryType) => {
    switch (type) {
      case "image":
        return <Image className="w-4 h-4" />;
      case "video":
        return <Video className="w-4 h-4" />;
      case "website":
        return <Globe className="w-4 h-4" />;
    }
  };

  // Pagination
  const totalPages = Math.ceil((totalCount || 0) / ITEMS_PER_PAGE);

  // Auth check
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Image className="w-7 h-7 text-purple-500" />
                Gallery Management
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage images, videos, and website demos
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("grid")}
              >
                <Image className="w-4 h-4 mr-1" />
                Gallery
              </Button>
              <Button
                variant={viewMode === "analytics" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("analytics")}
              >
                <BarChart3 className="w-4 h-4 mr-1" />
                Analytics
              </Button>
              <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-purple-600 hover:bg-purple-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Image className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total</p>
                    <p className="text-xl font-bold">{stats.totalItems}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Image className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Images</p>
                    <p className="text-xl font-bold">{stats.totalImages}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <Video className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Videos</p>
                    <p className="text-xl font-bold">{stats.totalVideos}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Globe className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Websites</p>
                    <p className="text-xl font-bold">{stats.totalWebsites}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Eye className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Views</p>
                    <p className="text-xl font-bold">{stats.totalViews.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-pink-100 rounded-lg">
                    <Heart className="w-5 h-5 text-pink-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Likes</p>
                    <p className="text-xl font-bold">{stats.totalLikes.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {viewMode === "analytics" ? (
          /* Analytics View */
          <div className="space-y-6">
            {/* Top Items */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-purple-500" />
                  Top Performing Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analytics?.topItems && analytics.topItems.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.topItems.map((item, index) => (
                      <div key={item.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                        <span className="text-lg font-bold text-gray-400 w-6">#{index + 1}</span>
                        <div className="flex-1">
                          <p className="font-medium">{item.title}</p>
                          <p className="text-sm text-gray-500 capitalize">{item.type}</p>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1">
                            <Eye className="w-4 h-4 text-gray-400" />
                            {item.views.toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="w-4 h-4 text-pink-400" />
                            {item.likes.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">No data available</p>
                )}
              </CardContent>
            </Card>

            {/* Type Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-purple-500" />
                  Content Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analytics?.typeDistribution && analytics.typeDistribution.length > 0 ? (
                  <div className="grid grid-cols-3 gap-4">
                    {analytics.typeDistribution.map((item) => (
                      <div key={item.type} className="text-center p-4 bg-gray-50 rounded-lg">
                        <div className="flex justify-center mb-2">
                          {item.type === "image" && <Image className="w-8 h-8 text-blue-500" />}
                          {item.type === "video" && <Video className="w-8 h-8 text-red-500" />}
                          {item.type === "website" && <Globe className="w-8 h-8 text-green-500" />}
                        </div>
                        <p className="text-2xl font-bold">{item.count}</p>
                        <p className="text-sm text-gray-500 capitalize">{item.type}s</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">No data available</p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Gallery View */
          <>
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search gallery items..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(0);
                  }}
                  className="pl-10"
                />
              </div>
              <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setPage(0); }}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="image">
                    <Image className="w-4 h-4 mr-1" />
                    Images
                  </TabsTrigger>
                  <TabsTrigger value="video">
                    <Video className="w-4 h-4 mr-1" />
                    Videos
                  </TabsTrigger>
                  <TabsTrigger value="website">
                    <Globe className="w-4 h-4 mr-1" />
                    Websites
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Bulk Actions Bar */}
            {selectMode && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-purple-700">
                    {selectedIds.size} selected
                  </span>
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>
                    Deselect All
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => bulkPublishMutation.mutate({ ids: Array.from(selectedIds), isPublished: true })}
                    disabled={selectedIds.size === 0}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Publish
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => bulkPublishMutation.mutate({ ids: Array.from(selectedIds), isPublished: false })}
                    disabled={selectedIds.size === 0}
                  >
                    <EyeOff className="w-4 h-4 mr-1" />
                    Unpublish
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => bulkFeatureMutation.mutate({ ids: Array.from(selectedIds), isFeatured: true })}
                    disabled={selectedIds.size === 0}
                  >
                    <Star className="w-4 h-4 mr-1" />
                    Feature
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsBulkDeleteDialogOpen(true)}
                    disabled={selectedIds.size === 0}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {!selectMode && (
              <div className="flex justify-end mb-4">
                <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
                  <CheckSquare className="w-4 h-4 mr-1" />
                  Select Items
                </Button>
              </div>
            )}

            {/* Gallery Grid */}
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[...Array(8)].map((_, i) => (
                  <Card key={i}>
                    <Skeleton className="aspect-video" />
                    <CardContent className="p-4">
                      <Skeleton className="h-5 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : items && items.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {items.map((item) => (
                  <Card
                    key={item.id}
                    className={`group overflow-hidden cursor-pointer transition-all ${
                      selectedIds.has(item.id) ? "ring-2 ring-purple-500" : ""
                    } ${draggedItem === item.id ? "opacity-50" : ""}`}
                    draggable
                    onDragStart={() => handleDragStart(item.id)}
                    onDragOver={(e) => handleDragOver(e, item.id)}
                    onDrop={() => handleDrop(item.id)}
                  >
                    <div className="relative aspect-video bg-gray-100">
                      {item.thumbnailUrl || item.fileUrl ? (
                        <img
                          src={item.thumbnailUrl || item.fileUrl || ""}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {getTypeIcon(item.type)}
                        </div>
                      )}

                      {/* Selection checkbox */}
                      {selectMode && (
                        <div
                          className="absolute top-2 left-2 z-10"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(item.id);
                          }}
                        >
                          <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                            selectedIds.has(item.id)
                              ? "bg-purple-500 border-purple-500"
                              : "bg-white/80 border-gray-300"
                          }`}>
                            {selectedIds.has(item.id) && <Check className="w-4 h-4 text-white" />}
                          </div>
                        </div>
                      )}

                      {/* Drag handle */}
                      {!selectMode && (
                        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="p-1 bg-black/50 rounded cursor-grab">
                            <GripVertical className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      )}

                      {/* Status badges */}
                      <div className="absolute top-2 right-2 flex gap-1">
                        {!item.isPublished && (
                          <Badge variant="secondary" className="bg-yellow-500/90 text-white text-xs">
                            Draft
                          </Badge>
                        )}
                        {item.isFeatured && (
                          <Badge variant="secondary" className="bg-violet-500/90 text-white text-xs">
                            <Star className="w-3 h-3" />
                          </Badge>
                        )}
                      </div>

                      {/* Type badge */}
                      <Badge
                        variant="secondary"
                        className="absolute bottom-2 left-2 bg-black/50 text-white text-xs"
                      >
                        {getTypeIcon(item.type)}
                        <span className="ml-1 capitalize">{item.type}</span>
                      </Badge>

                      {/* Duration for videos */}
                      {item.type === "video" && item.duration && (
                        <Badge
                          variant="secondary"
                          className="absolute bottom-2 right-2 bg-black/70 text-white text-xs"
                        >
                          {item.duration}
                        </Badge>
                      )}

                      {/* Like button overlay */}
                      <button
                        className="absolute bottom-2 right-2 p-2 bg-white/90 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-pink-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          likeMutation.mutate({ id: item.id });
                        }}
                      >
                        <Heart className="w-4 h-4 text-pink-500" />
                      </button>
                    </div>

                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium truncate">{item.title}</h3>
                          <p className="text-sm text-gray-500 truncate">
                            {item.aspectRatio}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="shrink-0">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(item)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => togglePublishMutation.mutate({ id: item.id })}>
                              {item.isPublished ? (
                                <>
                                  <EyeOff className="w-4 h-4 mr-2" />
                                  Unpublish
                                </>
                              ) : (
                                <>
                                  <Eye className="w-4 h-4 mr-2" />
                                  Publish
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleFeaturedMutation.mutate({ id: item.id })}>
                              {item.isFeatured ? (
                                <>
                                  <StarOff className="w-4 h-4 mr-2" />
                                  Unfeature
                                </>
                              ) : (
                                <>
                                  <Star className="w-4 h-4 mr-2" />
                                  Feature
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => openDeleteDialog(item)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {item.views}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3 text-pink-400" />
                          {item.likes}
                        </span>
                        {item.type === "image" && (
                          <span className="flex items-center gap-1">
                            <Download className="w-3 h-3" />
                            {item.downloads}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <Image className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No gallery items yet</h3>
                  <p className="text-gray-500 mb-4">
                    Get started by adding your first gallery item.
                  </p>
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </Button>
                </div>
              </Card>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-gray-600">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Create/Edit Dialog */}
      <Dialog
        open={isCreateDialogOpen || isEditDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setIsEditDialogOpen(false);
            setSelectedItem(null);
            setFormData(defaultFormData);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditDialogOpen ? "Edit Gallery Item" : "Add Gallery Item"}
            </DialogTitle>
            <DialogDescription>
              {isEditDialogOpen
                ? "Update the details of this gallery item."
                : "Add a new image, video, or website demo to the gallery."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            {/* Type & Aspect Ratio */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, type: v as GalleryType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">
                      <div className="flex items-center gap-2">
                        <Image className="w-4 h-4" />
                        Image
                      </div>
                    </SelectItem>
                    <SelectItem value="video">
                      <div className="flex items-center gap-2">
                        <Video className="w-4 h-4" />
                        Video
                      </div>
                    </SelectItem>
                    <SelectItem value="website">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        Website
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Aspect Ratio</Label>
                <Select
                  value={formData.aspectRatio}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, aspectRatio: v as AspectRatio }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1:1">1:1 (Square)</SelectItem>
                    <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                    <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Enter title..."
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Enter description..."
                rows={3}
              />
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>
                {formData.type === "image" ? "Image" : formData.type === "video" ? "Video" : "Screenshot"}
              </Label>
              <div className="flex gap-2">
                <Input
                  value={formData.fileUrl}
                  onChange={(e) => setFormData((prev) => ({ ...prev, fileUrl: e.target.value }))}
                  placeholder="Enter URL or upload file..."
                  className="flex-1"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={formData.type === "video" ? "video/*" : "image/*"}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, "main");
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {formData.fileUrl && (
                <div className="mt-2">
                  <img
                    src={formData.fileUrl}
                    alt="Preview"
                    className="max-h-32 rounded-lg object-cover"
                  />
                </div>
              )}
            </div>

            {/* Thumbnail */}
            <div className="space-y-2">
              <Label>Thumbnail (optional)</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.thumbnailUrl}
                  onChange={(e) => setFormData((prev) => ({ ...prev, thumbnailUrl: e.target.value }))}
                  placeholder="Enter thumbnail URL or upload..."
                  className="flex-1"
                />
                <input
                  ref={thumbnailInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, "thumbnail");
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => thumbnailInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <Upload className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Duration (for videos) */}
            {formData.type === "video" && (
              <div className="space-y-2">
                <Label>Duration</Label>
                <Input
                  value={formData.duration}
                  onChange={(e) => setFormData((prev) => ({ ...prev, duration: e.target.value }))}
                  placeholder="e.g., 2:30"
                />
              </div>
            )}

            {/* Demo URL (for websites) */}
            {formData.type === "website" && (
              <div className="space-y-2">
                <Label>Demo URL</Label>
                <Input
                  value={formData.demoUrl}
                  onChange={(e) => setFormData((prev) => ({ ...prev, demoUrl: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
            )}

            {/* Tags */}
            <div className="space-y-2">
              <Label>Tags (comma-separated)</Label>
              <Input
                value={formData.tags}
                onChange={(e) => setFormData((prev) => ({ ...prev, tags: e.target.value }))}
                placeholder="e.g., nature, landscape, photography"
              />
            </div>

            {/* Author */}
            <div className="space-y-2">
              <Label>Author Name (optional)</Label>
              <Input
                value={formData.authorName}
                onChange={(e) => setFormData((prev) => ({ ...prev, authorName: e.target.value }))}
                placeholder="Enter author name..."
              />
            </div>

            {/* Sort Order */}
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData((prev) => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
              />
            </div>

            {/* Toggles */}
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isPublished}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isPublished: checked }))}
                />
                <Label>Published</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isFeatured}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isFeatured: checked }))}
                />
                <Label>Featured</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setIsEditDialogOpen(false);
                setSelectedItem(null);
                setFormData(defaultFormData);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={isEditDialogOpen ? handleUpdate : handleCreate}
              disabled={createMutation.isPending || updateMutation.isPending || !formData.title}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {isEditDialogOpen ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete Item
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedItem?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete {selectedIds.size} Items
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedIds.size} selected items? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkDeleteMutation.mutate({ ids: Array.from(selectedIds) })}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Check icon component
function Check({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
