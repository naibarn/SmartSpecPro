/**
 * Marketplace Page — Public Agent Skills showcase
 * Browse, search, like, share, and comment on skills
 */
import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DashboardCard } from "@/components/dashboard";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Heart,
  Share2,
  MessageCircle,
  Send,
  Trash2,
  Loader2,
  Sparkles,
  Bot,
  Image,
  Video,
  Music,
  Code2,
  FileText,
  Globe,
  BarChart3,
  Languages,
  Zap,
  Lightbulb,
  Settings2,
  X,
} from "lucide-react";
import { toast } from "sonner";

const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 },
};

const CATEGORIES = [
  { value: "all", label: "All Skills" },
  { value: "image_generation", label: "Image Generation" },
  { value: "image_prompt_generation", label: "Create Prompt for Image Generation" },
  { value: "video_generation", label: "Video Generation" },
  { value: "video_prompt_generation", label: "Create Prompt for Video Generation" },
  { value: "audio_generation", label: "Audio / TTS" },
  { value: "audio_prompt_generation", label: "Create Prompt for Audio Generation" },
  { value: "article_generation", label: "Article Generation" },
  { value: "slide_generation", label: "Slide Generation" },
  { value: "sound_effects", label: "Sound Effects" },
  { value: "prompt_enhancement", label: "Prompt Enhancement" },
  { value: "code_assistant", label: "Code Assistant" },
  { value: "document_analysis", label: "Document Analysis" },
  { value: "web_search", label: "Web Search" },
  { value: "data_analysis", label: "Data Analysis" },
  { value: "translation", label: "Translation" },
  { value: "summarization", label: "Summarization" },
  { value: "chat_assistant", label: "Chat Assistant" },
  { value: "automation", label: "Automation" },
  { value: "other", label: "Other" },
];

const CATEGORY_ICONS: Record<string, any> = {
  image_generation: Image,
  image_prompt_generation: Sparkles,
  video_generation: Video,
  video_prompt_generation: Sparkles,
  audio_generation: Music,
  audio_prompt_generation: Sparkles,
  article_generation: FileText,
  slide_generation: FileText,
  sound_effects: Music,
  prompt_enhancement: Sparkles,
  code_assistant: Code2,
  document_analysis: FileText,
  web_search: Globe,
  data_analysis: BarChart3,
  translation: Languages,
  summarization: FileText,
  chat_assistant: Bot,
  automation: Zap,
  other: Settings2,
};

