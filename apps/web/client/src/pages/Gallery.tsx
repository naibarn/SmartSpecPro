/**
 * Gallery Page - SmartAIHub
 * Design: Ethereal Gradient Flow
 * Features: Images, Videos, Website Demos with full SEO/ASO support
 * 
 * SEO/ASO Features:
 * - Dynamic meta tags for each content type
 * - Open Graph tags for social sharing
 * - Structured data (JSON-LD) for rich snippets
 * - Semantic HTML with proper heading hierarchy
 * - Alt text and ARIA labels for accessibility
 * - Lazy loading for performance
 */

import { useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDate } from '@smartspec/shared';
import { Button } from '@/components/ui/button';
import { DashboardCard } from '@/components/dashboard';
import { Input } from '@/components/ui/input';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/contexts/AuthContext';
import {
  Image as ImageIcon,
  Video,
  Globe,
  Search,
  Grid3X3,
  Heart,
  Eye,
  Download,
  Share2,
  ExternalLink,
  Play,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Maximize2,
  Clock,
  User,
  Tag,
  Loader2,
  Cpu,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Helmet } from 'react-helmet-async';
import { toast } from 'sonner';

// Types
type ContentType = 'all' | 'image' | 'video' | 'website';
type AspectRatio = '1:1' | '9:16' | '16:9';
type SortOption = 'newest' | 'popular' | 'trending';

interface GalleryItem {
  id: number;
  type: 'image' | 'video' | 'website';
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  fileUrl: string | null;
  aspectRatio: AspectRatio;
  authorName: string | null;
  authorAvatar: string | null;
  views: number;
  likes: number;
  downloads: number;
  tags: string[] | null;
  createdAt: Date;
  demoUrl: string | null;
  duration: string | null;
  model: string | null;
}

// Aspect ratio styles
const aspectRatioStyles: Record<AspectRatio, string> = {
  '1:1': 'aspect-square',
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-video',
};

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.05
    }
  }
};

// Format number helper
const formatNumber = (num: number): string => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

