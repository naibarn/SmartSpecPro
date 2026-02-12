/**
 * Domain Admin Blog Manager
 * Full CRUD for blog posts with HTML editor
 */

import DOMPurify from "dompurify";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  ChevronLeft,
  Save,
  Plus,
  Trash2,
  Eye,
  Code,
  FileText,
  RefreshCw,
  PenLine,
  Calendar,
  Star,
  ExternalLink,
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Image as ImageIcon,
  Quote,
  Minus,
  Undo,
  Redo,
  Code2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BlogPost {
  id?: number;
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
  isPublished: boolean;
  isFeatured: boolean;
  metaDescription: string;
  metaKeywords: string;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

const emptyPost: BlogPost = {
  slug: "",
  title: "",
  excerpt: "",
  content: "",
  coverImage: "",
  author: "",
  authorAvatar: "",
  category: "",
  tags: [],
  readTime: "",
  isPublished: false,
  isFeatured: false,
  metaDescription: "",
  metaKeywords: "",
};

function HtmlEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showSource, setShowSource] = useState(false);
  const [sourceValue, setSourceValue] = useState(value);

  useEffect(() => {
    if (editorRef.current && !showSource) {
      editorRef.current.innerHTML = DOMPurify.sanitize(value);
    }
  }, [showSource]);

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const insertHtml = (html: string) => {
    document.execCommand("insertHTML", false, html);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const handleInsertLink = () => {
    const url = prompt("Enter URL:");
    if (url) {
      execCommand("createLink", url);
    }
  };

  const handleInsertImage = () => {
    const url = prompt("Enter image URL:");
    if (url) {
      insertHtml(`<img src="${url}" alt="" style="max-width: 100%; border-radius: 8px;" />`);
    }
  };

  if (showSource) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1 p-2 bg-gray-100 rounded-t-lg border border-b-0 border-gray-200">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(sourceValue);
              setShowSource(false);
            }}
            className="text-xs"
          >
            <Eye className="w-3 h-3 mr-1" />
            Visual
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="text-xs"
          >
            <Code className="w-3 h-3 mr-1" />
            Source
          </Button>
        </div>
        <Textarea
          value={sourceValue}
          onChange={(e) => setSourceValue(e.target.value)}
          onBlur={() => onChange(sourceValue)}
          rows={20}
          className="font-mono text-sm rounded-t-none"
        />
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-2 bg-gray-100 rounded-t-lg border border-b-0 border-gray-200">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="text-xs"
        >
          <Eye className="w-3 h-3 mr-1" />
          Visual
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setSourceValue(value);
            setShowSource(true);
          }}
          className="text-xs"
        >
          <Code className="w-3 h-3 mr-1" />
          Source
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => execCommand("bold")} title="Bold">
          <Bold className="w-4 h-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => execCommand("italic")} title="Italic">
          <Italic className="w-4 h-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => execCommand("formatBlock", "h2")} title="Heading 2">
          <Heading2 className="w-4 h-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => execCommand("formatBlock", "h3")} title="Heading 3">
          <Heading3 className="w-4 h-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => execCommand("formatBlock", "p")} title="Paragraph">
          <PenLine className="w-4 h-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => execCommand("insertUnorderedList")} title="Bullet List">
          <List className="w-4 h-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => execCommand("insertOrderedList")} title="Numbered List">
          <ListOrdered className="w-4 h-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => execCommand("formatBlock", "blockquote")} title="Quote">
          <Quote className="w-4 h-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={handleInsertLink} title="Insert Link">
          <LinkIcon className="w-4 h-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={handleInsertImage} title="Insert Image">
          <ImageIcon className="w-4 h-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => execCommand("insertHorizontalRule")} title="Horizontal Rule">
          <Minus className="w-4 h-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertHtml('<pre><code>code here</code></pre>')} title="Code Block">
          <Code2 className="w-4 h-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => execCommand("undo")} title="Undo">
          <Undo className="w-4 h-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => execCommand("redo")} title="Redo">
          <Redo className="w-4 h-4" />
        </Button>
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        className="min-h-[400px] p-4 border border-gray-200 rounded-b-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 prose prose-sm max-w-none"
        onInput={() => {
          if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
          }
        }}
        style={{ minHeight: 400 }}
      />
    </div>
  );
}

