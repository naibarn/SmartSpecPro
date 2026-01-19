/**
 * SmartSpecWeb Marketplace - Public Browse Page
 * SEO-optimized marketplace homepage
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
  Search,
  Filter,
  Star,
  Download,
  Eye,
  ExternalLink,
  Package,
  TrendingUp,
  Award,
} from 'lucide-react';

// API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

interface MarketplaceTemplate {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  category: string;
  tags: string[];
  tech_stack: string[];
  price_credits: number;
  is_featured: boolean;
  preview_images: string[];
  demo_video_url?: string;
  download_count: number;
  purchase_count: number;
  rating_average?: number;
  rating_count: number;
  view_count: number;
  created_at: string;
  published_at?: string;
}

interface TemplateListResponse {
  templates: MarketplaceTemplate[];
  total: number;
  limit: number;
  offset: number;
}

const CATEGORIES = [
  { value: 'image_generation', label: 'Image Generation', icon: '🖼️' },
  { value: 'video_generation', label: 'Video Generation', icon: '🎬' },
  { value: 'audio_generation', label: 'Audio Generation', icon: '🎵' },
  { value: 'media_suite', label: 'Media Suite', icon: '🎨' },
  { value: 'ai_features', label: 'AI Features', icon: '🤖' },
  { value: 'ui_components', label: 'UI Components', icon: '🧩' },
  { value: 'backend_services', label: 'Backend Services', icon: '⚙️' },
  { value: 'full_stack', label: 'Full Stack', icon: '🚀' },
  { value: 'integrations', label: 'Integrations', icon: '🔌' },
  { value: 'utilities', label: 'Utilities', icon: '🔧' },
];

export default function MarketplacePage() {
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [featured, setFeatured] = useState<MarketplaceTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortBy, setSortBy] = useState('popular');

  useEffect(() => {
    loadTemplates();
    loadFeatured();
  }, [search, selectedCategory, sortBy]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort_by: sortBy,
        limit: '20',
        offset: '0',
      });

      if (search) params.append('search', search);
      if (selectedCategory) params.append('category', selectedCategory);

      const response = await fetch(`${API_BASE_URL}/api/v1/marketplace/templates?${params}`);
      const data: TemplateListResponse = await response.json();

      setTemplates(data.templates);
      setTotal(data.total);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFeatured = async () => {
    try {
      // Featured templates are returned with is_featured=true, get first few
      const response = await fetch(
        `${API_BASE_URL}/api/v1/marketplace/templates?sort_by=popular&limit=6`
      );
      const data: TemplateListResponse = await response.json();
      setFeatured(data.templates.filter(t => t.is_featured).slice(0, 3));
    } catch (error) {
      console.error('Failed to load featured:', error);
    }
  };

  const openInDesktopApp = (templateId: string) => {
    // Deep link to desktop app
    window.location.href = `smartspec://marketplace/template/${templateId}`;
  };

  return (
    <>
      <Head>
        <title>SmartSpec Marketplace - Discover Templates for Rapid Development</title>
        <meta
          name="description"
          content="Browse and purchase high-quality templates for image generation, video creation, AI features, and more. Build faster with ready-to-use code templates."
        />
        <meta name="keywords" content="templates, code marketplace, image generation, video generation, AI, React, TypeScript" />
        <meta property="og:title" content="SmartSpec Marketplace" />
        <meta property="og:description" content="Discover premium templates for rapid development" />
        <meta property="og:type" content="website" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Hero Section */}
        <section className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-5xl font-bold mb-4">
                SmartSpec Marketplace
              </h1>
              <p className="text-xl mb-8 opacity-90">
                Discover and purchase high-quality templates to accelerate your development
              </p>
              <div className="flex gap-4 justify-center">
                <a
                  href="smartspec://marketplace"
                  className="px-6 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100 transition-colors flex items-center gap-2"
                >
                  <ExternalLink className="w-5 h-5" />
                  Open in Desktop App
                </a>
                <a
                  href="#browse"
                  className="px-6 py-3 bg-white/20 backdrop-blur rounded-lg font-semibold hover:bg-white/30 transition-colors"
                >
                  Browse Templates
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Featured Templates */}
        {featured.length > 0 && (
          <section className="py-12 bg-white">
            <div className="container mx-auto px-4">
              <div className="flex items-center gap-2 mb-6">
                <Award className="w-6 h-6 text-yellow-500" />
                <h2 className="text-2xl font-bold">Featured Templates</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {featured.map(template => (
                  <FeaturedCard
                    key={template.id}
                    template={template}
                    onOpenInApp={() => openInDesktopApp(template.id)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Main Content */}
        <section id="browse" className="py-12">
          <div className="container mx-auto px-4">
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Sidebar - Filters */}
              <aside className="lg:w-64 flex-shrink-0">
                <div className="bg-white rounded-lg shadow p-6 sticky top-4">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Filter className="w-5 h-5" />
                    Filters
                  </h3>

                  {/* Categories */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-600 mb-2">Category</h4>
                    <div className="space-y-1">
                      <button
                        onClick={() => setSelectedCategory('')}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                          !selectedCategory
                            ? 'bg-blue-100 text-blue-700'
                            : 'hover:bg-gray-100'
                        }`}
                      >
                        All Categories
                      </button>
                      {CATEGORIES.map(cat => (
                        <button
                          key={cat.value}
                          onClick={() => setSelectedCategory(cat.value)}
                          className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                            selectedCategory === cat.value
                              ? 'bg-blue-100 text-blue-700'
                              : 'hover:bg-gray-100'
                          }`}
                        >
                          <span>{cat.icon}</span>
                          <span>{cat.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sort */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-2">Sort By</h4>
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="popular">Most Popular</option>
                      <option value="recent">Recently Added</option>
                      <option value="rating">Highest Rated</option>
                      <option value="price_low">Price: Low to High</option>
                      <option value="price_high">Price: High to Low</option>
                    </select>
                  </div>
                </div>
              </aside>

              {/* Main Content */}
              <main className="flex-1">
                {/* Search */}
                <div className="mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search templates..."
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Results */}
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full" />
                  </div>
                ) : templates.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-12 text-center">
                    <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No templates found</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-4 text-sm text-gray-600">
                      {total} templates found
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {templates.map(template => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          onOpenInApp={() => openInDesktopApp(template.id)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </main>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-4">
              Ready to Build Faster?
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Download SmartSpec Desktop App and start using templates today
            </p>
            <a
              href="https://github.com/naibarn/SmartSpecPro/releases"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              <Download className="w-5 h-5" />
              Download Desktop App
            </a>
          </div>
        </section>
      </div>
    </>
  );
}

// Featured Card Component
function FeaturedCard({
  template,
  onOpenInApp,
}: {
  template: MarketplaceTemplate;
  onOpenInApp: () => void;
}) {
  return (
    <div className="group relative bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl p-6 text-white hover:shadow-xl transition-shadow">
      <div className="absolute top-4 right-4">
        <Award className="w-6 h-6 text-yellow-300" />
      </div>
      <div className="mb-4">
        <h3 className="text-xl font-bold mb-2">{template.name}</h3>
        <p className="text-sm opacity-90">{template.tagline}</p>
      </div>
      <div className="flex items-center gap-4 text-sm opacity-90 mb-4">
        <span className="flex items-center gap-1">
          <Download className="w-4 h-4" />
          {template.purchase_count}
        </span>
        {template.rating_average && (
          <span className="flex items-center gap-1">
            <Star className="w-4 h-4 fill-current" />
            {template.rating_average.toFixed(1)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <div className="text-2xl font-bold">
          {template.price_credits.toLocaleString()} credits
        </div>
        <button
          onClick={onOpenInApp}
          className="px-4 py-2 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
        >
          View
        </button>
      </div>
    </div>
  );
}

// Template Card Component
function TemplateCard({
  template,
  onOpenInApp,
}: {
  template: MarketplaceTemplate;
  onOpenInApp: () => void;
}) {
  const categoryIcon = CATEGORIES.find(c => c.value === template.category)?.icon || '📦';

  return (
    <Link
      href={`/marketplace/${template.slug}`}
      className="block bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden"
    >
      <div className="relative h-48 bg-gradient-to-br from-blue-500 to-purple-600">
        {template.preview_images[0] ? (
          <img
            src={template.preview_images[0]}
            alt={template.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white text-6xl">
            {categoryIcon}
          </div>
        )}
        {template.is_featured && (
          <div className="absolute top-2 right-2 bg-yellow-500 text-white px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
            <Award className="w-3 h-3" />
            Featured
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-lg mb-1 line-clamp-1">{template.name}</h3>
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{template.tagline}</p>
        <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
          <span className="flex items-center gap-1">
            <Download className="w-3 h-3" />
            {template.purchase_count}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {template.view_count}
          </span>
          {template.rating_average && (
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
              {template.rating_average.toFixed(1)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xl font-bold text-blue-600">
            {template.price_credits.toLocaleString()}
            <span className="text-xs text-gray-500 ml-1">credits</span>
          </div>
          <button
            onClick={e => {
              e.preventDefault();
              onOpenInApp();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors flex items-center gap-1"
          >
            <ExternalLink className="w-4 h-4" />
            Open
          </button>
        </div>
      </div>
    </Link>
  );
}