/** Returns true if the URL points to an image file (not a video) */
function isImageUrl(url?: string | null): boolean {
  if (!url) return false;
  return /\.(png|jpe?g|gif|webp|avif|svg|bmp)([?#].*)?$/i.test(url);
}

/**
 * Video thumbnail card — seeks to the first frame after metadata loads
 * so the browser shows a real frame instead of a blank/black box.
 */
function VideoThumbnailCard({ src, className }: { src: string; className: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleMetadata = useCallback(() => {
    const el = videoRef.current;
    if (el) el.currentTime = 0.5; // seek to 0.5s to get a representative frame
  }, []);
  return (
    <video
      ref={videoRef}
      src={src}
      className={className}
      preload="metadata"
      muted
      playsInline
      onLoadedMetadata={handleMetadata}
    />
  );
}

export default function Gallery() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<ContentType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch gallery items from API
  const { data: items, isLoading, error, refetch } = trpc.gallery.list.useQuery({
    type: activeTab === 'all' ? undefined : activeTab,
    search: searchQuery || undefined,
    limit: 50,
  });

  // Mutations
  const viewMutation = trpc.gallery.view.useMutation();
  const likeMutation = trpc.gallery.like.useMutation();
  const downloadMutation = trpc.gallery.download.useMutation();
  const deleteMutation = trpc.gallery.delete.useMutation({
    onSuccess: () => {
      toast.success('Item deleted successfully');
      refetch();
      setIsLightboxOpen(false);
      setSelectedItem(null);
    },
    onError: (error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  // Tab configuration
  const tabs = useMemo(() => {
    const allCount = items?.length || 0;
    const imageCount = items?.filter(i => i.type === 'image').length || 0;
    const videoCount = items?.filter(i => i.type === 'video').length || 0;
    const websiteCount = items?.filter(i => i.type === 'website').length || 0;

    return [
      { id: 'all' as ContentType, label: 'All', icon: Grid3X3, count: allCount },
      { id: 'image' as ContentType, label: 'Images', icon: ImageIcon, count: imageCount },
      { id: 'video' as ContentType, label: 'Videos', icon: Video, count: videoCount },
      { id: 'website' as ContentType, label: 'Websites', icon: Globe, count: websiteCount },
    ];
  }, [items]);

  // Sort items
  const sortedItems = useMemo(() => {
    if (!items) return [];
    
    const sorted = [...items];
    switch (sortBy) {
      case 'popular':
        return sorted.sort((a, b) => b.views - a.views);
      case 'trending':
        return sorted.sort((a, b) => b.likes - a.likes);
      case 'newest':
      default:
        return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }, [items, sortBy]);

  // Handle item click
  const handleItemClick = (item: GalleryItem) => {
    setSelectedItem(item);
    setIsLightboxOpen(true);
    viewMutation.mutate({ id: item.id });
  };

  // Handle like
  const handleLike = (item: GalleryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    likeMutation.mutate({ id: item.id });
    toast.success('Added to favorites!');
  };

  // Handle download
  const handleDownload = (item: GalleryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.fileUrl) {
      downloadMutation.mutate({ id: item.id });
      window.open(item.fileUrl, '_blank', 'noopener,noreferrer');
      toast.success('Download started!');
    }
  };

  // Handle share
  const handleShare = (item: GalleryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/gallery?item=${item.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard!');
  };

  // Handle delete (admin only)
  const handleDelete = (item: GalleryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${item.title}"?`)) {
      deleteMutation.mutate({ id: item.id });
    }
  };

  // Navigate lightbox
  const navigateLightbox = (direction: 'prev' | 'next') => {
    if (!selectedItem || !sortedItems.length) return;
    const currentIndex = sortedItems.findIndex(i => i.id === selectedItem.id);
    const newIndex = direction === 'prev'
      ? (currentIndex - 1 + sortedItems.length) % sortedItems.length
      : (currentIndex + 1) % sortedItems.length;
    setSelectedItem(sortedItems[newIndex]);
    viewMutation.mutate({ id: sortedItems[newIndex].id });
  };

  // Get type icon
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="w-4 h-4" />;
      case 'video': return <Video className="w-4 h-4" />;
      case 'website': return <Globe className="w-4 h-4" />;
      default: return null;
    }
  };

  // Structured data for SEO
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "SmartAIHub Gallery",
    "description": "Explore AI-generated images, videos, and website demos created with SmartAIHub",
    "url": `${window.location.origin}/gallery`,
    "mainEntity": {
      "@type": "ItemList",
      "numberOfItems": sortedItems.length,
      "itemListElement": sortedItems.slice(0, 10).map((item, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "item": {
          "@type": item.type === 'video' ? 'VideoObject' : item.type === 'website' ? 'WebPage' : 'ImageObject',
          "name": item.title,
          "description": item.description,
          "thumbnailUrl": item.thumbnailUrl || item.fileUrl,
          "dateCreated": item.createdAt,
        }
      }))
    }
  };

  return (
    <>
      <Helmet>
        <title>Gallery - SmartAIHub | AI-Generated Content Showcase</title>
        <meta name="description" content="Explore our gallery of AI-generated images, videos, and website demos. See what's possible with SmartAIHub's advanced AI capabilities." />
        <meta name="keywords" content="AI gallery, AI images, AI videos, website demos, SmartAIHub, AI art, generated content" />
        
        {/* Open Graph */}
        <meta property="og:title" content="Gallery - SmartAIHub" />
        <meta property="og:description" content="Explore AI-generated images, videos, and website demos" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${window.location.origin}/gallery`} />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Gallery - SmartAIHub" />
        <meta name="twitter:description" content="Explore AI-generated images, videos, and website demos" />
        
        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Helmet>

      <div className="min-h-screen bg-background">
        <Navbar />
        
        {/* Back to Dashboard */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-2">
          <a
            href="/dashboard"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Dashboard
          </a>
        </div>

        {/* Hero Section */}
        <section className="relative pt-4 pb-12 overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl" />
          </div>
          
          <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center max-w-3xl mx-auto"
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                <Sparkles className="w-4 h-4" />
                AI-Powered Creations
              </span>
              <h1 className="text-4xl sm:text-5xl font-bold mb-4">
                Explore Our <span className="gradient-text">Gallery</span>
              </h1>
              <p className="text-lg text-muted-foreground">
                Discover stunning AI-generated images, videos, and website demos created with SmartAIHub.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Filters Section */}
        <section className="sticky top-16 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
              {/* Tabs */}
              <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0 w-full lg:w-auto">
                {tabs.map((tab) => (
                  <Button
                    key={tab.id}
                    variant={activeTab === tab.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTab(tab.id)}
                    className="whitespace-nowrap"
                  >
                    <tab.icon className="w-4 h-4 mr-2" />
                    {tab.label}
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-background/20 text-xs">
                      {tab.count}
                    </span>
                  </Button>
                ))}
              </div>

              {/* Search & Sort */}
              <div className="flex gap-3 w-full lg:w-auto">
                <div className="relative flex-1 lg:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search gallery..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-auto min-w-[7rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="popular">Popular</SelectItem>
                    <SelectItem value="trending">Trending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </section>

        {/* Gallery Grid */}
        <section className="py-12">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="text-center py-20">
                <p className="text-muted-foreground">Failed to load gallery items</p>
              </div>
            ) : sortedItems.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <ImageIcon className="w-10 h-10 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No items found</h3>
                <p className="text-muted-foreground">
                  {searchQuery ? 'Try a different search term' : 'Gallery is empty'}
                </p>
              </div>
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              >
                <AnimatePresence mode="popLayout">
                  {sortedItems.map((item) => (
                    <motion.div
                      key={item.id}
                      variants={fadeInUp}
                      layout
                      layoutId={`gallery-item-${item.id}`}
                    >
                      <DashboardCard
                        className="group cursor-pointer overflow-hidden hover:shadow-xl transition-all duration-300"
                        onClick={() => handleItemClick(item)}
                      >
                        {/* Thumbnail */}
                        <div className={`relative ${aspectRatioStyles[item.aspectRatio]} bg-muted overflow-hidden`}>
                          {item.type === 'video' ? (
                            isImageUrl(item.thumbnailUrl) ? (
                              // Has a real image thumbnail — show it instantly, no video loading
                              <img
                                src={item.thumbnailUrl!}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                loading="lazy"
                              />
                            ) : (
                              // No image thumbnail — load video metadata and seek to first frame
                              <VideoThumbnailCard
                                src={item.fileUrl || ''}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                            )
                          ) : (
                            <img
                              src={item.thumbnailUrl || item.fileUrl || '/placeholder.jpg'}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              loading="lazy"
                            />
                          )}
                          
                          {/* Overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          
                          {/* Type Badge */}
                          <div className="absolute top-3 left-3">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 text-white text-xs backdrop-blur-sm">
                              {getTypeIcon(item.type)}
                              <span className="capitalize">{item.type}</span>
                            </span>
                          </div>

                          {/* Duration for videos */}
                          {item.type === 'video' && item.duration && (
                            <div className="absolute bottom-3 right-3">
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-black/70 text-white text-xs">
                                <Clock className="w-3 h-3" />
                                {item.duration}
                              </span>
                            </div>
                          )}

                          {/* Play button for videos */}
                          {item.type === 'video' && (
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                                <Play className="w-8 h-8 text-primary ml-1" />
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex gap-2">
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-8 w-8 bg-white/90 hover:bg-white"
                                onClick={(e) => handleLike(item, e)}
                              >
                                <Heart className="w-4 h-4" />
                              </Button>
                              {item.type === 'image' && (
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  className="h-8 w-8 bg-white/90 hover:bg-white"
                                  onClick={(e) => handleDownload(item, e)}
                                >
                                  <Download className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-8 w-8 bg-white/90 hover:bg-white"
                                onClick={(e) => handleShare(item, e)}
                              >
                                <Share2 className="w-4 h-4" />
                              </Button>
                              {isAdmin && (
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  className="h-8 w-8 bg-red-500/90 hover:bg-red-600 text-white"
                                  onClick={(e) => handleDelete(item, e)}
                                  disabled={deleteMutation.isPending}
                                >
                                  {deleteMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                            {item.type === 'website' && item.demoUrl && (
                              <Button
                                size="sm"
                                className="h-8 bg-white/90 hover:bg-white text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(item.demoUrl!, '_blank', 'noopener,noreferrer');
                                }}
                              >
                                <ExternalLink className="w-4 h-4 mr-1" />
                                Demo
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-4">
                          <h3 className="font-semibold truncate mb-1">{item.title}</h3>

                          {/* Author */}
                          {item.authorName && (
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center text-white text-xs">
                                {item.authorName.charAt(0)}
                              </div>
                              <span className="text-sm text-muted-foreground truncate">
                                {item.authorName}
                              </span>
                            </div>
                          )}

                          {/* Model */}
                          {item.model && (
                            <div className="flex items-center gap-1 mb-2 text-xs text-muted-foreground">
                              <Cpu className="w-3 h-3" />
                              <span className="truncate">{item.model}</span>
                            </div>
                          )}

                          {/* Stats */}
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Eye className="w-4 h-4" />
                              {formatNumber(item.views)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Heart className="w-4 h-4" />
                              {formatNumber(item.likes)}
                            </span>
                            {item.type === 'image' && (
                              <span className="flex items-center gap-1">
                                <Download className="w-4 h-4" />
                                {formatNumber(item.downloads)}
                              </span>
                            )}
                          </div>
                        </div>
                      </DashboardCard>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </section>

        {/* Lightbox */}
        <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
          <DialogContent className="sm:max-w-6xl w-[95vw] h-[92vh] p-0 overflow-hidden flex flex-col">
            {selectedItem && (
              <>
                {/* Media area — fills all available vertical space */}
                <div className="relative flex-1 min-h-0 bg-black flex items-center justify-center overflow-hidden">
                  {/* Prev / Next navigation */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white"
                    onClick={() => navigateLightbox('prev')}
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white"
                    onClick={() => navigateLightbox('next')}
                  >
                    <ChevronRight className="w-6 h-6" />
                  </Button>

                  {selectedItem.type === 'video' ? (
                    <video
                      key={selectedItem.id}
                      src={selectedItem.fileUrl || ''}
                      controls
                      autoPlay
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src={selectedItem.fileUrl || selectedItem.thumbnailUrl || ''}
                      alt={selectedItem.title}
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>

                {/* Info panel — fixed height with scroll so media stays large */}
                <div className="flex-shrink-0 h-[180px] max-h-[35vh] overflow-y-auto px-5 py-3 bg-background border-t">
                  {/* Title + actions row */}
                  <div className="flex items-start justify-between gap-3">
                    <DialogHeader className="min-w-0 flex-1">
                      <DialogTitle className="text-sm font-semibold leading-snug">
                        {selectedItem.title}
                      </DialogTitle>
                    </DialogHeader>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={(e) => handleLike(selectedItem, e)}>
                        <Heart className="w-3.5 h-3.5 mr-1" />
                        <span className="text-xs">{formatNumber(selectedItem.likes)}</span>
                      </Button>
                      {selectedItem.type === 'image' && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => handleDownload(selectedItem, e)}>
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => handleShare(selectedItem, e)}>
                        <Share2 className="w-3.5 h-3.5" />
                      </Button>
                      {selectedItem.type === 'website' && selectedItem.demoUrl && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => window.open(selectedItem.demoUrl!, '_blank', 'noopener,noreferrer')}>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={(e) => handleDelete(selectedItem, e)} disabled={deleteMutation.isPending}>
                          {deleteMutation.isPending
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
                    {selectedItem.model && (
                      <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{selectedItem.model}</span>
                    )}
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(selectedItem.createdAt)}</span>
                    <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatNumber(selectedItem.views)}</span>
                    {selectedItem.authorName && (
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{selectedItem.authorName}</span>
                    )}
                  </div>

                  {/* Description / Prompt — full text, copyable */}
                  {selectedItem.description && (
                    <div className="mt-2 group/desc relative">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                          {selectedItem.description}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs flex-shrink-0 mt-0.5"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedItem.description!);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                        >
                          {copied
                            ? <><Check className="w-3 h-3 mr-1 text-green-500" />Copied</>
                            : <><Copy className="w-3 h-3 mr-1" />Copy</>}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {selectedItem.tags && selectedItem.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selectedItem.tags.map((tag, index) => (
                        <span key={index} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs">
                          <Tag className="w-2.5 h-2.5" />{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Footer />
      </div>
    </>
  );
}