export default function DomainBlogAdmin() {
  const { user, isLoading: authLoading } = useAuth();
  const { tenant } = useTenant();
  const [, setLocation] = useLocation();

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [tagsInput, setTagsInput] = useState("");

  useEffect(() => {
    if (!authLoading && (!user || (user.role !== "domain_admin" && user.role !== "admin"))) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    fetchPosts();
  }, [tenant]);

  const fetchPosts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/blog/posts", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      }
    } catch (error) {
      console.error("Failed to fetch posts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingPost || !editingPost.title) {
      toast.error("Title is required");
      return;
    }

    setIsSaving(true);
    try {
      const isUpdate = !!editingPost.id;
      const url = isUpdate
        ? `/api/admin/blog/posts/${editingPost.id}`
        : "/api/admin/blog/posts";
      const method = isUpdate ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editingPost),
      });

      if (res.ok) {
        toast.success(isUpdate ? "Post updated" : "Post created");
        setEditingPost(null);
        fetchPosts();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save");
      }
    } catch (error) {
      toast.error("Failed to save post");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/blog/posts/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        toast.success("Post deleted");
        setDeleteConfirmId(null);
        fetchPosts();
      }
    } catch (error) {
      toast.error("Failed to delete post");
    }
  };

  const handleNewPost = () => {
    setEditingPost({
      ...emptyPost,
      author: user?.name || "Admin",
    });
    setTagsInput("");
  };

  const autoSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  if (authLoading || !user || (user.role !== "domain_admin" && user.role !== "admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  // Post editor view
  if (editingPost) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => setEditingPost(null)}>
                  <ChevronLeft className="w-5 h-5 mr-1" />
                  Back
                </Button>
                <span className="text-sm text-gray-500">
                  {editingPost.id ? "Edit Post" : "New Post"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Label className="flex items-center gap-2">
                  <Switch
                    checked={editingPost.isPublished}
                    onCheckedChange={(checked) =>
                      setEditingPost({ ...editingPost, isPublished: checked })
                    }
                  />
                  <span className="text-sm">{editingPost.isPublished ? "Published" : "Draft"}</span>
                </Label>
                <Label className="flex items-center gap-2">
                  <Switch
                    checked={editingPost.isFeatured}
                    onCheckedChange={(checked) =>
                      setEditingPost({ ...editingPost, isFeatured: checked })
                    }
                  />
                  <span className="text-sm">Featured</span>
                </Label>
                <Button onClick={handleSave} disabled={isSaving} className="bg-purple-600 hover:bg-purple-700">
                  {isSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-12 gap-6">
            {/* Main editor */}
            <div className="col-span-8 space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={editingPost.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setEditingPost({
                      ...editingPost,
                      title,
                      slug: editingPost.id ? editingPost.slug : autoSlug(title),
                    });
                  }}
                  placeholder="Post title..."
                  className="text-lg font-semibold"
                />
              </div>

              <div className="space-y-2">
                <Label>Excerpt</Label>
                <Textarea
                  value={editingPost.excerpt}
                  onChange={(e) => setEditingPost({ ...editingPost, excerpt: e.target.value })}
                  placeholder="Short summary for blog listing..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Content</Label>
                <HtmlEditor
                  value={editingPost.content}
                  onChange={(content) => setEditingPost({ ...editingPost, content })}
                />
              </div>
            </div>

            {/* Sidebar settings */}
            <div className="col-span-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Post Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Slug</Label>
                    <Input
                      value={editingPost.slug}
                      onChange={(e) => setEditingPost({ ...editingPost, slug: e.target.value })}
                      placeholder="url-slug"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Input
                      value={editingPost.category}
                      onChange={(e) => setEditingPost({ ...editingPost, category: e.target.value })}
                      placeholder="e.g. Tutorial, News"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Tags (comma separated)</Label>
                    <Input
                      value={tagsInput || editingPost.tags?.join(", ") || ""}
                      onChange={(e) => {
                        setTagsInput(e.target.value);
                        setEditingPost({
                          ...editingPost,
                          tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                        });
                      }}
                      placeholder="AI, Tutorial, Guide"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Read Time</Label>
                    <Input
                      value={editingPost.readTime}
                      onChange={(e) => setEditingPost({ ...editingPost, readTime: e.target.value })}
                      placeholder="5 min read"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Author</Label>
                    <Input
                      value={editingPost.author}
                      onChange={(e) => setEditingPost({ ...editingPost, author: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Author Avatar URL</Label>
                    <Input
                      value={editingPost.authorAvatar}
                      onChange={(e) => setEditingPost({ ...editingPost, authorAvatar: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Cover Image URL</Label>
                    <Input
                      value={editingPost.coverImage}
                      onChange={(e) => setEditingPost({ ...editingPost, coverImage: e.target.value })}
                      placeholder="https://..."
                    />
                    {editingPost.coverImage && (
                      <img
                        src={editingPost.coverImage}
                        alt="Cover"
                        className="w-full h-32 object-cover rounded-lg mt-2"
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">SEO</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Meta Description</Label>
                    <Textarea
                      value={editingPost.metaDescription}
                      onChange={(e) => setEditingPost({ ...editingPost, metaDescription: e.target.value })}
                      rows={2}
                      placeholder="SEO description..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Meta Keywords</Label>
                    <Input
                      value={editingPost.metaKeywords}
                      onChange={(e) => setEditingPost({ ...editingPost, metaKeywords: e.target.value })}
                      placeholder="keyword1, keyword2"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Post listing view
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}>
                <ChevronLeft className="w-5 h-5 mr-1" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <PenLine className="w-6 h-6 text-purple-500" />
                  Blog Manager
                </h1>
                <p className="text-sm text-gray-600">
                  Domain: {tenant?.name || (user as any)?.registeredDomain}
                </p>
              </div>
            </div>
            <Button onClick={handleNewPost} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="w-4 h-4 mr-2" />
              New Post
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
          </div>
        ) : posts.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No blog posts yet</h3>
              <p className="text-gray-500 mb-6">Create your first blog post to get started.</p>
              <Button onClick={handleNewPost} className="bg-purple-600 hover:bg-purple-700">
                <Plus className="w-4 h-4 mr-2" />
                Create First Post
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <Card key={post.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {post.coverImage && (
                      <img
                        src={post.coverImage}
                        alt=""
                        className="w-20 h-14 object-cover rounded-lg flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">{post.title}</h3>
                        {post.isFeatured && (
                          <Star className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                            post.isPublished
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {post.isPublished ? "Published" : "Draft"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 truncate">{post.excerpt || "No excerpt"}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        {post.category && <span>{post.category}</span>}
                        {post.author && <span>by {post.author}</span>}
                        {post.publishedAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(post.publishedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {post.isPublished && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(`/blog/${post.slug}`, "_blank", "noopener,noreferrer")}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingPost(post);
                          setTagsInput(post.tags?.join(", ") || "");
                        }}
                      >
                        <PenLine className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmId(post.id!)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Post</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this post? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
