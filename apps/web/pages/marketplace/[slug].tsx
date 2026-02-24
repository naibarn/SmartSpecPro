/**
 * SmartAIHub Marketplace - Template Detail Page
 * SEO-optimized individual template pages
 */

import { GetStaticProps, GetStaticPaths } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  Eye,
  Star,
  ExternalLink,
  Package,
  Check,
  Award,
  TrendingUp,
} from 'lucide-react';

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
  version: string;
  readme_content?: string;
  min_smartspec_version?: string;
  dependencies?: string[];
  download_count: number;
  purchase_count: number;
  rating_average?: number;
  rating_count: number;
  view_count: number;
  created_at: string;
  published_at?: string;
}

interface Props {
  template: MarketplaceTemplate | null;
}

export default function TemplateDetailPage({ template }: Props) {
  if (!template) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Template Not Found</h1>
          <Link href="/marketplace" className="text-blue-600 hover:underline">
            Back to Marketplace
          </Link>
        </div>
      </div>
    );
  }

  const openInDesktopApp = () => {
    window.location.href = `smartaihub://marketplace/template/${template.id}`;
  };

  const creatorRevenue = Math.floor(template.price_credits * 0.85);
  const platformCommission = template.price_credits - creatorRevenue;

  return (
    <>
      <Head>
        <title>{template.name} - SmartAIHub Marketplace</title>
        <meta name="description" content={template.tagline} />
        <meta name="keywords" content={template.tags.join(', ')} />
        <meta property="og:title" content={template.name} />
        <meta property="og:description" content={template.tagline} />
        {template.preview_images[0] && (
          <meta property="og:image" content={template.preview_images[0]} />
        )}
        <meta property="og:type" content="product" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Link
                href="/marketplace"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Marketplace
              </Link>
              <button
                onClick={openInDesktopApp}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <ExternalLink className="w-5 h-5" />
                Open in Desktop App
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Title & Meta */}
              <div>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">
                      {template.name}
                    </h1>
                    <p className="text-xl text-gray-600">{template.tagline}</p>
                  </div>
                  {template.is_featured && (
                    <div className="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold">
                      <Award className="w-4 h-4" />
                      Featured
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-6 text-sm text-gray-500 mt-4">
                  <span className="flex items-center gap-1">
                    <Download className="w-4 h-4" />
                    {template.purchase_count.toLocaleString()} purchases
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-4 h-4" />
                    {template.view_count.toLocaleString()} views
                  </span>
                  {template.rating_average && (
                    <span className="flex items-center gap-1">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      {template.rating_average.toFixed(1)} ({template.rating_count} reviews)
                    </span>
                  )}
                </div>
              </div>

              {/* Preview Images/Video */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                {template.demo_video_url ? (
                  <div className="aspect-video">
                    <iframe
                      src={template.demo_video_url}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : template.preview_images.length > 0 ? (
                  <img
                    src={template.preview_images[0]}
                    alt={template.name}
                    className="w-full"
                  />
                ) : (
                  <div className="aspect-video bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-8xl">
                    📦
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-2xl font-bold mb-4">Description</h2>
                <div className="prose max-w-none">
                  {template.description}
                </div>
              </div>

              {/* README */}
              {template.readme_content && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-2xl font-bold mb-4">Documentation</h2>
                  <div className="prose max-w-none">
                    <pre className="whitespace-pre-wrap">{template.readme_content}</pre>
                  </div>
                </div>
              )}

              {/* Tech Stack */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-2xl font-bold mb-4">Tech Stack</h2>
                <div className="flex flex-wrap gap-2">
                  {template.tech_stack.map(tech => (
                    <span
                      key={tech}
                      className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg font-medium"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>

              {/* Tags */}
              {template.tags.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-2xl font-bold mb-4">Tags</h2>
                  <div className="flex flex-wrap gap-2">
                    {template.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Purchase Card */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow p-6 sticky top-24">
                {/* Price */}
                <div className="mb-6">
                  <div className="text-4xl font-bold text-blue-600 mb-2">
                    {template.price_credits.toLocaleString()}
                    <span className="text-lg text-gray-500 ml-2">credits</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <div>Creator receives: {creatorRevenue.toLocaleString()} credits (85%)</div>
                    <div>Platform: {platformCommission.toLocaleString()} credits (15%)</div>
                  </div>
                </div>

                {/* CTA Button */}
                <button
                  onClick={openInDesktopApp}
                  className="w-full px-6 py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 mb-4"
                >
                  <ExternalLink className="w-5 h-5" />
                  Purchase in Desktop App
                </button>

                <p className="text-xs text-gray-500 text-center mb-6">
                  Opens in SmartAIHub Desktop App
                </p>

                {/* Features */}
                <div className="space-y-3 mb-6">
                  <h3 className="font-semibold text-gray-900">What's included:</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-green-500" />
                      Complete source code
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-green-500" />
                      Ready-to-use templates
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-green-500" />
                      Documentation & examples
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-green-500" />
                      Future updates (v{template.version})
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-green-500" />
                      Commercial license
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Template Stats</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Version</span>
                      <span className="font-medium">v{template.version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Purchases</span>
                      <span className="font-medium">{template.purchase_count.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Downloads</span>
                      <span className="font-medium">{template.download_count.toLocaleString()}</span>
                    </div>
                    {template.min_smartspec_version && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Requires</span>
                        <span className="font-medium">SmartAIHub v{template.min_smartspec_version}+</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Download Desktop App */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-3">Don't have SmartAIHub yet?</p>
                  <a
                    href="https://smartaihub.app/download"
                    className="block w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-center hover:bg-gray-50 transition-colors"
                  >
                    Download Desktop App
                  </a>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Related Templates */}
        <section className="bg-white border-t border-gray-200 py-12">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl font-bold mb-6">More from this category</h2>
            <p className="text-gray-600">
              Browse more templates in <span className="font-semibold">{template.category}</span> category
            </p>
            <Link
              href={`/marketplace?category=${template.category}`}
              className="inline-flex items-center gap-2 mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <TrendingUp className="w-5 h-5" />
              Explore Category
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

// Static Site Generation for SEO
export const getStaticPaths: GetStaticPaths = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/marketplace/templates?limit=100`);
    const data = await response.json();

    const paths = data.templates.map((template: MarketplaceTemplate) => ({
      params: { slug: template.slug },
    }));

    return {
      paths,
      fallback: 'blocking', // Generate pages on-demand if not pre-built
    };
  } catch (error) {
    return {
      paths: [],
      fallback: 'blocking',
    };
  }
};

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  try {
    // In production, you'd fetch by slug. For now, we'll need to fetch all and filter
    const response = await fetch(`${API_BASE_URL}/api/v1/marketplace/templates?limit=1000`);
    const data = await response.json();

    const template = data.templates.find((t: MarketplaceTemplate) => t.slug === params?.slug);

    if (!template) {
      return {
        notFound: true,
      };
    }

    return {
      props: {
        template,
      },
      revalidate: 60, // Revalidate every 60 seconds
    };
  } catch (error) {
    return {
      notFound: true,
    };
  }
};
