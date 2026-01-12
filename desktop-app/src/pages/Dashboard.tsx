import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthToken } from "../services/authService";
import {
  getCreditBalance,
  getCachedUser,
  isWebAuthenticated,
  WebUser,
} from "../services/webAuthService";

const API_BASE_URL = import.meta.env.VITE_PY_BACKEND_URL || "http://localhost:8000";

interface BalanceInfo {
  credits: number;
  usd: number;
  last_updated?: string;
}

interface WebCredits {
  credits: number;
  plan: string;
}

interface Statistics {
  total_spent_usd: number;
  total_credits_purchased: number;
  total_credits_used: number;
  total_requests: number;
  avg_cost_per_request: number;
  current_month_spending: number;
  last_30_days_usage: number;
}

interface DashboardSummary {
  balance: BalanceInfo;
  stats: Statistics;
}

interface DailyUsage {
  date: string;
  credits_used: number;
  requests: number;
  cost_usd: number;
}

interface LLMUsageItem {
  model?: string;
  provider?: string;
  task_type?: string;
  requests: number;
  credits_used: number;
  cost_usd: number;
  percentage: number;
}

interface LLMUsageBreakdown {
  by_model: LLMUsageItem[];
  by_provider: LLMUsageItem[];
  by_task_type: LLMUsageItem[];
  total_credits: number;
  note?: string;
}

interface Transaction {
  id: string;
  type: string;
  date?: string;
  amount_usd: number;
  credits: number;
  status: string;
  description: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [llmUsage, setLLMUsage] = useState<LLMUsageBreakdown | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // SmartSpecWeb credits state
  const [webCredits, setWebCredits] = useState<WebCredits | null>(null);
  const [webUser, setWebUser] = useState<WebUser | null>(null);
  const [webConnected, setWebConnected] = useState(false);

  useEffect(() => {
    loadDashboardData();
    loadWebCredits();
  }, []);

