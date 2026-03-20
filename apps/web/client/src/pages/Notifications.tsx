import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Bell, Search, Filter, Check, ChevronLeft, ChevronRight, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";

/** Safe navigation — blocks dangerous protocol URLs */
function safeNavigate(url: string, setLocation: (url: string) => void) {
  if (!url || typeof url !== "string") return;
  const lower = url.toLowerCase().trim();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:") || lower.startsWith("blob:")) {
    return;
  }
  setLocation(url);
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  normal: "#6b7280",
  low: "#4b5563",
};

const TYPE_LABELS: Record<string, string> = {
  scheduled_message: "Schedule",
  follow_request: "Follow",
  alert: "Alert",
  system: "System",
};

export default function Notifications() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("");
  const [priority, setPriority] = useState<string>("");
  const [readState, setReadState] = useState<"all" | "unread" | "read">("all");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);
  const limit = 20;

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.scheduledMessages.getNotificationHistory.useQuery({
    limit,
    offset: page * limit,
    type: type ? (type as any) : undefined,
    priority: priority ? (priority as any) : undefined,
    readState,
    search: search || undefined,
  });

  const markRead = trpc.scheduledMessages.markRead.useMutation({
    onSuccess: () => {
      utils.scheduledMessages.getNotificationHistory.invalidate();
      utils.scheduledMessages.getNotificationCount.invalidate();
    },
  });

  const markAllRead = trpc.scheduledMessages.markAllRead.useMutation({
    onSuccess: () => {
      utils.scheduledMessages.getNotificationHistory.invalidate();
      utils.scheduledMessages.getNotificationCount.invalidate();
    },
  });

  const dismiss = trpc.scheduledMessages.dismissNotification.useMutation({
    onSuccess: () => {
      utils.scheduledMessages.getNotificationHistory.invalidate();
      utils.scheduledMessages.getNotificationCount.invalidate();
      setSelectedId(null);
    },
  });

  const { data: groupOccurrences, isLoading: groupLoading } =
    trpc.scheduledMessages.getGroupOccurrences.useQuery(
      { notificationId: expandedGroupId!, limit: 10 },
      { enabled: expandedGroupId !== null }
    );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);
  const selected = items.find((n: any) => n.id === selectedId) as any;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <Bell style={{ width: 24, height: 24, color: "var(--foreground, #e0e0e0)" }} />
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--foreground, #e0e0e0)", margin: 0 }}>
          Notifications
        </h1>
        <span style={{ fontSize: "13px", color: "var(--muted-foreground, #888)" }}>
          {total} total
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => markAllRead.mutate()}
          style={{
            padding: "6px 12px",
            background: "transparent",
            border: "1px solid var(--border, #333)",
            borderRadius: "6px",
            color: "#0078d4",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          Mark all read
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search style={{ position: "absolute", left: 8, top: 9, width: 14, height: 14, color: "var(--muted-foreground, #666)" }} />
          <input
            type="text"
            placeholder="Search notifications..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            style={{
              width: "100%",
              padding: "8px 8px 8px 28px",
              background: "var(--background, #1e1e1e)",
              border: "1px solid var(--border, #333)",
              borderRadius: "6px",
              color: "var(--foreground, #e0e0e0)",
              fontSize: "13px",
            }}
          />
        </div>
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(0); }}
          style={{
            padding: "8px 12px",
            background: "var(--background, #1e1e1e)",
            border: "1px solid var(--border, #333)",
            borderRadius: "6px",
            color: "var(--foreground, #e0e0e0)",
            fontSize: "13px",
          }}
        >
          <option value="">All Types</option>
          <option value="alert">Alert</option>
          <option value="system">System</option>
          <option value="scheduled_message">Schedule</option>
          <option value="follow_request">Follow</option>
        </select>
        <select
          value={priority}
          onChange={(e) => { setPriority(e.target.value); setPage(0); }}
          style={{
            padding: "8px 12px",
            background: "var(--background, #1e1e1e)",
            border: "1px solid var(--border, #333)",
            borderRadius: "6px",
            color: "var(--foreground, #e0e0e0)",
            fontSize: "13px",
          }}
        >
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        <select
          value={readState}
          onChange={(e) => { setReadState(e.target.value as any); setPage(0); }}
          style={{
            padding: "8px 12px",
            background: "var(--background, #1e1e1e)",
            border: "1px solid var(--border, #333)",
            borderRadius: "6px",
            color: "var(--foreground, #e0e0e0)",
            fontSize: "13px",
          }}
        >
          <option value="all">All</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
      </div>

      {/* Content */}
      <div style={{ display: "flex", gap: "16px" }}>
        {/* List */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted-foreground, #666)" }}>
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--muted-foreground, #666)" }}>
              No notifications found
            </div>
          ) : (
            <div style={{ border: "1px solid var(--border, #333)", borderRadius: "8px", overflow: "hidden" }}>
              {items.map((n: any) => (
                <div
                  key={n.id}
                  onClick={() => {
                    setSelectedId(n.id === selectedId ? null : n.id);
                    if (!n.isRead) markRead.mutate({ id: n.id });
                  }}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border, #222)",
                    display: "flex",
                    gap: "10px",
                    alignItems: "flex-start",
                    background: n.id === selectedId
                      ? "rgba(0, 120, 212, 0.12)"
                      : n.isRead ? "transparent" : "rgba(0, 120, 212, 0.04)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                >
                  {/* Unread dot */}
                  <div style={{ paddingTop: "4px", minWidth: "8px" }}>
                    {!n.isRead && (
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: PRIORITY_COLORS[n.priority] || "#6b7280",
                      }} />
                    )}
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{
                        fontSize: "13px", fontWeight: n.isRead ? 400 : 600,
                        color: "var(--foreground, #e0e0e0)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        flex: 1,
                      }}>
                        {n.title}
                      </span>
                      <span style={{
                        fontSize: "10px", padding: "1px 5px", borderRadius: "4px",
                        background: `${PRIORITY_COLORS[n.priority] || "#6b7280"}20`,
                        color: PRIORITY_COLORS[n.priority] || "#6b7280",
                        fontWeight: 600, textTransform: "uppercase", flexShrink: 0,
                      }}>
                        {n.priority}
                      </span>
                      {(n.occurrenceCount ?? 1) > 1 && (
                        <span style={{
                          fontSize: "10px", padding: "1px 5px", borderRadius: "4px",
                          background: "rgba(99, 102, 241, 0.15)", color: "#818cf8",
                          fontWeight: 600, flexShrink: 0,
                        }}>
                          x{n.occurrenceCount}
                        </span>
                      )}
                      {n.relatedResourceType && (
                        <span style={{
                          fontSize: "10px", padding: "1px 5px", borderRadius: "4px",
                          background: "rgba(0,120,212,0.1)", color: "#0078d4", flexShrink: 0,
                        }}>
                          {n.relatedResourceType.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    {n.content && n.content !== n.title && (
                      <p style={{
                        fontSize: "12px", color: "var(--muted-foreground, #888)",
                        marginTop: "2px", lineHeight: 1.4,
                        overflow: "hidden", textOverflow: "ellipsis",
                        display: "-webkit-box", WebkitLineClamp: 1,
                        WebkitBoxOrient: "vertical" as const,
                      }}>
                        {n.content}
                      </p>
                    )}
                    {/* Group expansion toggle */}
                    {(n.occurrenceCount ?? 1) > 1 && (
                      <div style={{ marginTop: "4px" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedGroupId(expandedGroupId === n.id ? null : n.id);
                          }}
                          style={{
                            background: "none", border: "none", padding: 0,
                            color: "#818cf8", fontSize: "11px", cursor: "pointer",
                            display: "flex", alignItems: "center", gap: "4px",
                          }}
                        >
                          {expandedGroupId === n.id ? (
                            <><ChevronUp style={{ width: 12, height: 12 }} /> Collapse group</>
                          ) : (
                            <><ChevronDown style={{ width: 12, height: 12 }} /> Expand group (x{n.occurrenceCount})</>
                          )}
                        </button>
                        {expandedGroupId === n.id && (
                          <div style={{
                            marginTop: "6px", paddingLeft: "12px",
                            borderLeft: "2px solid var(--border, #444)",
                          }}>
                            {groupLoading ? (
                              <div style={{ fontSize: "11px", color: "var(--muted-foreground, #666)", padding: "4px 0" }}>
                                Loading...
                              </div>
                            ) : !groupOccurrences || groupOccurrences.length === 0 ? (
                              <div style={{ fontSize: "11px", color: "var(--muted-foreground, #666)", padding: "4px 0" }}>
                                No individual occurrences recorded
                              </div>
                            ) : (
                              groupOccurrences.map((occ: any) => (
                                <div key={occ.id} style={{
                                  padding: "4px 0", fontSize: "11px",
                                  color: "var(--foreground, #ccc)",
                                  borderBottom: "1px solid var(--border, #222)",
                                }}>
                                  <div>{occ.content}</div>
                                  <div style={{ fontSize: "10px", color: "var(--muted-foreground, #666)" }}>
                                    {new Date(occ.occurredAt).toLocaleString()}
                                    {occ.metadata?.source && ` · ${occ.metadata.source}`}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ fontSize: "11px", color: "var(--muted-foreground, #666)", marginTop: "2px", display: "flex", gap: "8px" }}>
                      <span>{new Date(n.createdAt).toLocaleString()}</span>
                      <span>{TYPE_LABELS[n.type] || n.type}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "16px" }}>
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                style={{
                  padding: "6px 10px", background: "transparent",
                  border: "1px solid var(--border, #333)", borderRadius: "6px",
                  color: page === 0 ? "var(--muted-foreground, #444)" : "var(--foreground, #e0e0e0)",
                  cursor: page === 0 ? "default" : "pointer", display: "flex", alignItems: "center",
                }}
              >
                <ChevronLeft style={{ width: 14, height: 14 }} />
              </button>
              <span style={{ fontSize: "13px", color: "var(--muted-foreground, #888)" }}>
                Page {page + 1} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                style={{
                  padding: "6px 10px", background: "transparent",
                  border: "1px solid var(--border, #333)", borderRadius: "6px",
                  color: page >= totalPages - 1 ? "var(--muted-foreground, #444)" : "var(--foreground, #e0e0e0)",
                  cursor: page >= totalPages - 1 ? "default" : "pointer", display: "flex", alignItems: "center",
                }}
              >
                <ChevronRight style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selected && (
          <div style={{
            width: 360, flexShrink: 0,
            border: "1px solid var(--border, #333)", borderRadius: "8px",
            background: "var(--background, #1e1e1e)",
            padding: "16px", alignSelf: "flex-start",
          }}>
            {/* Priority + Type */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
              <span style={{
                fontSize: "10px", padding: "2px 6px", borderRadius: "4px", fontWeight: 600,
                textTransform: "uppercase",
                background: PRIORITY_COLORS[selected.priority] || "#6b7280",
                color: "#fff",
              }}>
                {selected.priority}
              </span>
              <span style={{ fontSize: "10px", color: "var(--muted-foreground, #888)", lineHeight: "18px" }}>
                {(TYPE_LABELS[selected.type] || selected.type)} &middot; {new Date(selected.createdAt).toLocaleString()}
              </span>
            </div>

            {/* Title */}
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground, #e0e0e0)", margin: "0 0 8px" }}>
              {selected.title}
            </h3>

            {/* Content */}
            {selected.content && (
              <p style={{
                fontSize: "13px", color: "var(--foreground, #ccc)", lineHeight: 1.5,
                whiteSpace: "pre-wrap", margin: "8px 0", padding: "8px",
                background: "var(--muted, rgba(255,255,255,0.05))", borderRadius: "6px",
              }}>
                {selected.content}
              </p>
            )}

            {/* Group Info */}
            {(selected.occurrenceCount ?? 1) > 1 && (
              <div style={{
                margin: "8px 0", padding: "8px",
                background: "rgba(99, 102, 241, 0.06)", borderRadius: "6px",
                borderLeft: "3px solid #818cf8",
              }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#818cf8", marginBottom: "4px" }}>
                  Group Info
                </div>
                <div style={{ fontSize: "12px", color: "var(--foreground, #ccc)" }}>
                  {selected.occurrenceCount} occurrences
                </div>
                {selected.firstOccurredAt && (
                  <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)", marginTop: "2px" }}>
                    First: {new Date(selected.firstOccurredAt).toLocaleString()}
                  </div>
                )}
                {selected.lastOccurredAt && (
                  <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)", marginTop: "2px" }}>
                    Last: {new Date(selected.lastOccurredAt).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* Resource */}
            {selected.relatedResourceType && (
              <div style={{ fontSize: "12px", color: "var(--muted-foreground, #888)", margin: "8px 0", display: "flex", gap: "6px", alignItems: "center" }}>
                <span style={{ padding: "1px 6px", background: "rgba(0,120,212,0.1)", borderRadius: "4px", fontSize: "11px" }}>
                  {selected.relatedResourceType.replace(/_/g, " ")}
                </span>
                {selected.relatedResourceId && (
                  <span style={{ fontFamily: "monospace", fontSize: "11px" }}>
                    {selected.relatedResourceId.length > 24 ? selected.relatedResourceId.slice(0, 24) + "..." : selected.relatedResourceId}
                  </span>
                )}
              </div>
            )}

            {/* Error */}
            {selected.metadata?.errorDetails?.errorMessage && (
              <div style={{
                margin: "8px 0", padding: "8px",
                background: "rgba(211,47,47,0.08)", borderRadius: "6px",
                borderLeft: "3px solid #d32f2f",
              }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#d32f2f", marginBottom: "2px" }}>Error</div>
                {selected.metadata.errorDetails.errorCode && (
                  <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)" }}>
                    Code: {selected.metadata.errorDetails.errorCode}
                  </div>
                )}
                <div style={{ fontSize: "12px", color: "var(--foreground, #ccc)", whiteSpace: "pre-wrap" }}>
                  {selected.metadata.errorDetails.errorMessage.length > 500
                    ? selected.metadata.errorDetails.errorMessage.slice(0, 500) + "..."
                    : selected.metadata.errorDetails.errorMessage}
                </div>
              </div>
            )}

            {/* Metrics */}
            {selected.metadata?.metrics && (
              <div style={{ margin: "8px 0", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {selected.metadata.metrics.durationMs != null && (
                  <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)" }}>
                    Duration: <strong>{selected.metadata.metrics.durationMs > 1000
                      ? `${(selected.metadata.metrics.durationMs / 1000).toFixed(1)}s`
                      : `${selected.metadata.metrics.durationMs}ms`}</strong>
                  </div>
                )}
                {selected.metadata.metrics.costUsd != null && (
                  <div style={{ fontSize: "11px", color: "var(--muted-foreground, #888)" }}>
                    Cost: <strong>${selected.metadata.metrics.costUsd.toFixed(4)}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Source */}
            {selected.metadata?.source && (
              <div style={{ fontSize: "11px", color: "var(--muted-foreground, #666)", marginTop: "8px" }}>
                Source: <span style={{ fontFamily: "monospace" }}>{selected.metadata.source}</span>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              {selected.actionUrl && (
                <button
                  onClick={() => safeNavigate(selected.actionUrl, setLocation)}
                  style={{
                    flex: 1, padding: "8px 12px",
                    background: "#0078d4", color: "#fff",
                    border: "none", borderRadius: "6px",
                    fontSize: "13px", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
                  }}
                >
                  <ExternalLink style={{ width: 13, height: 13 }} />
                  {selected.actionLabel || "View Details"}
                </button>
              )}
              <button
                onClick={() => dismiss.mutate({ id: selected.id })}
                style={{
                  padding: "8px 12px",
                  background: "transparent",
                  border: "1px solid var(--border, #333)",
                  borderRadius: "6px",
                  color: "var(--muted-foreground, #888)",
                  fontSize: "13px", cursor: "pointer",
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
