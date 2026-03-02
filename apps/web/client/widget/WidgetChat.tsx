/**
 * WidgetChat — Minimal chat UI component for the embedded iframe.
 *
 * Features:
 * - WebSocket connection with auth handshake
 * - Message list with auto-scroll
 * - Text input with send button
 * - Typing indicator for assistant responses
 * - postMessage to parent for resize events
 * - Strict origin validation on postMessage
 */

import React, { useState, useEffect, useRef, useCallback } from "react";

const PARENT_ORIGIN = "https://smartaihub.app";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

interface WidgetTheme {
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  headerText?: string;
  fontFamily?: string;
  borderRadius?: string;
}

interface WidgetChatProps {
  token: string;
  widgetId: string;
  wsUrl: string;
}

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

const DEFAULT_THEME: Required<WidgetTheme> = {
  primaryColor: "#6366f1",
  backgroundColor: "#ffffff",
  textColor: "#1a1a1a",
  headerText: "Chat",
  fontFamily: "system-ui, -apple-system, sans-serif",
  borderRadius: "8px",
};

export function WidgetChat({ token, widgetId, wsUrl }: WidgetChatProps) {
  const [theme, setTheme] = useState<Required<WidgetTheme>>(DEFAULT_THEME);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [isTyping, setIsTyping] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // WebSocket connection
  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "auth", token }));
    });

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          type: string;
          text?: string;
          error?: string;
          code?: string;
          theme?: WidgetTheme;
        };

        if (msg.type === "auth_ok") {
          setStatus("connected");
          // Apply server-sent theme if provided
          if (msg.theme) {
            setTheme({ ...DEFAULT_THEME, ...msg.theme });
          }
        } else if (msg.type === "message") {
          setIsTyping(false);
          if (msg.text) {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                text: msg.text!,
                timestamp: Date.now(),
              },
            ]);
          }
        } else if (msg.type === "typing") {
          setIsTyping(true);
        } else if (msg.type === "error") {
          setIsTyping(false);
        }
      } catch {
        // Malformed JSON — ignore
      }
    });

    ws.addEventListener("close", (event) => {
      wsRef.current = null;
      setStatus(event.code === 4001 ? "error" : "disconnected");
    });

    ws.addEventListener("error", () => {
      setStatus("error");
    });

    return () => {
      ws.close();
    };
  }, [token, wsUrl]);

  // Notify parent of height changes
  useEffect(() => {
    const height = document.body.scrollHeight;
    if (window.parent !== window) {
      window.parent.postMessage({ type: "widget:resize", height }, PARENT_ORIGIN);
    }
  }, [messages]);

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text || status !== "connected" || !wsRef.current) return;

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        text,
        timestamp: Date.now(),
      },
    ]);
    setInputText("");
    setIsTyping(true);

    wsRef.current.send(JSON.stringify({ type: "message", text }));
  }, [inputText, status]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      fontFamily: theme.fontFamily,
      fontSize: "14px",
      backgroundColor: theme.backgroundColor,
      color: theme.textColor,
    },
    header: {
      padding: "12px 16px",
      borderBottom: "1px solid #e5e7eb",
      backgroundColor: theme.primaryColor,
      color: "#fff",
      fontWeight: 600,
    },
    messages: {
      flex: 1,
      overflowY: "auto",
      padding: "12px 16px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    },
    messageBubble: (role: string) => ({
      maxWidth: "80%",
      padding: "8px 12px",
      borderRadius: role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
      backgroundColor: role === "user" ? theme.primaryColor : "#f3f4f6",
      color: role === "user" ? "#fff" : theme.textColor,
      alignSelf: role === "user" ? "flex-end" : "flex-start",
      lineHeight: 1.4,
      wordBreak: "break-word" as const,
    }),
    inputArea: {
      display: "flex",
      gap: "8px",
      padding: "12px",
      borderTop: "1px solid #e5e7eb",
    },
    input: {
      flex: 1,
      padding: "8px 12px",
      borderRadius: "8px",
      border: "1px solid #d1d5db",
      outline: "none",
      fontSize: "14px",
      resize: "none" as const,
    },
    sendButton: {
      padding: "8px 16px",
      backgroundColor: theme.primaryColor,
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      fontSize: "14px",
      fontWeight: 500,
    },
    typingIndicator: {
      alignSelf: "flex-start",
      padding: "8px 12px",
      backgroundColor: "#f3f4f6",
      borderRadius: "16px 16px 16px 4px",
      color: "#9ca3af",
      fontSize: "12px",
    },
    statusBanner: {
      padding: "8px 16px",
      textAlign: "center" as const,
      fontSize: "12px",
      color: status === "error" ? "#ef4444" : "#6b7280",
      backgroundColor: status === "error" ? "#fee2e2" : "#f9fafb",
    },
  };

  if (status === "error") {
    return (
      <div style={styles.container}>
        <div style={styles.header}>{theme.headerText}</div>
        <div style={styles.statusBanner}>
          Connection failed. Please refresh the page.
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>{theme.headerText}</div>
      {status === "connecting" && (
        <div style={styles.statusBanner}>Connecting...</div>
      )}
      <div style={styles.messages}>
        {messages.map((msg) => (
          <div key={msg.id} style={styles.messageBubble(msg.role)}>
            {msg.text}
          </div>
        ))}
        {isTyping && (
          <div style={styles.typingIndicator}>● ● ●</div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div style={styles.inputArea}>
        <textarea
          style={styles.input}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={status === "connected" ? "Type a message..." : "Connecting..."}
          disabled={status !== "connected"}
          rows={1}
        />
        <button
          style={styles.sendButton}
          onClick={sendMessage}
          disabled={status !== "connected" || !inputText.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
