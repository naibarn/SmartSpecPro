import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Paperclip,
  Send,
  X,
  Settings,
  CreditCard,
  RefreshCw,
  Wand2,
  Video,
  Code2,
  FileText,
  Search,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "./media/ImageLightbox";
import { SafeMarkdown } from "./SafeMarkdown";

// Debounce hook for skill detection
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

const skillIconMap: Record<string, React.ElementType> = {
  "image-generation": Wand2,
  "video-generation": Video,
  "code-assistant": Code2,
  "document-analysis": FileText,
  "web-search": Search,
};

type MessageRole = "user" | "assistant" | "system";

interface Message {
  id: number;
  role: MessageRole;
  content: string;
  attachments?: Array<{
    type: string;
    url: string;
    name?: string;
  }>;
  artifacts?: Array<{
    id: string;
    type: string;
    title?: string;
    content: string | string[];
    language?: string;
  }>;
  inputTokens?: number;
  outputTokens?: number;
  creditsUsed?: string;
  modelUsed?: string;
  skillUsed?: string;
  createdAt: Date;
}

interface Attachment {
  key: string;
  url: string;
  fileType: string;
  fileName: string;
}

interface ChatViewProps {
  conversationId: number | null;
  onTitleUpdate?: (title: string) => void;
}

export function ChatView({ conversationId, onTitleUpdate }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  // Fetch conversation details
  const { data: conversation } = trpc.chat.getConversation.useQuery(
    { id: conversationId! },
    { enabled: !!conversationId }
  );

  // Fetch messages
  const { data: messagesData, isLoading: loadingMessages } = trpc.chat.getMessages.useQuery(
    { conversationId: conversationId!, limit: 100 },
    { enabled: !!conversationId }
  );

  // Get credits balance
  const { data: credits } = trpc.credits.balance.useQuery();

  // Mutations
  const uploadMutation = trpc.ai.upload.useMutation();
  const sendMessageMutation = trpc.chat.sendMessage.useMutation();
  const saveAssistantMutation = trpc.chat.saveAssistantMessage.useMutation({
    onSuccess: () => {
      utils.chat.getMessages.invalidate({ conversationId: conversationId! });
      utils.chat.listConversations.invalidate();
      utils.credits.balance.invalidate();
    },
  });
  const processMemoryMutation = trpc.memory.processMemory.useMutation();
  const detectSkillMutation = trpc.chat.detectSkill.useMutation();

  // Skill detection state
  const [detectedSkill, setDetectedSkill] = useState<{
    id: string;
    name: string;
    type: string;
    confidence: number;
    suggestedPrompt: string | null;
  } | null>(null);

  // Lightbox state for viewing images
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<Array<{ src: string; alt?: string }>>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Open image in lightbox
  const openImageLightbox = (images: Array<{ src: string; alt?: string }>, index: number = 0) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // Debounce input for skill detection
  const debouncedInput = useDebounce(input, 300);

  // Detect skills when input changes
  useEffect(() => {
    const detectSkills = async () => {
      if (!conversationId || !debouncedInput.trim() || debouncedInput.length < 3) {
        setDetectedSkill(null);
        return;
      }

      try {
        const result = await detectSkillMutation.mutateAsync({
          message: debouncedInput,
          conversationId,
        });

        if (result.detected && result.skill) {
          setDetectedSkill({
            id: result.skill.id,
            name: result.skill.name,
            type: result.skill.type,
            confidence: result.confidence,
            suggestedPrompt: result.suggestedPrompt,
          });
        } else {
          setDetectedSkill(null);
        }
      } catch (error) {
        // Silently fail skill detection
        setDetectedSkill(null);
      }
    };

    detectSkills();
  }, [debouncedInput, conversationId]);

  // Update messages when data changes
  useEffect(() => {
    if (messagesData) {
      setMessages(messagesData as Message[]);
    }
  }, [messagesData]);

  // Scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  // File handling
  const handlePickFile = () => fileRef.current?.click();

  // File upload constants
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB for images
  const ALLOWED_FILE_TYPES = [
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
    "text/plain", "text/csv", "text/markdown",
    "application/json",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    // File size validation
    const isImage = file.type.startsWith("image/");
    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;

    if (file.size > maxSize) {
      const sizeMB = (maxSize / (1024 * 1024)).toFixed(0);
      alert(`File too large. Maximum size is ${sizeMB}MB for ${isImage ? "images" : "files"}.`);
      return;
    }

    // File type validation
    if (!ALLOWED_FILE_TYPES.includes(file.type) && !file.type.startsWith("image/")) {
      alert("File type not allowed. Supported types: images, PDF, text, JSON, Word documents.");
      return;
    }

    // Additional security: check file extension matches MIME type
    const ext = file.name.split(".").pop()?.toLowerCase();
    const mimeToExt: Record<string, string[]> = {
      "image/jpeg": ["jpg", "jpeg"],
      "image/png": ["png"],
      "image/gif": ["gif"],
      "image/webp": ["webp"],
      "application/pdf": ["pdf"],
      "text/plain": ["txt"],
      "text/csv": ["csv"],
      "text/markdown": ["md", "markdown"],
      "application/json": ["json"],
    };

    const expectedExts = mimeToExt[file.type];
    if (expectedExts && ext && !expectedExts.includes(ext)) {
      alert("File extension does not match file type. This may be a security issue.");
      return;
    }

    const toBase64 = (f: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });

    const fileBase64 = await toBase64(file);
    const res = await uploadMutation.mutateAsync({
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileBase64,
    });

    setAttachments((prev) => [
      ...prev,
      { key: res.key, url: res.url, fileType: res.fileType, fileName: file.name },
    ]);
  };

  const removeAttachment = (key: string) => {
    setAttachments((prev) => prev.filter((a) => a.key !== key));
  };

  // Build user content for multi-modal
  const buildUserContent = (text: string, atts: Attachment[]) => {
    const parts: any[] = [];
    if (text.trim().length > 0) parts.push({ type: "text", text });

    for (const a of atts) {
      if (a.fileType.startsWith("image/")) {
        parts.push({ type: "image_url", image_url: { url: a.url } });
      } else {
        parts.push({ type: "text", text: `File: ${a.url}` });
      }
    }
    return parts.length === 1 ? parts[0].text : parts;
  };

  // Stream response from LLM with memory-aware context
  const streamResponse = async (userMessage: Message, skillUsed?: string) => {
    if (!conversationId) return;

    setIsStreaming(true);
    setStreamingContent("");

    // Get memory-aware context from server
    let apiMessages: Array<{ role: string; content: string }>;
    try {
      const contextData = await utils.memory.getChatContext.fetch({ conversationId });
      apiMessages = [
        ...contextData.messages,
        { role: "user", content: userMessage.content },
      ];
    } catch (error) {
      // Fallback to simple context if memory fetch fails
      apiMessages = [
        ...(conversation?.systemPrompt
          ? [{ role: "system" as const, content: conversation.systemPrompt }]
          : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: userMessage.content },
      ];
    }

    const body = {
      model: conversation?.model || "gpt-4o-mini",
      messages: apiMessages,
      stream: true,
    };

    try {
      const resp = await fetch("/api/llm/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok || !resp.body) {
        const txt = await resp.text().catch(() => "Stream failed");
        setStreamingContent(`[Error] ${txt}`);
        setIsStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      let fullContent = "";
      let inputTokens = 0;
      let outputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        while (true) {
          const idx = buf.indexOf("\n");
          if (idx < 0) break;
          const line = buf.slice(0, idx).replace(/\r$/, "");
          buf = buf.slice(idx + 1);

          if (line.startsWith("data:")) {
            const data = line.slice("data:".length).trim();
            if (data === "[DONE]") break;

            try {
              const j = JSON.parse(data);
              const delta = j?.choices?.[0]?.delta?.content;
              if (typeof delta === "string") {
                fullContent += delta;
                setStreamingContent(fullContent);
              }

              // Capture usage if provided
              if (j?.usage) {
                inputTokens = j.usage.prompt_tokens || 0;
                outputTokens = j.usage.completion_tokens || 0;
              }
            } catch {
              // Non-JSON data, append as-is
              fullContent += data;
              setStreamingContent(fullContent);
            }
          }
        }
      }

      reader.releaseLock();

      // Save assistant message to database
      if (fullContent) {
        await saveAssistantMutation.mutateAsync({
          conversationId,
          content: fullContent,
          inputTokens,
          outputTokens,
          modelUsed: conversation?.model || "gpt-4o-mini",
          skillUsed: skillUsed,
        });

        // Process memory in background (entity extraction, summarization check)
        processMemoryMutation.mutate({ conversationId });
      }
    } catch (error) {
      console.error("Stream error:", error);
      setStreamingContent(`[Error] Failed to stream response`);
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
    }
  };

  // Send message
  const onSend = async () => {
    if (isStreaming || !conversationId) return;
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    const content = buildUserContent(text, attachments);

    // Save user message
    const userMessage = await sendMessageMutation.mutateAsync({
      conversationId,
      content: typeof content === "string" ? content : JSON.stringify(content),
      attachments: attachments.map((a) => ({
        type: a.fileType.startsWith("image/") ? "image" as const : "file" as const,
        url: a.url,
        name: a.fileName,
      })),
    });

    // Add to local state immediately
    setMessages((prev) => [
      ...prev,
      {
        id: userMessage.id,
        role: "user" as const,
        content: typeof content === "string" ? content : text,
        attachments: attachments.map((a) => ({
          type: a.fileType,
          url: a.url,
          name: a.fileName,
        })),
        createdAt: new Date(userMessage.createdAt),
      },
    ]);

    setInput("");
    setAttachments([]);
    setDetectedSkill(null);
    scrollToBottom();

    // Auto-generate title for new conversations
    if (messages.length === 0 && onTitleUpdate) {
      const title = text.substring(0, 50) + (text.length > 50 ? "..." : "");
      onTitleUpdate(title);
    }

    // Capture the detected skill before clearing it
    const currentSkill = detectedSkill?.id;

    // Stream response
    await streamResponse({
      id: userMessage.id,
      role: "user",
      content: typeof content === "string" ? content : text,
      createdAt: new Date(userMessage.createdAt),
    }, currentSkill);
  };

  // Render user content (including images)
  const renderUserContent = (message: Message) => {
    const imageAttachments = message.attachments?.filter((a) => a.type?.startsWith("image")) || [];
    const hasImages = imageAttachments.length > 0;

    return (
      <div className="space-y-2">
        <div className="whitespace-pre-wrap">{message.content}</div>
        {hasImages && (
          <div className="flex flex-wrap gap-2">
            {imageAttachments.map((a, i) => (
              <img
                key={i}
                src={a.url}
                alt={a.name || "attachment"}
                className="max-h-48 rounded-md border cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => openImageLightbox(
                  imageAttachments.map((img) => ({ src: img.url, alt: img.name })),
                  i
                )}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg font-medium">No conversation selected</h3>
          <p className="text-sm text-muted-foreground">
            Select a conversation from the sidebar or start a new chat
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">{conversation?.title || "Chat"}</h2>
          {conversation?.model && (
            <Badge variant="outline" className="text-xs">
              {conversation.model}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <CreditCard className="h-3 w-3" />
            {credits?.credits || 0} credits
          </Badge>
          {isStreaming && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Streaming
            </Badge>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          {loadingMessages ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 && !streamingContent ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <h3 className="text-lg font-medium">Start a conversation</h3>
              <p className="text-sm text-muted-foreground">
                Type a message below to begin
              </p>
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[85%] rounded-lg px-4 py-3",
                    m.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "mr-auto bg-muted"
                  )}
                >
                  {m.role === "assistant" ? (
                    <SafeMarkdown>{m.content}</SafeMarkdown>
                  ) : (
                    renderUserContent(m)
                  )}
                  {m.role === "assistant" && (m.creditsUsed || m.skillUsed) && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      {m.skillUsed && (
                        <Badge variant="outline" className="gap-1 text-xs">
                          {(() => {
                            const SkillIcon = skillIconMap[m.skillUsed] || Sparkles;
                            return <SkillIcon className="h-3 w-3" />;
                          })()}
                          {m.skillUsed.replace(/-/g, " ")}
                        </Badge>
                      )}
                      {m.creditsUsed && Number(m.creditsUsed) > 0 && (
                        <span>{Number(m.creditsUsed).toFixed(4)} credits</span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming message */}
              {streamingContent && (
                <div className="mr-auto max-w-[85%] rounded-lg bg-muted px-4 py-3">
                  <SafeMarkdown>{streamingContent}</SafeMarkdown>
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t p-4">
        {/* Detected Skill Indicator */}
        {detectedSkill && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              Detected:
            </span>
            <Badge variant="secondary" className="gap-1">
              {(() => {
                const SkillIcon = skillIconMap[detectedSkill.id] || Wand2;
                return <SkillIcon className="h-3 w-3" />;
              })()}
              {detectedSkill.name}
            </Badge>
            <span className="text-xs text-muted-foreground">
              ({Math.round(detectedSkill.confidence * 100)}% confidence)
            </span>
            <button
              className="ml-auto text-muted-foreground hover:text-foreground"
              onClick={() => setDetectedSkill(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Attachment Previews */}
        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div key={a.key} className="relative">
                {a.fileType.startsWith("image/") ? (
                  <img
                    src={a.url}
                    alt={a.fileName}
                    className="h-16 w-16 rounded-md border object-cover"
                  />
                ) : (
                  <Badge variant="secondary" className="gap-2 pr-6">
                    {a.fileName}
                  </Badge>
                )}
                <button
                  className="absolute -right-1 -top-1 rounded-full bg-destructive p-1 text-destructive-foreground"
                  onClick={() => removeAttachment(a.key)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePickFile}
            disabled={uploadMutation.isPending || isStreaming}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf,.txt,.csv,.md,.json,.doc,.docx"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="min-h-[44px] flex-1 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            disabled={isStreaming}
          />
          <Button
            onClick={onSend}
            disabled={isStreaming || uploadMutation.isPending || (!input.trim() && attachments.length === 0)}
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {uploadMutation.isPending && (
          <div className="mt-2 text-sm text-muted-foreground">Uploading...</div>
        )}
      </div>

      {/* Image Lightbox */}
      <ImageLightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}