  // Load SmartSpecWeb credits
  const loadWebCredits = async () => {
    if (!isWebAuthenticated()) {
      setWebConnected(false);
      return;
    }

    try {
      setWebConnected(true);
      const cachedUser = getCachedUser();
      if (cachedUser) {
        setWebUser(cachedUser);
        setWebCredits({ credits: cachedUser.credits, plan: cachedUser.plan });
      }

      // Fetch fresh data
      const balance = await getCreditBalance();
      if (balance) {
        setWebCredits(balance);
      }
    } catch (err) {
      console.error("Failed to load web credits:", err);
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    const token = getAuthToken();

    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      // Load all dashboard data in parallel
      const [summaryRes, usageRes, llmUsageRes, transactionsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/dashboard/summary`, { headers }),
        fetch(`${API_BASE_URL}/api/dashboard/usage?days=30`, { headers }),
        fetch(`${API_BASE_URL}/api/dashboard/llm-usage?days=30`, { headers }),
        fetch(`${API_BASE_URL}/api/dashboard/transactions?limit=10`, { headers }),
      ]);

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data);
      }

      if (usageRes.ok) {
        const data = await usageRes.json();
        setDailyUsage(data.daily_usage || []);
      }

      if (llmUsageRes.ok) {
        const data = await llmUsageRes.json();
        setLLMUsage(data);
      }

      if (transactionsRes.ok) {
        const data = await transactionsRes.json();
        setTransactions(data.transactions || []);
      }
    } catch (err: any) {
      console.error("Failed to load dashboard data:", err);
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <div style={{ fontSize: 16, color: "#6b7280" }}>Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ padding: 16, background: "#fee2e2", borderRadius: 12, border: "1px solid #f87171" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#991b1b", marginBottom: 8 }}>
            Failed to load dashboard
          </div>
          <div style={{ fontSize: 14, color: "#dc2626" }}>{error}</div>
          <button
            onClick={loadDashboardData}
            style={{
              marginTop: 12,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #f87171",
              background: "#ffffff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  const cardStyle = {
    background: "#ffffff",
    borderRadius: 12,
    padding: 20,
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
  };

  const statCardStyle = {
    ...cardStyle,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  };

  return (
    <div style={{ padding: 24, background: "#f9fafb", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: "#111827" }}>Dashboard</h1>
          <p style={{ margin: "8px 0 0 0", color: "#6b7280", fontSize: 14 }}>
            Welcome to SmartSpec Pro Desktop App
          </p>
        </div>

        {/* SmartSpecWeb Credit Card */}
        <div style={{ 
          ...cardStyle, 
          marginBottom: 24, 
          background: webConnected 
            ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" 
            : "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, color: "#d1fae5", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span>SmartSpec Web Credits</span>
                {webConnected && (
                  <span style={{ 
                    fontSize: 10, 
                    background: "rgba(255,255,255,0.2)", 
                    padding: "2px 8px", 
                    borderRadius: 10,
                    textTransform: "capitalize"
                  }}>
                    {webCredits?.plan || "free"} plan
                  </span>
                )}
              </div>
              {webConnected && webCredits ? (
                <>
                  <div style={{ fontSize: 48, fontWeight: 700, color: "#ffffff" }}>
                    {webCredits.credits.toLocaleString()}
                  </div>
                  {webUser && (
                    <div style={{ fontSize: 14, color: "#d1fae5", marginTop: 4 }}>
                      {webUser.name || webUser.email}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 24, fontWeight: 600, color: "#ffffff", marginBottom: 8 }}>
                    Not Connected
                  </div>
                  <button
                    onClick={() => navigate("/web-login")}
                    style={{
                      padding: "10px 20px",
                      background: "#ffffff",
                      color: "#059669",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Connect to SmartSpec Web
                  </button>
                </>
              )}
            </div>
            <div style={{ fontSize: 64 }}>{webConnected ? "🌐" : "🔗"}</div>
          </div>
          {webConnected && (
            <div style={{ fontSize: 12, color: "#a7f3d0", marginTop: 12 }}>
              Connected • AI features use web credits
            </div>
          )}
        </div>

        {/* Local Credit Balance Card (if available) */}
        {summary && (
          <div style={{ ...cardStyle, marginBottom: 24, background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, color: "#e0e7ff", marginBottom: 8 }}>Local Credits (Legacy)</div>
                <div style={{ fontSize: 48, fontWeight: 700, color: "#ffffff" }}>
                  {summary.balance.credits.toLocaleString()}
                </div>
                <div style={{ fontSize: 18, color: "#e0e7ff", marginTop: 4 }}>
                  ≈ ${summary.balance.usd.toFixed(2)} USD
                </div>
              </div>
              <div style={{ fontSize: 64 }}>💎</div>
            </div>
            {summary.balance.last_updated && (
              <div style={{ fontSize: 12, color: "#c7d2fe", marginTop: 12 }}>
                Last updated: {new Date(summary.balance.last_updated).toLocaleString('th-TH')}
              </div>
            )}
          </div>
        )}

        {/* Quick Stats */}
        {summary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
            <div style={statCardStyle}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>Total Spent</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#111827" }}>
                ${summary.stats.total_spent_usd.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>All time</div>
            </div>

            <div style={statCardStyle}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>Total Requests</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#111827" }}>
                {summary.stats.total_requests.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>All time</div>
            </div>

            <div style={statCardStyle}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>Avg Cost/Request</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#111827" }}>
                ${summary.stats.avg_cost_per_request.toFixed(3)}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>Per request</div>
            </div>

            <div style={statCardStyle}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>This Month</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#10b981" }}>
                ${summary.stats.current_month_spending.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>Current month</div>
            </div>

            <div style={statCardStyle}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>Last 30 Days</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#3b82f6" }}>
                {summary.stats.last_30_days_usage.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>Credits used</div>
            </div>

            <div style={statCardStyle}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>Credits Used</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#ef4444" }}>
                {summary.stats.total_credits_used.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>All time</div>
            </div>
          </div>
        )}

        {/* LLM Usage Breakdown */}
        {llmUsage && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: 16, marginBottom: 24 }}>
            {/* By Provider */}
            <div style={cardStyle}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: 16, fontWeight: 600 }}>Usage by Provider</h3>
              {llmUsage.by_provider.length > 0 ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {llmUsage.by_provider.map((item, idx) => (
                    <div key={idx} style={{ display: "grid", gap: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 14, fontWeight: 500, textTransform: "capitalize" }}>
                          {item.provider}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {item.percentage.toFixed(1)}%
                        </div>
                      </div>
                      <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${item.percentage}%`,
                            height: "100%",
                            background: "linear-gradient(90deg, #667eea 0%, #764ba2 100%)",
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#6b7280" }}>
                        <div>{item.requests} requests</div>
                        <div>{item.credits_used.toLocaleString()} credits</div>
                        <div>${item.cost_usd.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#9ca3af", padding: "20px 0", textAlign: "center" }}>
                  {llmUsage.note || "No usage data available"}
                </div>
              )}
            </div>

            {/* By Model */}
            <div style={cardStyle}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: 16, fontWeight: 600 }}>Usage by Model</h3>
              {llmUsage.by_model.length > 0 ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {llmUsage.by_model.slice(0, 5).map((item, idx) => (
                    <div key={idx} style={{ display: "grid", gap: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 500, fontFamily: "monospace" }}>
                          {item.model}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {item.percentage.toFixed(1)}%
                        </div>
                      </div>
                      <div style={{ height: 6, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${item.percentage}%`,
                            height: "100%",
                            background: "#10b981",
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#6b7280" }}>
                        <div>{item.requests} req</div>
                        <div>${item.cost_usd.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#9ca3af", padding: "20px 0", textAlign: "center" }}>
                  {llmUsage.note || "No usage data available"}
                </div>
              )}
            </div>

            {/* By Task Type */}
            <div style={cardStyle}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: 16, fontWeight: 600 }}>Usage by Task Type</h3>
              {llmUsage.by_task_type.length > 0 ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {llmUsage.by_task_type.map((item, idx) => (
                    <div key={idx} style={{ display: "grid", gap: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 14, fontWeight: 500, textTransform: "capitalize" }}>
                          {item.task_type}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {item.percentage.toFixed(1)}%
                        </div>
                      </div>
                      <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${item.percentage}%`,
                            height: "100%",
                            background: "#3b82f6",
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#6b7280" }}>
                        <div>{item.requests} requests</div>
                        <div>${item.cost_usd.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#9ca3af", padding: "20px 0", textAlign: "center" }}>
                  {llmUsage.note || "No usage data available"}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Usage Chart (Last 30 Days) */}
        {dailyUsage.length > 0 && (
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 16, fontWeight: 600 }}>Daily Usage (Last 30 Days)</h3>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 200 }}>
              {dailyUsage.slice(-30).map((day, idx) => {
                const maxCredits = Math.max(...dailyUsage.map(d => d.credits_used), 1);
                const height = (day.credits_used / maxCredits) * 100;
                return (
                  <div
                    key={idx}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <div
                      title={`${day.date}: ${day.credits_used} credits, ${day.requests} requests, $${day.cost_usd.toFixed(2)}`}
                      style={{
                        width: "100%",
                        height: `${height}%`,
                        background: "linear-gradient(180deg, #667eea 0%, #764ba2 100%)",
                        borderRadius: "4px 4px 0 0",
                        cursor: "pointer",
                        transition: "opacity 0.2s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                    />
                    {idx % 5 === 0 && (
                      <div style={{ fontSize: 9, color: "#9ca3af", transform: "rotate(-45deg)", whiteSpace: "nowrap" }}>
                        {new Date(day.date).getDate()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 16, fontSize: 12, color: "#6b7280", textAlign: "center" }}>
              Hover over bars to see details
            </div>
          </div>
        )}

        {/* Recent Transactions */}
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: 16, fontWeight: 600 }}>Recent Transactions</h3>
          {transactions.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: 12,
                    background: "#f9fafb",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{tx.description}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {tx.date ? new Date(tx.date).toLocaleString('th-TH') : "N/A"} •{" "}
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: tx.type === "payment" ? "#dbeafe" : "#fee2e2",
                          color: tx.type === "payment" ? "#1e40af" : "#991b1b",
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      >
                        {tx.type}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: tx.amount_usd >= 0 ? "#10b981" : "#ef4444",
                      }}
                    >
                      {tx.amount_usd >= 0 ? "+" : ""}${Math.abs(tx.amount_usd).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {tx.credits >= 0 ? "+" : ""}{tx.credits.toLocaleString()} credits
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#9ca3af", padding: "20px 0", textAlign: "center" }}>
              No transactions yet
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <a
            href="/kilo"
            style={{
              ...cardStyle,
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
              transition: "all 0.2s",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 1px 3px 0 rgba(0, 0, 0, 0.1)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div style={{ fontSize: 48 }}>💻</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>CLI (Terminal)</div>
            <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center" }}>
              Run workflows and commands
            </div>
          </a>

          <a
            href="/chat"
            style={{
              ...cardStyle,
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
              transition: "all 0.2s",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 1px 3px 0 rgba(0, 0, 0, 0.1)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div style={{ fontSize: 48 }}>💬</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>LLM Chat</div>
            <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center" }}>
              Chat with vision support
            </div>
          </a>

          <a
            href="/factory"
            style={{
              ...cardStyle,
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
              transition: "all 0.2s",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 1px 3px 0 rgba(0, 0, 0, 0.1)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div style={{ fontSize: 48 }}>🏭</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>SaaS Factory</div>
            <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center" }}>
              Generate SaaS projects
            </div>
          </a>

          <a
            href="/terminal"
            style={{
              ...cardStyle,
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
              transition: "all 0.2s",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 1px 3px 0 rgba(0, 0, 0, 0.1)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div style={{ fontSize: 48 }}>🖥️</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Terminal (PTY)</div>
            <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center" }}>
              Full terminal emulator
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