export default function Marketplace() {
  const { isAuthenticated, user } = useAuth();
  const [, params] = useRoute("/marketplace/:slug");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(params?.slug || null);

  // Open dialog from URL param
  useEffect(() => {
    if (params?.slug) setSelectedSlug(params.slug);
  }, [params?.slug]);

  const { data, isLoading } = trpc.marketplace.list.useQuery({
    category: category === "all" ? undefined : category,
    search: search || undefined,
    limit: 100,
  });

  const skills = data?.skills || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
      <Seo
        title="SmartAIHub Marketplace | Enterprise Skill Catalog"
        description="Browse, search, and reuse enterprise AI skills for chat, presentation, video, automation, translation, and more."
        keywords={["SmartAIHub marketplace", "AI skills", "enterprise skill catalog", "workflow skills", "automation", "video generation", "chat assistant"]}
        canonicalPath="/marketplace"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "SmartAIHub Marketplace",
          description: "Marketplace for reusable enterprise AI skills.",
          url: "/marketplace",
        }}
      />
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl" />
          <div className="absolute top-40 right-1/4 w-80 h-80 bg-cyan-200/30 rounded-full blur-3xl" />
        </div>
        <div className="px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div {...fadeInUp} className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-700 text-sm font-medium mb-6">
              <Lightbulb className="h-4 w-4" />
              Agent Skills Marketplace
            </div>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 bg-clip-text text-transparent mb-4">
              Discover AI Agent Skills
            </h1>
            <p className="text-lg text-gray-600 mb-8">
              Browse our collection of powerful AI skills — from image generation to code assistance,
              automation, and more. Each skill enhances your AI agent with specialized capabilities.
            </p>
          </motion.div>

          {/* Search & Filter */}
          <motion.div
            {...fadeInUp}
            className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-3"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search skills..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-11 bg-white/80 backdrop-blur border-gray-200"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-48 h-11 bg-white/80 backdrop-blur border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </motion.div>
        </div>
      </section>

      {/* Skills Grid */}
      <section className="px-4 sm:px-6 lg:px-8 pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : skills.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg">No skills found</p>
            <p className="text-sm mt-1">Try a different search or category</p>
          </div>
        ) : (
          <motion.div
            initial="initial"
            animate="animate"
            variants={{ animate: { transition: { staggerChildren: 0.05 } } }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {skills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                onClick={() => {
                  setSelectedSlug(skill.slug);
                  window.history.replaceState(null, "", `/marketplace/${skill.slug}`);
                }}
              />
            ))}
          </motion.div>
        )}

        <div className="text-center mt-8 text-sm text-gray-400">
          {data?.total || 0} skill{(data?.total || 0) !== 1 ? "s" : ""} available
        </div>
      </section>

      {/* Skill Detail Dialog */}
      <AnimatePresence>
        {selectedSlug && (
          <SkillDetailDialog
            slug={selectedSlug}
            open={!!selectedSlug}
            onClose={() => {
              setSelectedSlug(null);
              window.history.replaceState(null, "", "/marketplace");
            }}
            isAuthenticated={isAuthenticated}
            userId={user?.id}
            isAdmin={user?.role === "admin"}
          />
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}

function SkillCard({ skill, onClick }: { skill: any; onClick: () => void }) {
  const IconComponent = CATEGORY_ICONS[skill.category] || Sparkles;
  const categoryLabel = CATEGORIES.find((c) => c.value === skill.category)?.label || skill.category;

  return (
    <motion.div
      variants={{
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
      }}
    >
      <DashboardCard
        className="group cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-gray-200/80 bg-white/80 backdrop-blur"
        onClick={onClick}
      >
        <div className="p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white shrink-0">
              <IconComponent className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                {skill.name}
              </h3>
              <Badge variant="secondary" className="text-[10px] mt-0.5">
                {categoryLabel}
              </Badge>
            </div>
          </div>

          <p className="text-sm text-gray-600 line-clamp-2 mb-3 min-h-[40px]">
            {skill.description || "No description available"}
          </p>

          {/* Tags */}
          {skill.tags && skill.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {(skill.tags as string[]).slice(0, 3).map((tag: string) => (
                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
              {(skill.tags as string[]).length > 3 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  +{(skill.tags as string[]).length - 3}
                </Badge>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Heart className="h-3 w-3" />
                {skill.likeCount}
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                {skill.commentCount}
              </span>
            </div>
            <span>{skill.author || "SmartAIHub"}</span>
          </div>
        </div>
      </DashboardCard>
    </motion.div>
  );
}

function SkillDetailDialog({
  slug,
  open,
  onClose,
  isAuthenticated,
  userId,
  isAdmin,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  userId?: number;
  isAdmin?: boolean;
}) {
  const utils = trpc.useUtils();
  const [commentText, setCommentText] = useState("");

  const { data: skill, isLoading } = trpc.marketplace.getBySlug.useQuery(
    { slug },
    { enabled: open }
  );

  const { data: commentsData } = trpc.marketplace.getComments.useQuery(
    { skillId: skill?.id || 0, limit: 30 },
    { enabled: !!skill?.id }
  );

  const likeMutation = trpc.marketplace.like.useMutation({
    onSuccess: () => {
      utils.marketplace.getBySlug.invalidate({ slug });
      utils.marketplace.list.invalidate();
    },
  });

  const addCommentMutation = trpc.marketplace.addComment.useMutation({
    onSuccess: () => {
      setCommentText("");
      utils.marketplace.getComments.invalidate({ skillId: skill?.id || 0 });
      utils.marketplace.getBySlug.invalidate({ slug });
      utils.marketplace.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteCommentMutation = trpc.marketplace.deleteComment.useMutation({
    onSuccess: () => {
      utils.marketplace.getComments.invalidate({ skillId: skill?.id || 0 });
      utils.marketplace.getBySlug.invalidate({ slug });
      utils.marketplace.list.invalidate();
    },
  });

  const handleLike = () => {
    if (!isAuthenticated) {
      toast.error("Please login to like this skill");
      return;
    }
    if (skill) likeMutation.mutate({ skillId: skill.id });
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/marketplace/${slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: skill?.name, text: skill?.description || "", url });
      } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    }
  };

  const handleAddComment = () => {
    if (!isAuthenticated) {
      toast.error("Please login to comment");
      return;
    }
    if (!commentText.trim() || !skill) return;
    addCommentMutation.mutate({ skillId: skill.id, content: commentText.trim() });
  };

  const IconComponent = skill ? (CATEGORY_ICONS[skill.category] || Sparkles) : Sparkles;
  const categoryLabel = skill ? (CATEGORIES.find((c) => c.value === skill.category)?.label || skill.category) : "";
  const comments = commentsData?.comments || [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {isLoading || !skill ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <>
            {/* Header */}
            <DialogHeader className="p-6 pb-4 border-b shrink-0">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white shrink-0">
                  <IconComponent className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-xl font-bold">{skill.name}</DialogTitle>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="secondary">{categoryLabel}</Badge>
                    <span className="text-xs text-gray-400">v{skill.version}</span>
                    <span className="text-xs text-gray-400">by {skill.author || "SmartAIHub"}</span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 mt-4">
                <Button
                  variant={skill.userLiked ? "default" : "outline"}
                  size="sm"
                className={skill.userLiked ? "bg-blue-500 hover:bg-blue-600 text-white gap-1.5" : "gap-1.5"}
                  onClick={handleLike}
                  disabled={likeMutation.isPending}
                >
                  <Heart className={`h-4 w-4 ${skill.userLiked ? "fill-current" : ""}`} />
                  {skill.likeCount}
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleShare}>
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>
                <span className="text-xs text-gray-400 ml-auto flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {skill.commentCount} comments
                </span>
              </div>
            </DialogHeader>

            {/* Scrollable content */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6 space-y-6">
                {/* Description */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {skill.description || "No description available."}
                  </p>
                </div>

                {/* Marketplace content (curated public documentation) */}
                {skill.marketplaceContent ? (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Documentation</h3>
                    <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                      {skill.marketplaceContent}
                    </div>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Documentation</h3>
                    <p className="text-sm text-muted-foreground italic">Documentation coming soon.</p>
                  </div>
                )}

                {/* Tags */}
                {skill.tags && (skill.tags as string[]).length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Tags</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {(skill.tags as string[]).map((tag: string) => (
                        <Badge key={tag} variant="outline">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Comments ({commentsData?.total || 0})
                  </h3>

                  {/* Comment input */}
                  <div className="flex gap-2 mb-4">
                    <Textarea
                      placeholder={isAuthenticated ? "Write a comment..." : "Login to comment"}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      disabled={!isAuthenticated}
                      className="text-sm min-h-[60px] resize-none"
                      maxLength={1000}
                    />
                    <Button
                      size="sm"
                      className="shrink-0 self-end"
                      onClick={handleAddComment}
                      disabled={!commentText.trim() || addCommentMutation.isPending || !isAuthenticated}
                    >
                      {addCommentMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {/* Comment list */}
                  <div className="space-y-3">
                    {comments.length === 0 ? (
                      <p className="text-sm text-gray-400 italic">No comments yet. Be the first!</p>
                    ) : (
                      comments.map((c: any) => (
                        <div key={c.id} className="flex items-start gap-2 group">
                          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {(c.userName || "?")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-900">
                                {c.userName || "Anonymous"}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {new Date(c.createdAt).toLocaleDateString()}
                              </span>
                              {isAuthenticated && (c.userId === userId || isAdmin) && (
                                <button
                                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => deleteCommentMutation.mutate({ commentId: c.id })}
                                >
                                  <Trash2 className="h-3 w-3 text-gray-400 hover:text-red-500" />
                                </button>
                              )}
                            </div>
                            <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">
                              {c.content}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
