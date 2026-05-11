import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid
} from "recharts";
import { TradeHistoryModal } from "./components/TradeHistoryModal";
import { BehaviorAnalytics } from "./components/BehaviorAnalytics";   // ← Make sure this file exists
import "./styles/MODAL_STYLES.css";

// ─────────────────────────────────────────────────────────────
// SUPABASE CONFIG + AUTH + OTHER CODE (unchanged parts)
// ─────────────────────────────────────────────────────────────
// ... [All your existing SUPABASE CONFIG, authHeaders, ensureValidToken, sb object, SCHEMA_SQL, SEED_TRADES, etc. remain the same] ...

// Keep all your existing utility functions: useLocalStorage, useAuth, createTradeEvent, detectChanges, etc.
// I'll keep the structure clean and only highlight the important changes.

const C = {
  bg: "#08090f", panel: "#0f111a", border: "#1c1f30",
  green: "#00e676", red: "#ff1744", yellow: "#ffd600",
  blue: "#4f8ef7", purple: "#a78bfa",
  text: "#f0f2ff", muted: "#4b5572", sub: "#8892b0",
};

// ... (keep all your existing functions: fmt$, fmtPct, useSupabase, useCalendar, parseCSV, buildAnalytics, UI primitives, SetupBanner, etc.)

// ─────────────────────────────────────────────────────────────
// DASHBOARD (unchanged)
// ─────────────────────────────────────────────────────────────
function Dashboard({ trades, setView, showSetup, setShowSetup, displayName = "Trader" }) {
  // ... your existing Dashboard code (no changes needed here)
  // ...
}

// ─────────────────────────────────────────────────────────────
// TRADE ENTRY, TRADE REVIEW, etc. (keep as is for now)
// ─────────────────────────────────────────────────────────────
// ... keep your TradeEntry, TradeReview, Analytics, Market, TradeLog, etc.

// Updated Analytics Component with better Behavior tab
function Analytics({ trades }) {
  const analytics = useMemo(() => buildAnalytics(trades), [trades]);
  const [tab, setTab] = useState("overview");

  if (!analytics) return <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>No trade data yet. Log some trades first.</div>;

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>Analytics</h2>
      <p style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>Deep performance insights · {analytics.total} trades</p>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, background: "#0b0d19", border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, marginBottom: 20, overflowX: "auto" }}>
        {[
          ["overview", "Overview"], 
          ["charts", "Charts"], 
          ["heatmap", "Heatmap"], 
          ["setups", "By Setup"], 
          ["insights", "AI Insights"], 
          ["behavior", "🧠 Behavior"]
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ 
              flex: 1, minWidth: 80, padding: "8px", borderRadius: 7, border: "none", 
              background: tab === id ? C.panel : "transparent", 
              color: tab === id ? C.text : C.muted, 
              cursor: "pointer", fontSize: 12, fontWeight: tab === id ? 700 : 400 
            }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && ( /* your existing overview code */ )}
      {tab === "charts" && ( /* your existing charts code */ )}
      {tab === "heatmap" && ( /* your existing heatmap */ )}
      {tab === "setups" && ( /* your existing setups */ )}
      {tab === "insights" && <AIInsights trades={trades} analytics={analytics} />}

      {/* Updated Behavior Tab */}
      {tab === "behavior" && (
        <BehaviorAnalytics trades={trades} />
      )}
    </div>
  );
}

// Keep your existing AIInsights and other components...

// ─────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard", label: "Dashboard", emoji: "🏠" },
  { id: "entry", label: "Trade Entry", emoji: "✍️" },
  { id: "review", label: "Review", emoji: "🧠" },
  { id: "analytics", label: "Analytics", emoji: "📊" },
  { id: "market", label: "Market", emoji: "🌍" },
  { id: "journal", label: "Journal", emoji: "📋" },
];

export default function App() {
  const [view, setView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSetup, setShowSetup] = useLocalStorage("fos_setup_banner", true);

  const { session, profile, authLoading, authError, signIn, signUp, signOut, updateProfile, isLoggedIn } = useAuth();
  const userId = session?.user?.id || null;
  const { trades, addTrade, deleteTrade, updateTrade, isConfigured } = useSupabase(userId);

  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(null);

  const openTradeModal = (trade) => {
    setSelectedTrade(trade);
    setIsTradeModalOpen(true);
  };

  const activeNav = ["checklist"].includes(view) ? "entry" : view;
  const displayName = profile?.display_name || session?.user?.email?.split("@")[0] || "Trader";

  // Password reset check
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const resetToken = hashParams.get("access_token");
  const tokenType = hashParams.get("type");
  const isPasswordReset = resetToken && tokenType === "recovery";

  if (isPasswordReset) {
    return <ResetPasswordPage onBack={() => window.location.href = "/"} />;
  }

  if (!isLoggedIn) {
    return <LoginScreen signIn={signIn} signUp={signUp} authLoading={authLoading} authError={authError} />;
  }

  const views = {
    dashboard: () => <Dashboard trades={trades} setView={setView} showSetup={showSetup && !isConfigured} setShowSetup={setShowSetup} displayName={displayName} />,
    entry: () => <TradeEntry addTrade={addTrade} updateTrade={updateTrade} setView={setView} trades={trades} />,
    review: () => <TradeReview trades={trades} setView={setView} />,
    checklist: () => <TradeChecklist setView={setView} />,
    analytics: () => <Analytics trades={trades} />,
    market: () => <Market />,
    journal: () => <TradeLog trades={trades} deleteTrade={deleteTrade} updateTrade={updateTrade} setView={setView} openTradeModal={openTradeModal} />,
    profile: () => <ProfileSettings profile={profile} updateProfile={updateProfile} signOut={signOut} setView={setView} />
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Sans', -apple-system, sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Your existing Top bar, Sidebar, Main Content, Bottom Nav remain the same */}
      {/* ... (keep all your UI structure as is) ... */}

      <main style={{ flex: 1, padding: "20px 16px 90px", maxWidth: 960, margin: "0 auto", width: "100%" }}>
        {(views[view] || views.dashboard)()}
      </main>

      {/* Bottom Nav and TradeHistoryModal remain unchanged */}
      {/* ... */}
    </div>
  );
}