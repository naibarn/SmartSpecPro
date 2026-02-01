/**
 * Individual Blog Post Page
 * Fetches and displays a single blog post by slug
 */

import { useState, useEffect, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { motion } from 'framer-motion';
import { Link, useRoute } from 'wouter';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Tag,
  User,
} from 'lucide-react';

interface BlogPostData {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string;
  author: string;
  authorAvatar: string;
  category: string;
  tags: string[];
  readTime: string;
  publishedAt: string;
}

export default function BlogPost() {
  const [, params] = useRoute('/blog/:slug');
  const slug = params?.slug || '';
  const [post, setPost] = useState<BlogPostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/blog/posts/${slug}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data) => {
        setPost(data.post);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-32 text-center">
          <h1 className="text-3xl font-bold mb-4">Post Not Found</h1>
          <p className="text-muted-foreground mb-8">The blog post you're looking for doesn't exist.</p>
          <Link href="/blog" className="text-primary hover:underline">
            Back to Blog
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-8">
        <div className="container max-w-4xl mx-auto px-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Link href="/blog" className="inline-flex items-center gap-1 text-sm text-purple-600 hover:underline no-underline mb-6">
              <ArrowLeft className="w-4 h-4" />
              Back to Blog
            </Link>

            {post.category && (
              <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full mb-4">
                {post.category}
              </span>
            )}

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
              {post.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-8">
              {post.author && (
                <div className="flex items-center gap-2">
                  {post.authorAvatar ? (
                    <img src={post.authorAvatar} alt={post.author} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                  <span>{post.author}</span>
                </div>
              )}
              {post.publishedAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(post.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              )}
              {post.readTime && (
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {post.readTime}
                </span>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Cover Image */}
      {post.coverImage && (
        <section className="pb-8">
          <div className="container max-w-4xl mx-auto px-4">
            <motion.img
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              src={post.coverImage}
              alt={post.title}
              className="w-full h-64 sm:h-80 lg:h-96 object-cover rounded-2xl shadow-lg"
            />
          </div>
        </section>
      )}

      {/* Content */}
      <section className="pb-16">
        <div className="container max-w-4xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg p-6 sm:p-8 lg:p-10">
              <div
                className="prose prose-lg max-w-none
                  prose-headings:font-bold prose-headings:text-gray-900
                  prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4
                  prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3
                  prose-p:text-gray-600 prose-p:leading-relaxed
                  prose-li:text-gray-600
                  prose-strong:text-gray-900
                  prose-a:text-purple-600 prose-a:no-underline hover:prose-a:underline
                  prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
                  prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-xl
                  prose-img:rounded-xl prose-img:shadow-lg
                  prose-blockquote:border-purple-500 prose-blockquote:bg-purple-50/50 prose-blockquote:rounded-r-lg prose-blockquote:py-1"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content || '', { ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','a','ul','ol','li','strong','em','b','i','code','pre','blockquote','img','br','hr','span','div','table','thead','tbody','tr','th','td'], ALLOWED_ATTR: ['href','src','alt','class','target','rel','id'] }) }}
              />
            </div>

            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-6">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/70 border border-gray-200 rounded-full text-xs text-gray-600"
                  >
                    <Tag className="w-3 h-3" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
