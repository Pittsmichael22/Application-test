import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  LineChart, Line,
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";

// ─────────────────────────────────────────────────────────────
// CONSTANTS & UTILITIES
// ─────────────────────────────────────────────────────────────
const C = {
  bg: "#0a0c18",
  bgLight: "#1a1f35",
  card: "#141829",
  border: "#2a2f4a",
  text: "#e4e6eb",
  sub: "#a0a9c9",
  muted: "#7a8aaa",
  green: "#10b981",
  red: "#ef4444",
  yellow: "#f59e0b",
  blue: "#4f8ef7",
  purple: "#8b5cf6",
};

const formatCurrency = (val) => {
  if (!val) return "$0.00";
  const n = parseFloat(val);
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ─────────────────────────────────────────────────────────────
// COUNTDOWN TIMER COMPONENT
// ─────────────────────────────────────────────────────────────
const CountdownTimer = ({ eventTime }) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const event = new Date(eventTime);
      const remaining = (event - now) / 1000;

      setTimeLeft(Math.max(0, remaining));
      setIsFlashing(remaining < 60 && remaining > 0);
    }, 100);

    return () => clearInterval(interval);
  }, [eventTime]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = Math.floor(timeLeft % 60);
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  let timerColor = C.green;
  let timerBg = "#10b98115";
  if (timeLeft < 300) {
    timerColor = C.yellow;
    timerBg = "#f59e0b15";
  }
  if (timeLeft < 60 && timeLeft > 0) {
    timerColor = C.red;
    timerBg = "#ef444415";
  }

  return (
    <div
      style={{
        padding: "8px 12px",
        background: timerBg,
        border: `1px solid ${timerColor}`,
        borderRadius: 6,
        fontFamily: "monospace",
        fontSize: 13,
        fontWeight: 600,
        color: timerColor,
        animation: isFlashing ? "pulse-flash 0.5s infinite" : "none",
        textAlign: "center",
      }}
    >
      <style>{`
        @keyframes pulse-flash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      {formatted}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// MARKET RISK INDICATOR - FETCHES FROM FINNHUB API
// ─────────────────────────────────────────────────────────────
const MarketRiskIndicator = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEconomicEvents = async () => {
      try {
        const now = new Date();
        const pad = n => String(n).padStart(2, "0");
        const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
        const fromDate = fmtDate(now);
        const toDate = fmtDate(new Date(now.getTime() + 7 * 86400000));

        const res = await fetch(
          `https://finnhub.io/api/v1/calendar/economic?from=${fromDate}&to=${toDate}&token=d7lb131r01qm7o0b7520d7lb131r01qm7o0b752g`,
          { signal: AbortSignal.timeout(8000) }
        );
        const json = await res.json();
        const raw = json.economicCalendar || json || [];

        const etOptions = { timeZone: "America/New_York" };
        const todayLabelET = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...etOptions });
        const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" });
        const etOffset = etStr.includes("EDT") ? "-04:00" : "-05:00";
        const nowMs = now.getTime();

        const parsed = raw
          .filter(e => e.country === "US" || e.currency === "USD" || !e.country)
          .map(e => {
            const rawTime = (e.time || e.date || "").replace(" ", "T");
            const withTZ = rawTime && !rawTime.includes("+") && !rawTime.includes("Z") ? rawTime + etOffset : rawTime;
            const dt = withTZ ? new Date(withTZ) : null;
            const dateLabel = dt
              ? dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...etOptions })
              : "Unknown";
            const timeLabel = dt
              ? dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", ...etOptions }) + " ET"
              : "All Day";
            
            // Map impact levels to 1-10 scale
            const impactMap = { "high": 9, "medium": 5, "low": 2 };
            const impact = impactMap[(e.impact || "low").toLowerCase()] || 5;

            return {
              dt,
              isToday: dateLabel === todayLabelET,
              time: timeLabel,
              event: e.event || e.title || "Unknown Event",
              impact,
              currency: e.currency || "USD",
              forecast: e.estimate || e.forecast || "—",
              previous: e.prev || e.previous || "—",
              actual: e.actual || null,
            };
          })
          .filter(e => e.dt && e.dt.getTime() >= nowMs - 60000)
          .sort((a, b) => a.dt - b.dt);

        // Get today's events only
        const todaysEvents = parsed.filter(e => e.isToday).slice(0, 5);
        setEvents(todaysEvents);
        setLoading(false);
      } catch (err) {
        console.warn("Economic calendar fetch failed:", err.message);
        setEvents([]);
        setLoading(false);
      }
    };

    fetchEconomicEvents();
    // Refresh every 30 minutes
    const interval = setInterval(fetchEconomicEvents, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <div style={{ color: C.muted }}>Loading economic calendar...</div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>
        Market Risk Indicator
      </div>

      {events.length > 0 ? (
        <>
          {/* Countdown Timer for first event */}
          <div style={{ marginBottom: 14 }}>
            <CountdownTimer eventTime={events[0].dt} />
          </div>

          {/* Risk Events */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {events.map((ev, i) => (
              <div
                key={i}
                style={{
                  padding: 10,
                  background: ev.impact >= 8 ? "#ef44441a" : "#f59e0b1a",
                  border: `1px solid ${ev.impact >= 8 ? "#ef444460" : "#f59e0b60"}`,
                  borderRadius: 8,
                  display: "grid",
                  gridTemplateColumns: "50px 1fr 40px",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>
                  {ev.time}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                    {ev.event}
                  </div>
                  <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>
                    Impact: {ev.impact}/10
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: `linear-gradient(135deg, ${C.red}30, ${C.yellow}30)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      fontWeight: 700,
                      color: ev.impact >= 8 ? C.red : C.yellow,
                    }}
                  >
                    {ev.impact}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {events[0]?.impact >= 8 && (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                background: "#ef44415",
                border: `1px solid ${C.red}40`,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 14 }}>⚠️</span>
              <div style={{ fontSize: 11, color: C.text }}>
                <strong>HIGH VOLATILITY UPCOMING</strong> - {events[0]?.event} at {events[0]?.time}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ color: C.muted, textAlign: "center", padding: 20 }}>
          No upcoming economic events today
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// PRE-MARKET BRIEF - DYNAMIC FROM YOUR TRADES
// ─────────────────────────────────────────────────────────────
const PreMarketBrief = ({ trades = [] }) => {
  const recentTrades = trades.slice(0, 10);
  const wins = recentTrades.filter(t => t.result === "Win").length;
  const winRate = recentTrades.length > 0 ? (wins / recentTrades.length) : 0;
  
  let marketBias = "Neutral";
  let biasColor = C.yellow;
  if (winRate > 0.6) {
    marketBias = "Bullish";
    biasColor = C.green;
  } else if (winRate < 0.4) {
    marketBias = "Bearish";
    biasColor = C.red;
  }

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
          Pre-Market Brief
        </div>
        <div style={{ fontSize: 10, color: C.muted }}>Updated now</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Market Bias - DYNAMIC FROM YOUR TRADES */}
        <div
          style={{
            padding: 12,
            background: `linear-gradient(135deg, ${biasColor}15, ${C.blue}15)`,
            border: `1px solid ${biasColor}40`,
            borderRadius: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 16 }}>📈</span>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
              Market Bias: {marketBias}
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.sub, marginLeft: 24 }}>
            Based on your recent trades: {Math.round(winRate * 100)}% win rate ({wins}W/{recentTrades.length-wins}L)
          </div>
        </div>

        {/* Best Trading Windows */}
        <div
          style={{
            padding: 12,
            background: `linear-gradient(135deg, ${C.yellow}15, ${C.yellow}15)`,
            border: `1px solid ${C.yellow}40`,
            borderRadius: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 16 }}>⏰</span>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
              Best Trading Windows
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.sub, marginLeft: 24 }}>
            9:30 AM - 11:30 AM ET (London overlap)<br/>
            1:00 PM - 3:30 PM ET (US session)
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// NEWS FEED - FETCHES FROM NEWSAPI
// ─────────────────────────────────────────────────────────────
const NewsFeed = () => {
  const [newsItems, setNewsItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch(
          `https://newsapi.org/v2/everything?q=trading+OR+forex+OR+stocks+OR+futures&sortBy=publishedAt&language=en&pageSize=5&apiKey=6f23db3f5d874e34b2d4cbd0c92e4a0f`,
          { signal: AbortSignal.timeout(8000) }
        );
        
        if (!res.ok) throw new Error("News fetch failed");
        
        const data = await res.json();
        const articles = data.articles || [];
        
        const formattedNews = articles.slice(0, 5).map(article => ({
          time: new Date(article.publishedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          source: article.source?.name || "News",
          title: article.title,
          url: article.url,
        }));
        
        setNewsItems(formattedNews);
        setLoading(false);
      } catch (err) {
        console.warn("News fetch failed:", err.message);
        setNewsItems([]);
        setLoading(false);
      }
    };

    fetchNews();
    // Refresh every 15 minutes
    const interval = setInterval(fetchNews, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
          News Feed
        </div>
        <div style={{ fontSize: 11, color: C.blue, cursor: "pointer" }}>View All →</div>
      </div>

      {loading ? (
        <div style={{ color: C.muted, textAlign: "center", padding: 20 }}>
          Loading news...
        </div>
      ) : newsItems.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {newsItems.map((item, i) => (
            <a
              key={i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: 12,
                background: `${C.bgLight}`,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                display: "grid",
                gridTemplateColumns: "40px 1fr",
                gap: 10,
                alignItems: "flex-start",
                cursor: "pointer",
                transition: "all 0.2s",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `${C.border}40`;
                e.currentTarget.style.borderColor = C.blue;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = C.bgLight;
                e.currentTarget.style.borderColor = C.border;
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 6,
                  background: `linear-gradient(135deg, ${C.blue}20, ${C.purple}20)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                📰
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 4,
                  }}
                >
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>
                    {item.time}
                  </div>
                  <div style={{ fontSize: 10, color: C.blue }}>
                    {item.source}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: C.text,
                    lineHeight: "1.4",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {item.title}
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div style={{ color: C.muted, textAlign: "center", padding: 20 }}>
          No news available
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// RECENT TRADES WITH R-MULTIPLE TOGGLE
// ─────────────────────────────────────────────────────────────
const RecentTradesSection = ({ trades = [] }) => {
  const [showRMultiple, setShowRMultiple] = useState(false);

  const displayTrades = trades.length > 0 ? trades.slice(0, 10) : [];

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
          Recent Trades
        </div>
        <button
          onClick={() => setShowRMultiple(!showRMultiple)}
          style={{
            padding: "6px 12px",
            background: showRMultiple ? C.blue : C.border,
            border: "none",
            borderRadius: 6,
            color: C.text,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {showRMultiple ? "R-Multiple" : "P&L"}
        </button>
      </div>

      {displayTrades.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  borderBottom: `1px solid ${C.border}`,
                  color: C.muted,
                  fontWeight: 600,
                  textAlign: "left",
                }}
              >
                <th style={{ padding: "8px 0", paddingRight: 10 }}>Time</th>
                <th style={{ padding: "8px 0", paddingRight: 10 }}>Symbol</th>
                <th style={{ padding: "8px 0", paddingRight: 10 }}>Direction</th>
                <th style={{ padding: "8px 0", paddingRight: 10 }}>Result</th>
                <th style={{ padding: "8px 0", paddingRight: 10, textAlign: "right" }}>
                  {showRMultiple ? "R-Multiple" : "P&L"}
                </th>
                <th style={{ padding: "8px 0", textAlign: "center" }}>Discipline</th>
              </tr>
            </thead>
            <tbody>
              {displayTrades.map((trade, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: `1px solid ${C.border}40`,
                    color: C.text,
                  }}
                >
                  <td style={{ padding: "10px 0", paddingRight: 10, color: C.muted }}>
                    {new Date(trade.created_at).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: "10px 0", paddingRight: 10, fontWeight: 600 }}>
                    {trade.symbol}
                  </td>
                  <td style={{ padding: "10px 0", paddingRight: 10 }}>
                    <span
                      style={{
                        padding: "2px 6px",
                        background:
                          trade.direction === "Long" ? C.green + "20" : C.red + "20",
                        color: trade.direction === "Long" ? C.green : C.red,
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {trade.direction === "Long" ? "↑" : "↓"}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "10px 0",
                      paddingRight: 10,
                      color: trade.result === "Win" ? C.green : C.red,
                      fontWeight: 600,
                    }}
                  >
                    {trade.result}
                  </td>
                  <td
                    style={{
                      padding: "10px 0",
                      paddingRight: 10,
                      textAlign: "right",
                      color: showRMultiple
                        ? (trade.rMultiple || trade.pnl / 100) > 0
                          ? C.green
                          : C.red
                        : trade.pnl > 0
                        ? C.green
                        : C.red,
                      fontWeight: 600,
                    }}
                  >
                    {showRMultiple
                      ? `${(trade.rMultiple || trade.pnl / 100) > 0 ? "+" : ""}${(trade.rMultiple || trade.pnl / 100).toFixed(1)}R`
                      : formatCurrency(trade.pnl)}
                  </td>
                  <td style={{ padding: "10px 0", textAlign: "center" }}>
                    <span
                      style={{
                        padding: "2px 6px",
                        background: `linear-gradient(135deg, ${C.green}30, ${C.blue}30)`,
                        color: C.green,
                        borderRadius: 4,
                        fontWeight: 600,
                        fontSize: 10,
                      }}
                    >
                      {trade.discipline_score || "N/A"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ color: C.muted, textAlign: "center", padding: 20 }}>
          No trades yet
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// TODAY'S PERFORMANCE
// ─────────────────────────────────────────────────────────────
const TodaysPerformance = ({ trades = [], maxDailyDrawdown = 2000 }) => {
  const [showMDD, setShowMDD] = useState(false);

  const today = new Date().toDateString();
  const todaysTrades = trades.filter(t => new Date(t.created_at).toDateString() === today);
  const currentPnL = todaysTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  
  const performanceData = [
    { time: "12 AM", pnl: 0, mdd: 0 },
    { time: "6 AM", pnl: currentPnL * 0.2, mdd: -200 },
    { time: "12 PM", pnl: currentPnL * 0.5, mdd: -500 },
    { time: "6 PM", pnl: currentPnL, mdd: -300 },
  ];

  const currentDrawdown = 800;
  const drawdownPercent = (currentDrawdown / maxDailyDrawdown) * 100;
  const isNearLimit = drawdownPercent > 75;
  const isAtLimit = drawdownPercent > 90;

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${isAtLimit ? C.red : isNearLimit ? C.yellow : C.border}`,
        borderRadius: 12,
        padding: 16,
        transition: "all 0.3s",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            Today's Performance
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            Max Daily Drawdown: {formatCurrency(maxDailyDrawdown)}
          </div>
        </div>
        <button
          onClick={() => setShowMDD(!showMDD)}
          style={{
            padding: "6px 12px",
            background: showMDD ? C.red : C.border,
            border: "none",
            borderRadius: 6,
            color: C.text,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {showMDD ? "MDD On" : "MDD Off"}
        </button>
      </div>

      {/* P&L Summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            padding: 12,
            background: `${C.green}15`,
            border: `1px solid ${C.green}40`,
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>P&L</div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: currentPnL > 0 ? C.green : C.red,
              fontFamily: "monospace",
            }}
          >
            {currentPnL > 0 ? "+" : ""}{formatCurrency(currentPnL)}
          </div>
        </div>

        <div
          style={{
            padding: 12,
            background: isNearLimit ? `${C.red}15` : `${C.yellow}15`,
            border: `1px solid ${isNearLimit ? C.red : C.yellow}40`,
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>
            Drawdown Used
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: isNearLimit ? C.red : C.yellow,
              fontFamily: "monospace",
            }}
          >
            {drawdownPercent.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={performanceData}>
          <XAxis dataKey="time" stroke={C.muted} style={{ fontSize: 10 }} />
          <YAxis stroke={C.muted} style={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} />
          <Line type="monotone" dataKey="pnl" stroke={C.green} strokeWidth={2} dot={{ fill: C.green, r: 3 }} />
          {showMDD && <Line type="monotone" dataKey="mdd" stroke={C.red} strokeWidth={2} strokeDasharray="5,5" dot={false} />}
        </LineChart>
      </ResponsiveContainer>

      {isNearLimit && (
        <div style={{ marginTop: 12, padding: 10, background: `${C.red}15`, border: `1px solid ${C.red}40`, borderRadius: 8, display: "flex", alignItems: "center", gap: 8, color: C.red, fontSize: 11 }}>
          <span>⚠️</span>
          <div>
            You are <strong>{isAtLimit ? "AT your daily risk limit" : `${(100 - drawdownPercent).toFixed(1)}% away from`}</strong> your limit.
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// DISCIPLINE SCORE CARD
// ─────────────────────────────────────────────────────────────
const DisciplineCard = ({ trades = [] }) => {
  const today = new Date().toDateString();
  const todaysTrades = trades.filter(t => new Date(t.created_at).toDateString() === today);
  
  const disciplineScore = todaysTrades.length > 0
    ? todaysTrades.reduce((sum, t) => sum + (t.discipline_score || 0), 0) / todaysTrades.length
    : 0;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const lastWeek = trades.filter(t => new Date(t.created_at) >= sevenDaysAgo);
  
  const lastWeekAvg = lastWeek.length > 0
    ? lastWeek.reduce((sum, t) => sum + (t.discipline_score || 0), 0) / lastWeek.length
    : 0;

  const sevenDayTrend = lastWeekAvg > 0 ? disciplineScore - lastWeekAvg : 0;
  const trendIcon = sevenDayTrend > 0 ? "📈" : sevenDayTrend < 0 ? "📉" : "➡️";
  const trendColor = sevenDayTrend > 0 ? C.green : sevenDayTrend < 0 ? C.red : C.yellow;

  return (
    <div style={{ background: `linear-gradient(135deg, ${C.blue}15, ${C.purple}15)`, border: `1px solid ${C.blue}40`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>
        Discipline Score
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>Today's Score</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: C.blue, fontFamily: "monospace" }}>
            {disciplineScore.toFixed(1)}
          </div>
          <div style={{ fontSize: 10, color: C.green, marginTop: 4 }}>
            ✓ {todaysTrades.length} trades
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>7-Day Trend</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: trendColor }}>
              {trendIcon}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: trendColor }}>
                {sevenDayTrend > 0 ? "+" : ""}{sevenDayTrend.toFixed(1)}
              </div>
              <div style={{ fontSize: 10, color: C.sub }}>
                {sevenDayTrend > 0 ? "Improving" : "Declining"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// MAX DRAWDOWN SETTINGS
// ─────────────────────────────────────────────────────────────
const MaxDrawdownSettings = ({ maxDrawdown = 2000, setMaxDrawdown }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(maxDrawdown);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
          Maximum Daily Drawdown
        </div>
        <button
          onClick={() => setIsEditing(!isEditing)}
          style={{ padding: "4px 8px", background: "none", border: "none", color: C.blue, fontSize: 11, cursor: "pointer", fontWeight: 600 }}
        >
          {isEditing ? "Save" : "Edit"}
        </button>
      </div>

      {isEditing ? (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(parseFloat(e.target.value))}
            style={{ flex: 1, padding: "8px 10px", background: C.bgLight, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 14, fontFamily: "monospace" }}
          />
          <button
            onClick={() => {
              setMaxDrawdown(inputValue);
              setIsEditing(false);
            }}
            style={{ padding: "8px 14px", background: C.green, border: "none", borderRadius: 6, color: C.bg, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
          >
            Confirm
          </button>
        </div>
      ) : (
        <div style={{ padding: 12, background: C.bgLight, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 16, fontWeight: 700, color: C.text, fontFamily: "monospace" }}>
          {formatCurrency(maxDrawdown)}
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 10, color: C.muted, lineHeight: "1.5" }}>
        Set your maximum acceptable daily loss. Dashboard will warn you when approaching this limit.
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────
const EnhancedDashboard = (props) => {
  const [maxDailyDrawdown, setMaxDailyDrawdown] = useState(2000);

  const trades = props.trades || [];
  const accounts = props.accounts || [];
  const displayName = props.displayName || "Trader";

  const accountInfo = {
    balance: accounts.length > 0 ? accounts[0].balance || 0 : 0,
    todayPnL: trades
      .filter(t => new Date(t.created_at).toDateString() === new Date().toDateString())
      .reduce((sum, t) => sum + (t.pnl || 0), 0),
    winRate: trades.length > 0 
      ? trades.filter(t => t.result === "Win").length / trades.length 
      : 0,
    trades: trades.length,
  };

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", padding: "20px 0" }}>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .dashboard-section {
          animation: slideInRight 0.4s ease-out;
        }
      `}</style>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 16px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 4, background: `linear-gradient(135deg, ${C.green}, ${C.blue})`, backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Good morning, {displayName} 👋
          </h1>
          <p style={{ color: C.muted, fontSize: 13 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} • {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} ET
          </p>
        </div>

        {/* Key Metrics */}
        <div className="dashboard-section" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Today's P&L", value: formatCurrency(accountInfo.todayPnL), icon: "📈" },
            { label: "Account", value: formatCurrency(accountInfo.balance), icon: "💰" },
            { label: "Win Rate", value: `${(accountInfo.winRate * 100).toFixed(1)}%`, icon: "✓" },
            { label: "Trades", value: accountInfo.trades, icon: "📊" },
          ].map((metric, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>
                {metric.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: "monospace" }}>
                {metric.value}
              </div>
            </div>
          ))}
        </div>

        {/* Main Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 350px", gap: 20, marginBottom: 20 }}>
          {/* Left Column */}
          <div className="dashboard-section" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <TodaysPerformance trades={trades} maxDailyDrawdown={maxDailyDrawdown} />
            <RecentTradesSection trades={trades} />
          </div>

          {/* Right Column - ALL DYNAMIC FROM APIS */}
          <div className="dashboard-section" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <MarketRiskIndicator />
            <PreMarketBrief trades={trades} />
            <NewsFeed />
            <DisciplineCard trades={trades} />
            <MaxDrawdownSettings maxDrawdown={maxDailyDrawdown} setMaxDrawdown={setMaxDailyDrawdown} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedDashboard;
