/**
 * Blog Page - Tenant-aware blog listing
 * Fetches posts from API, falls back to empty state
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Seo } from '@/components/Seo';
import { isVideoMediaUrl } from '@/lib/media';
import {
  Calendar,
  Clock,
  ArrowRight,
  Sparkles,
  ChevronRight,
  BookOpen,
} from 'lucide-react';

interface BlogPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  coverImage: string;
  author: string;
  authorAvatar: string;
  category: string;
  tags: string[];
  readTime: string;
  isFeatured: boolean;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  publishedAt: string;
  createdAt: string;
}

const categories = ['All', 'Product Update', 'Tutorial', 'Guide', 'Security', 'SEO', 'News'];
const topicClusters = [
  'Skill marketplace SEO',
  'Workflow automation',
  'Swarm orchestration',
  'Chat, presentation, video',
  'FAQ and long-tail keywords',
  'Image and video pipelines',
  'Enterprise governance',
];
const relatedHubs = [
  { href: '/resources', label: 'Site Index', description: 'Navigate the full public content graph.' },
  { href: '/docs/seo/ai-search-optimization', label: 'AI Search Optimization', description: 'Tune each page for a different search intent.' },
  { href: '/docs/content/factory', label: 'Content Factory', description: 'Generate docs, FAQ, and blog pages at scale.' },
  { href: '/docs/faq/marketplace', label: 'Marketplace FAQ', description: 'Target discovery, publishing, and governance questions.' },
];

export default function Blog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    fetch('/api/blog/posts', { credentials: 'include' })
      .then((res) => res.ok ? res.json() : { posts: [] })
      .then((data) => setPosts(data.posts || []))
      .catch(() => setPosts([]))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredPosts = selectedCategory === 'All'
    ? posts
    : posts.filter(post => post.category === selectedCategory);

  const featuredPost = posts.find(post => post.isFeatured);
  const regularPosts = filteredPosts.filter(post => !post.isFeatured);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
      <Seo
        title="SmartAIHub Blog | Product Updates, Tutorials & Security"
        description="Read SmartAIHub product updates, tutorials, security notes, and guides for skill marketplaces and workflow swarms."
        keywords={["SmartAIHub blog", "product updates", "tutorials", "security", "workflow swarms"]}
        canonicalPath="/blog"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "SmartAIHub Blog",
          description: "Product updates and tutorials for SmartAIHub.",
          url: "/blog",
        }}
      />
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4">
        <div className="container max-w-6xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-blue-100 text-sm text-blue-600 mb-6">
              <Sparkles className="w-4 h-4" />
              Blog
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
              Latest{' '}
              <span className="bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-400 bg-clip-text text-transparent">
                Posts
              </span>
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              News, tutorials, and updates covering skill marketplaces, workflow automation,
              swarm execution, and output delivery for enterprise teams.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {topicClusters.map((cluster) => (
                <span
                  key={cluster}
                  className="rounded-full border border-blue-100 bg-white/70 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm backdrop-blur"
                >
                  {cluster}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <section className="py-16 px-4">
          <div className="container max-w-2xl mx-auto text-center">
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg p-12">
              <BookOpen className="w-16 h-16 mx-auto mb-6 text-gray-300" />
              <h2 className="text-2xl font-bold text-gray-900 mb-3">No Posts Yet</h2>
              <p className="text-gray-500">Blog posts will appear here once published. Check back soon!</p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="px-4 pb-4">
            <div className="container max-w-6xl mx-auto">
              <div className="rounded-3xl border border-white/60 bg-white/70 backdrop-blur-xl p-6 shadow-lg shadow-blue-500/5">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Search intent</p>
                    <p className="mt-2 text-sm text-gray-600">Each post targets a distinct cluster: marketplace, workflows, swarms, outputs, or governance.</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Why it matters</p>
                    <p className="mt-2 text-sm text-gray-600">That gives SmartAIHub more surface area to rank across product, how-to, and enterprise search terms.</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Coverage</p>
                    <p className="mt-2 text-sm text-gray-600">Posts are optimized for AI answers, featured snippets, and long-tail discovery.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="px-4 py-6">
            <div className="container max-w-6xl mx-auto">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {relatedHubs.map((link) => (
                  <Link key={link.href} href={link.href}>
                    <div className="h-full rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl p-5 shadow-lg shadow-blue-500/5 hover:shadow-xl hover:shadow-blue-500/10 transition-all group">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600 mb-2">Related Hub</p>
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{link.label}</h3>
                        <p className="mt-2 text-sm text-gray-600 leading-6">{link.description}</p>
                        <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-600">
                          Open hub
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* Category Filter */}
          <section className="py-4 px-4">
            <div className="container max-w-6xl mx-auto">
              <div className="flex flex-wrap gap-2 justify-center">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                      selectedCategory === category
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-md'
                        : 'bg-white/60 text-gray-600 hover:bg-white hover:text-gray-900 border border-white/50'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Featured Post */}
          {featuredPost && selectedCategory === 'All' && (
            <section className="py-8 px-4">
              <div className="container max-w-6xl mx-auto">
                <Link href={`/blog/${featuredPost.slug}`}>
                  <motion.article
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white/50 shadow-xl shadow-blue-500/10 overflow-hidden cursor-pointer hover:shadow-2xl transition-shadow"
                  >
                    <div className="grid md:grid-cols-2 gap-0">
                      {featuredPost.coverImage && (
                        <div className="relative h-64 md:h-auto">
                          {isVideoMediaUrl(featuredPost.coverImage) ? (
                            <video
                              src={featuredPost.coverImage}
                              controls
                              className="absolute inset-0 w-full h-full object-cover bg-black"
                            />
                          ) : (
                            <img
                              src={featuredPost.coverImage}
                              alt={featuredPost.title}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          )}
                          <div className="absolute top-4 left-4">
                            <span className="px-3 py-1 bg-gradient-to-r from-blue-500 to-cyan-400 text-white text-xs font-semibold rounded-full">
                              Featured
                            </span>
                          </div>
                        </div>
                      )}
                      <div className="p-8 flex flex-col justify-center">
                        <div className="flex items-center gap-4 mb-4">
                          {featuredPost.category && (
                            <span className="px-3 py-1 bg-blue-100 text-blue-600 text-xs font-medium rounded-full">
                              {featuredPost.category}
                            </span>
                          )}
                          {featuredPost.publishedAt && (
                            <span className="text-sm text-gray-500 flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(featuredPost.publishedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                          {featuredPost.title}
                        </h2>
                        <p className="text-gray-600 mb-6">{featuredPost.excerpt}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {featuredPost.authorAvatar && (
                              <img src={featuredPost.authorAvatar} alt={featuredPost.author} className="w-10 h-10 rounded-full object-cover" />
                            )}
                            <div>
                              <p className="font-medium text-gray-900">{featuredPost.author}</p>
                              {featuredPost.readTime && <p className="text-sm text-gray-500">{featuredPost.readTime}</p>}
                            </div>
                          </div>
                          <Button className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white">
                            Read More
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.article>
                </Link>
              </div>
            </section>
          )}

          {/* Blog Posts Grid */}
          <section className="py-8 px-4 pb-20">
            <div className="container max-w-6xl mx-auto">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {regularPosts.map((post, index) => (
                  <Link key={post.id} href={`/blog/${post.slug}`}>
                    <motion.article
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-blue-500/5 overflow-hidden hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300 group cursor-pointer h-full"
                    >
                      {post.coverImage && (
                        <div className="relative h-48 overflow-hidden">
                          {isVideoMediaUrl(post.coverImage) ? (
                            <video
                              src={post.coverImage}
                              controls
                              className="w-full h-full object-cover bg-black group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <img
                              src={post.coverImage}
                              alt={post.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          )}
                          {post.category && (
                            <div className="absolute top-4 left-4">
                              <span className="px-3 py-1 bg-white/90 backdrop-blur-sm text-blue-600 text-xs font-medium rounded-full">
                                {post.category}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="p-6">
                        <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                          {post.publishedAt && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(post.publishedAt).toLocaleDateString()}
                            </span>
                          )}
                          {post.readTime && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {post.readTime}
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
                          {post.title}
                        </h3>
                        <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                          {post.excerpt}
                        </p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {post.authorAvatar && (
                              <img src={post.authorAvatar} alt={post.author} className="w-8 h-8 rounded-full object-cover" />
                            )}
                            <span className="text-sm text-gray-600">{post.author}</span>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                        </div>
                      </div>
                    </motion.article>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      <Footer />
    </div>
  );
}
