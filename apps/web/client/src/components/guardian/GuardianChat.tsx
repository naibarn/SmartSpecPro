import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@smartspec/ui/src/components/ui/button";
import { Input } from "@smartspec/ui/src/components/ui/input";
import { ScrollArea } from "@smartspec/ui/src/components/ui/scroll-area";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export function GuardianChat() {
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const historyQuery = trpc.virtualAdmin.getGuardianHistory.useQuery({ limit: 50 });
  const sendMutation = trpc.virtualAdmin.sendGuardianMessage.useMutation({
    onSuccess: (data) => {
      setLocalMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response },
      ]);
      historyQuery.refetch();
    },
  });

  const allMessages = [
    ...(historyQuery.data?.messages?.map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      createdAt: m.createdAt,
    })) ?? []),
    ...localMessages,
  ];

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length]);

  function handleSend() {
    const msg = input.trim();
    if (!msg) return;

    setLocalMessages((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    sendMutation.mutate({ message: msg });
  }

  return (
    <div className="flex flex-col h-[500px] border rounded-lg">
      <div className="p-3 border-b font-semibold text-sm">System Guardian Chat</div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {allMessages.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-8">
              Type a command to interact with the System Guardian.
              Try "status", "incidents", or "help".
            </p>
          )}
          {allMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {sendMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">
                Thinking...
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>
      <div className="p-3 border-t flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder="Type a command..."
          disabled={sendMutation.isPending}
        />
        <Button onClick={handleSend} disabled={sendMutation.isPending || !input.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
