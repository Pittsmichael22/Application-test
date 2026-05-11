import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid
} from "recharts";
import { TradeHistoryModal } from "./components/TradeHistoryModal";
import { BehaviorAnalytics } from "./components/BehaviorAnalytics";
import "./styles/MODAL_STYLES.css";

// ─────────────────────────────────────────────────────────────
// SUPABASE CONFIG + ALL YOUR CONSTANTS
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://wgyxegrtqoafaipizkzs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndneXhlZ3J0cW9hZmFpcGl6a3pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTg3NTcsImV4cCI6MjA5MjM5NDc1N30.KP3DE4414of-bzFoSJ2jePyccO3jL3Gp2cve7DkOp5k";

let _token = localStorage.getItem("fos_token") || null;
let _refreshToken = localStorage.getItem("fos_refresh_token") || null;
let _tokenExpiry = localStorage.getItem("fos_token_expiry") ? parseInt(localStorage.getItem("fos_token_expiry")) : null;

const authHeaders = () => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${_token || SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
});

const ensureValidToken = async () => {
  const now = Date.now() / 1000;
  if (_tokenExpiry && now > (_tokenExpiry - 60)) {
    console.log("Token expiring soon, attempting refresh...");
    if (_refreshToken) {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: _refreshToken })
        });
        const data = await res.json();
        if (data.access_token) {
          sb.setToken(data.access_token, data.refresh_token, data.expires_in);
          console.log("✓ Token refreshed successfully");
          return true;
        }
      } catch (e) {
        console.error("Token refresh failed:", e);
      }
    }
  }
  return true;
};

const sb = {
  setToken(token, refreshToken = null, expiresIn = 3600) {
    _token = token;
    _refreshToken = refreshToken || localStorage.getItem("fos_refresh_token");
    _tokenExpiry = Math.floor(Date.now() / 1000) + (expiresIn || 3600);
    if (token) {
      localStorage.setItem("fos_token", token);
      if (refreshToken) localStorage.setItem("fos_refresh_token", refreshToken);
      localStorage.setItem("fos_token_expiry", _tokenExpiry.toString());
    } else {
      localStorage.removeItem("fos_token");
      localStorage.removeItem("fos_refresh_token");
      localStorage.removeItem("fos_token_expiry");
    }
  },
  async query(table, opts = {}) {
    const params = new URLSearchParams();
    if (opts.select) params.set("select", opts.select);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`, {
      headers: authHeaders(),
    });
    return res.json();
  },
  async insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...authHeaders(), Prefer: "return=representation" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async signOut() {
    _token = null;
    localStorage.removeItem("fos_token");
  }
};

// Keep all your SCHEMA_SQL, SEED_TRADES, DEFAULT_CHECKLIST, C, useLocalStorage, useAuth, createTradeEvent, detectChanges, determineEventType, fmt$, fmtPct here (everything up to useSupabase)




// ─────────────────────────────────────────────────────────────
// SUPABASE SCHEMA (run this SQL in your Supabase SQL editor)
// ─────────────────────────────────────────────────────────────
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  trade_date DATE DEFAULT CURRENT_DATE,
  trade_time TIME DEFAULT CURRENT_TIME,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  entry_price NUMERIC,
  exit_price NUMERIC,
  position_size NUMERIC DEFAULT 1,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  pnl NUMERIC,
  result TEXT,
  setup_type TEXT,
  discipline_score INTEGER,
  duration_minutes INTEGER,
  notes TEXT,
  mental_state TEXT,
  emotional_intensity INTEGER,
  trade_behaviors TEXT[],
  trend_aligned BOOLEAN DEFAULT false,
  setup_valid BOOLEAN DEFAULT false,
  risk_ok BOOLEAN DEFAULT false,
  is_closed BOOLEAN DEFAULT true,
  version INT DEFAULT 1,
  
  -- 🆕 BEHAVIOR ANALYTICS COLUMNS (Phase 1-2)
  decision_speed TEXT,           -- "fast" | "moderate" | "overthink"
  conviction_level INTEGER,      -- 1-10 (entered PRE-trade)
  entry_signal TEXT,             -- "ma_cross" | "support_bounce" | "breakout" | etc.
  fear_level INTEGER,            -- 1-10 (entered POST-trade)
  greed_level INTEGER,           -- 1-10 (entered POST-trade)
  market_condition TEXT,         -- "trending_up" | "trending_down" | "ranging" | "volatile"
  rule_violations TEXT[],        -- ["risked_too_much", "no_stop_loss", "emotional_entry"]
  exit_reason TEXT,              -- "target_hit" | "stop_hit" | "manual_exit" | "abandoned"
  is_news_event BOOLEAN DEFAULT false,
  pre_trade_checklist_passed BOOLEAN DEFAULT false,
  post_trade_reflection TEXT
);

CREATE TABLE IF NOT EXISTS trade_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_event_type CHECK (event_type IN ('CREATED', 'EDITED', 'STOP_MOVED', 'TP_MOVED', 'PARTIAL_EXIT', 'FULL_EXIT', 'NOTE_ADDED', 'RULE_VIOLATION'))
);

CREATE INDEX IF NOT EXISTS idx_trade_events_trade_id ON trade_events(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_events_created_at ON trade_events(created_at);
`;


// ─────────────────────────────────────────────────────────────
// SEED DATA (used when Supabase is not configured)
// ─────────────────────────────────────────────────────────────
const SEED_TRADES = [
  { id: "1", trade_date: "2025-05-21", trade_time: "09:02:00", symbol: "NQ", direction: "Long", entry_price: 21450.25, exit_price: 21487.50, position_size: 1, pnl: 725, setup_type: "A+", result: "Win", discipline_score: 9, duration_minutes: 12 },
  { id: "2", trade_date: "2025-05-21", trade_time: "08:45:00", symbol: "ES", direction: "Long", entry_price: 5312.50, exit_price: 5323.00, position_size: 1, pnl: 520, setup_type: "B", result: "Win", discipline_score: 8, duration_minutes: 28 },
  { id: "3", trade_date: "2025-05-21", trade_time: "07:55:00", symbol: "NQ", direction: "Short", entry_price: 21480.00, exit_price: 21487.50, position_size: 1, pnl: -378.20, setup_type: "B", result: "Loss", discipline_score: 5, duration_minutes: 8 },
  { id: "4", trade_date: "2025-05-20", trade_time: "10:15:00", symbol: "NQ", direction: "Long", entry_price: 21320.00, exit_price: 21368.00, position_size: 1, pnl: 960, setup_type: "A+", result: "Win", discipline_score: 10, duration_minutes: 35 },
  { id: "5", trade_date: "2025-05-20", trade_time: "14:30:00", symbol: "ES", direction: "Short", entry_price: 5298.00, exit_price: 5292.50, position_size: 2, pnl: 540, setup_type: "A", result: "Win", discipline_score: 8, duration_minutes: 18 },
  { id: "6", trade_date: "2025-05-19", trade_time: "09:45:00", symbol: "NQ", direction: "Long", entry_price: 21210.00, exit_price: 21190.00, position_size: 1, pnl: -400, setup_type: "B", result: "Loss", discipline_score: 4, duration_minutes: 22 },
  { id: "7", trade_date: "2025-05-19", trade_time: "11:00:00", symbol: "NQ", direction: "Long", entry_price: 21185.00, exit_price: 21240.00, position_size: 1, pnl: 1100, setup_type: "A+", result: "Win", discipline_score: 9, duration_minutes: 45 },
  { id: "8", trade_date: "2025-05-16", trade_time: "09:32:00", symbol: "ES", direction: "Long", entry_price: 5265.00, exit_price: 5278.75, position_size: 1, pnl: 680, setup_type: "A+", result: "Win", discipline_score: 9, duration_minutes: 20 },
  { id: "9", trade_date: "2025-05-16", trade_time: "13:45:00", symbol: "NQ", direction: "Short", entry_price: 21340.00, exit_price: 21355.00, position_size: 1, pnl: -300, setup_type: "C", result: "Loss", discipline_score: 3, duration_minutes: 6 },
  { id: "10", trade_date: "2025-05-15", trade_time: "09:35:00", symbol: "NQ", direction: "Long", entry_price: 21120.00, exit_price: 21185.00, position_size: 1, pnl: 1300, setup_type: "A+", result: "Win", discipline_score: 10, duration_minutes: 55 },
];


// ─────────────────────────────────────────────────────────────
// DEFAULT CHECKLIST ITEMS
// ─────────────────────────────────────────────────────────────
const DEFAULT_CHECKLIST = [
  { id: "htf",       text: "Higher Timeframe Review",                                          category: "Setup" },
  { id: "indicators",text: "Key Indicators Identified",                                        category: "Setup" },
  { id: "volatility",text: "Volatility & Conditions Check (news about to drop?)",              category: "Setup" },
  { id: "strategy",  text: "Strategy Confirmation (Entry Trigger Met)",                        category: "Setup" },
  { id: "risk",      text: "Was Risk Defined/Set BEFORE Entry",                                category: "Risk" },
  { id: "execution", text: "Execution Readiness (Strategy, Brackets set, trigger preset, no hesitation)", category: "Risk" },
  { id: "mental",    text: "Mental State Check",                                               category: "Mental" },
  { id: "followed",  text: "Did I follow my checklist?",                                       category: "Review" },
  { id: "clean",     text: "Was entry clean or impulsive?",                                    category: "Review" },
  { id: "aplus",     text: "Was this A+ setup or forced?",                                     category: "Review" },
];

// ─────────────────────────────────────────────────────────────
// COLORS & THEME
// ─────────────────────────────────────────────────────────────
const C = {
  bg: "#08090f",
  panel: "#0f111a",
  border: "#1c1f30",

  green: "#00e676",
  red: "#ff1744",
  yellow: "#ffd600",
  blue: "#4f8ef7",
  purple: "#a78bfa",

  text: "#f0f2ff",      // main bright text
  muted: "#a8b0cc",     // ← improved (was #4b5572)
  sub: "#c0c8e0",       // ← improved (was #8892b0)
};
// ─────────────────────────────────────────────────────────────// UTILITY HOOKS & HELPERS
// ─────────────────────────────────────────────────────────────
function useLocalStorage(key, init) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; } catch { return init; }
  });
  const set = useCallback(v => {
    setVal(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key]);
  return [val, set];
}

// ─────────────────────────────────────────────────────────────
// AUTH HOOK
// ─────────────────────────────────────────────────────────────
function useAuth() {
  const [session, setSession] = useLocalStorage("fos_session", null);
  const [profile, setProfile] = useLocalStorage("fos_profile", null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // Restore token on mount
  useEffect(() => {
    if (session?.access_token) {
      const refreshToken = localStorage.getItem("fos_refresh_token");
      const expiryStr = localStorage.getItem("fos_token_expiry");
      const expiryTime = expiryStr ? parseInt(expiryStr) : null;
      
      // Calculate remaining TTL
      const now = Math.floor(Date.now() / 1000);
      let expiresIn = 3600; // default 1 hour
      
      if (expiryTime) {
        expiresIn = Math.max(0, expiryTime - now);
      }
      
      sb.setToken(session.access_token, refreshToken, expiresIn);
      console.log("✓ Restored token from session, expires in", expiresIn, "seconds");
    }
  }, [session?.access_token]);

  const fetchProfile = useCallback(async (userId, token) => {
    if (token) sb.setToken(token);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token || _token}` } }
      );
      const data = await res.json();
      if (data?.[0]) setProfile(data[0]);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signUp = async (email, password, displayName) => {
    setAuthLoading(true); setAuthError("");
    try {
      // Step 1: register the account
      const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const signupData = await signupRes.json();
      if (signupData.error || signupData.msg) {
        setAuthError(signupData.error_description || signupData.msg || "Sign up failed");
        setAuthLoading(false); return { ok: false };
      }

      // Step 2: always try to sign in immediately after
      // Works whether email confirmation is on or off
      const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const loginData = await loginRes.json();

      if (loginData.access_token) {
        // Logged in — create profile and enter app
        sb.setToken(loginData.access_token, loginData.refresh_token, loginData.expires_in);
        setSession(loginData);
        const userId = loginData.user?.id;
        if (userId) {
          await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
            method: "POST",
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${loginData.access_token}`, "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify({ id: userId, display_name: displayName || email.split("@")[0], email })
          });
          await fetchProfile(userId, loginData.access_token);
        }
        setAuthLoading(false); return { ok: true };
      }

      // If login failed after signup, email confirmation is still required
      setAuthLoading(false); return { ok: false, confirm: true };

    } catch (e) {
      setAuthError("Connection error. Check your internet and try again.");
      setAuthLoading(false); return { ok: false };
    }
  };

  const signIn = async (email, password) => {
    setAuthLoading(true); setAuthError("");
    try {
      // Timeout after 10 seconds so it never hangs forever
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();

      if (!res.ok || data.error || data.error_code) {
        const msg = data.error_description || data.msg || data.error || "Invalid email or password";
        setAuthError(msg);
        setAuthLoading(false); return false;
      }

      if (!data.access_token) {
        setAuthError("Login failed — no session returned. Check your credentials.");
        setAuthLoading(false); return false;
      }

      sb.setToken(data.access_token, data.refresh_token, data.expires_in);
      setSession(data);
      if (data.user?.id) await fetchProfile(data.user.id, data.access_token);
      setAuthLoading(false); return true;

    } catch (e) {
      if (e.name === "AbortError") {
        setAuthError("Request timed out. Check your internet connection.");
      } else {
        setAuthError("Could not connect to auth server. Try again.");
      }
      setAuthLoading(false); return false;
    }
  };

  const signOut = async () => {
    await sb.signOut();
    // Clear all user-specific localStorage on logout
    const userId = session?.user?.id;
    if (userId) {
      try { localStorage.removeItem(`fos_trades_${userId}`); } catch {}
    }
    setSession(null); setProfile(null);
  };

  const updateProfile = async (updates) => {
    if (!session?.user?.id) return;
    const userId = session.user.id;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      setProfile(prev => ({ ...prev, ...updates }));
    } catch {}
  };

  return { session, profile, authLoading, authError, signUp, signIn, signOut, updateProfile, isLoggedIn: !!session?.access_token };
}

// ─────────────────────────────────────────────────────────────
// TRADE EVENT TRACKING UTILITIES
// ─────────────────────────────────────────────────────────────
async function createTradeEvent(tradeId, eventType, oldData, newData, reason = null) {
  try {
    const eventData = {
      trade_id: tradeId,
      event_type: eventType,
      old_data: oldData || null,
      new_data: newData || null,
      reason: reason || null,
    };
    
    await fetch(`${SUPABASE_URL}/rest/v1/trade_events`, {
      method: "POST",
      headers: { ...authHeaders(), Prefer: "return=representation" },
      body: JSON.stringify(eventData),
    });
    
    console.log(`✓ Event logged: ${eventType} for trade ${tradeId}`);
  } catch (error) {
    console.error("Error creating trade event:", error);
  }
}

// Detect what changed between old and new trade data
function detectChanges(oldTrade, newTrade) {
  const changes = {};
  const keys = Object.keys(newTrade);
  
  for (let key of keys) {
    if (key === 'id' || key === 'created_at' || key === 'updated_at' || key === 'version') continue;
    
    const oldVal = oldTrade?.[key];
    const newVal = newTrade[key];
    
    // Deep compare for arrays
    const oldStr = JSON.stringify(oldVal);
    const newStr = JSON.stringify(newVal);
    
    if (oldStr !== newStr) {
      changes[key] = { from: oldVal, to: newVal };
    }
  }
  
  return changes;
}

// Determine event type based on changes
function determineEventType(changes) {
  if (changes.stop_loss && !changes.take_profit && Object.keys(changes).length === 1) return 'STOP_MOVED';
  if (changes.take_profit && !changes.stop_loss && Object.keys(changes).length === 1) return 'TP_MOVED';
  if (changes.notes && Object.keys(changes).length === 1) return 'NOTE_ADDED';
  if (changes.exit_price || changes.pnl) return 'FULL_EXIT';
  return 'EDITED';
}


function fmt$(n) {
  if (n === null || n === undefined) return "—";
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}
function fmtPct(n) { return `${(n * 100).toFixed(1)}%`; }
// ─────────────────────────────────────────────────────────────
// SUPABASE HOOK - Updated with User-Specific Custom Strategies
// ─────────────────────────────────────────────────────────────
function useSupabase(userId) {
  // Always configured — credentials are hardcoded
  const isConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  const [trades, setTrades] = useLocalStorage(`fos_trades_${userId || "demo"}`, userId ? [] : SEED_TRADES);
  const [customStrategies, setCustomStrategies] = useLocalStorage(`fos_custom_strategies_${userId || "demo"}`, []);
  const [loading, setLoading] = useState(false);

  const fetchTrades = useCallback(async () => {
    if (!isConfigured || !userId) {
      console.log("fetchTrades skipped: isConfigured=" + isConfigured + ", userId=" + userId);
      return;
    }
    setLoading(true);
    try {
      // Ensure token is fresh before fetching
      await ensureValidToken();
      
      // Filter by user_id so each user only sees their own trades
      const params = new URLSearchParams({
        select: "*",
        order: "created_at.desc",
        limit: "500",
        user_id: `eq.${userId}`,
      });
      const url = `${SUPABASE_URL}/rest/v1/trades?${params}`;
      console.log("Fetching trades from:", url);
      console.log("Using token:", _token ? "✓ (present)" : "✗ (missing)");
      console.log("User ID:", userId);
      
      const res = await fetch(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${_token || SUPABASE_ANON_KEY}` }
      });
      
      console.log("Fetch response status:", res.status);
      const data = await res.json();
      console.log("Trades data:", data);
      
      if (Array.isArray(data)) {
        console.log("✓ Loaded " + data.length + " trades");
        setTrades(data);
      } else if (data.code) {
        console.error("Supabase error:", data.code, data.message);
      }
    } catch (e) { console.error("fetchTrades error:", e); }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, userId]);

  // Fetch Custom Strategies
  const fetchCustomStrategies = useCallback(async () => {
    if (!isConfigured || !userId) return;
    try {
      await ensureValidToken();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/custom_strategies?user_id=eq.${userId}&order=created_at.desc`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${_token || SUPABASE_ANON_KEY}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) setCustomStrategies(data);
    } catch (e) { console.error("fetchCustomStrategies error:", e); }
  }, [isConfigured, userId]);

  // Refetch whenever userId changes (login/logout)
  useEffect(() => { 
    fetchTrades(); 
    fetchCustomStrategies();
  }, [fetchTrades, fetchCustomStrategies]);

  // ─────────────────────────────────────────────────────────────
  // YOUR ORIGINAL addTrade, deleteTrade, updateTrade
  // ─────────────────────────────────────────────────────────────
  const addTrade = useCallback(async (trade, overrideDate = null, overrideTime = null) => {
    const now = new Date();
 
    // Generate a proper UUID v4
    const generateUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : ((r & 0x3) | 0x8);
        return v.toString(16);
      });
    };
 
    // Helper function to convert values to correct types for Supabase
    const toNumeric = (val) => val ? parseFloat(val) : null;
    const toInt = (val) => val ? parseInt(val, 10) : null;
    const toBoolean = (val) => val === true || val === 'true' || val === 1 ? true : false;
    const toArray = (val) => Array.isArray(val) ? val : (val ? [val] : null);
 
    // Build the trade object with proper type conversions
    const newTrade = {
      id: generateUUID(),
      user_id: userId,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      // ✅ FIX date format: ensure it's YYYY-MM-DD format
      trade_date: overrideDate || (trade.trade_date || new Date().toISOString().split("T")[0]).split("T")[0],
      trade_time: overrideTime || trade.trade_time || now.toTimeString().split(" ")[0].substring(0, 5),
      symbol: trade.symbol || null,
      // ✅ USE direction from trade (already computed in handleManualSubmit)
      direction: trade.direction || null,
      entry_price: toNumeric(trade.entry_price),
      exit_price: toNumeric(trade.exit_price),
      stop_loss: toNumeric(trade.stop_loss),
      take_profit: toNumeric(trade.take_profit),
      position_size: toNumeric(trade.position_size) || 1,
      pnl: toNumeric(trade.pnl),
      // ✅ USE result from trade (already computed in handleManualSubmit)
      result: trade.result || null,
      duration_minutes: toInt(trade.duration_minutes),
      // ✅ USE setup_type from trade (already computed in handleManualSubmit)
      setup_type: trade.setup_type || null,
      notes: trade.notes || null,
      mental_state: trade.mental_state || null,
      emotional_intensity: toInt(trade.emotional_intensity),
      trade_behaviors: toArray(trade.trade_behaviors),
      trend_aligned: toBoolean(trade.trend_aligned),
      setup_valid: toBoolean(trade.setup_valid),
      risk_ok: toBoolean(trade.risk_ok),
      discipline_score: toInt(trade.discipline_score),
      // ✅ FIX: Use is_closed from trade, or default to true (trade closed on entry)
      is_closed: trade.is_closed !== undefined ? toBoolean(trade.is_closed) : true,
      version: 1,
    };
 
    console.log("=== ADDING TRADE ===");
    console.log("Trade object to save:", JSON.stringify(newTrade, null, 2));
 
    if (isConfigured && userId) {
      await ensureValidToken();
     
      try {
        const url = `${SUPABASE_URL}/rest/v1/trades`;
        const res = await fetch(url, {
          method: "POST",
          headers: { 
            apikey: SUPABASE_ANON_KEY, 
            Authorization: `Bearer ${_token || SUPABASE_ANON_KEY}`, 
            "Content-Type": "application/json", 
            Prefer: "return=representation" 
          },
          body: JSON.stringify(newTrade)
        });
       
        const saved = await res.json();
       
        if (res.ok && saved && !saved.code) { 
          console.log("✓ Successfully saved to trades");
          // Log CREATED event
          await createTradeEvent(newTrade.id, 'CREATED', null, newTrade);
          setTrades(prev => [saved[0] || saved, ...prev]); 
          return saved[0] || saved;
        } else if (saved?.code) {
          console.error("Supabase error response:", saved.code, saved.message);
        }
      } catch (e) { 
        console.error("addTrade fetch error:", e); 
      }
    }
   
    setTrades(prev => [newTrade, ...prev]);
    return newTrade;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, userId]);

  const deleteTrade = useCallback(async (id) => {
    if (isConfigured && userId) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${id}&user_id=eq.${userId}`, {
          method: "DELETE",
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${_token || SUPABASE_ANON_KEY}` }
        });
      } catch (e) { console.error("deleteTrade error:", e); }
    }
    setTrades(prev => prev.filter(t => t.id !== id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, userId]);

  const updateTrade = useCallback(async (id, updates) => {
    // Ensure ID exists to avoid duplicates
    if (!id || id === 'undefined' || id === '') {
      console.error("❌ Cannot update trade without a valid ID");
      return { error: "Trade ID is required for edits" };
    }
   
    await ensureValidToken();
   
    // Get the old trade data for event tracking
    const oldTrade = trades.find(t => t.id === id);
    if (!oldTrade) {
      console.error("❌ Trade not found:", id);
      return { error: "Trade not found" };
    }
   
    // Increment version
    const updatedData = {
      ...updates,
      updated_at: new Date().toISOString(),
      version: (oldTrade.version || 1) + 1,
    };
   
    if (isConfigured && userId) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${id}`, {
          method: "PATCH",
          headers: { 
            apikey: SUPABASE_ANON_KEY, 
            Authorization: `Bearer ${_token || SUPABASE_ANON_KEY}`, 
            "Content-Type": "application/json", 
            Prefer: "return=representation" 
          },
          body: JSON.stringify(updatedData)
        });
       
        const saved = await res.json();
        if (res.ok && saved?.[0]) {
          console.log("✓ Trade updated successfully");
         
          // Detect what changed and log event
          const changes = detectChanges(oldTrade, updatedData);
          if (Object.keys(changes).length > 0) {
            const eventType = determineEventType(changes);
            await createTradeEvent(id, eventType, oldTrade, updatedData);
          }
         
          setTrades(prev => prev.map(t => t.id === id ? saved[0] : t));
          return saved[0];
        }
      } catch (e) { 
        console.error("updateTrade error:", e); 
      }
    }
   
    // Update local state if Supabase fails
    const merged = { ...oldTrade, ...updatedData };
    setTrades(prev => prev.map(t => t.id === id ? merged : t));
    return merged;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, userId, trades]);

  // ─────────────────────────────────────────────────────────────
  // CUSTOM STRATEGIES
  // ─────────────────────────────────────────────────────────────
  const addCustomStrategy = useCallback(async (strategy) => {
    if (!isConfigured || !userId) return null;
    const newStrategy = {
      user_id: userId,
      name: strategy.name,
      confirmation_factors: strategy.confirmation_factors || null,
      created_at: new Date().toISOString(),
    };
    try {
      await ensureValidToken();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/custom_strategies`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${_token || SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(newStrategy)
      });
      const saved = await res.json();
      if (res.ok && saved?.[0]) {
        setCustomStrategies(prev => [saved[0], ...prev]);
        return saved[0];
      }
    } catch (e) { console.error(e); }
    // Local fallback
    const local = { ...newStrategy, id: Date.now().toString() };
    setCustomStrategies(prev => [local, ...prev]);
    return local;
  }, [isConfigured, userId]);

  const deleteCustomStrategy = useCallback(async (id) => {
    if (isConfigured && userId) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/custom_strategies?id=eq.${id}&user_id=eq.${userId}`, {
          method: "DELETE",
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${_token || SUPABASE_ANON_KEY}` }
        });
      } catch (e) { console.error(e); }
    }
    setCustomStrategies(prev => prev.filter(s => s.id !== id));
  }, [isConfigured, userId]);

  return { 
    trades, 
    loading, 
    addTrade, 
    deleteTrade, 
    updateTrade, 
    refetch: fetchTrades,
    // Custom Strategies
    customStrategies,
    addCustomStrategy,
    deleteCustomStrategy,
    isConfigured 
  };
}





// ─────────────────────────────────────────────────────────────
// MANAGE CUSTOM STRATEGIES PAGE
// ─────────────────────────────────────────────────────────────


// =========================================================================
// MANAGE STRATEGIES - Toggle Built-in + Custom
// =========================================================================
function ManageStrategies({ 
  customStrategies, 
  addCustomStrategy, 
  deleteCustomStrategy, 
  setView,
  strategyPreferences,
  setStrategyPreferences 
}) {
  const [newStrategyName, setNewStrategyName] = useState("");

  const builtInList = [
    { value: "Breakout_NewHigh", label: "Breakout - New High/Low" },
    { value: "Pullback_Support", label: "Pullback to Support/Resistance" },
    { value: "Reversal_Candle", label: "Reversal Candle (Pinbar, Engulfing)" },
    { value: "InsideBar_Breakout", label: "Inside Bar Breakout" },
    { value: "Flag_Pennant", label: "Bull/Bear Flag or Pennant" },
    { value: "Trend_Continuation", label: "Trend Continuation" },
    { value: "MA_Crossover", label: "Moving Average Crossover" },
    { value: "EMA_Ribbon", label: "EMA Ribbon Alignment" },
    { value: "Volume_Spike", label: "Volume Spike + Price Action" },
    { value: "RSI_Divergence", label: "RSI Divergence" },
    { value: "Bollinger_Squeeze", label: "Bollinger Band Squeeze" },
    { value: "VWAP_Reclaim", label: "VWAP Reclaim" },
    { value: "Scalp_Momentum", label: "Scalp - Momentum Ignition" },
    { value: "Opening_Range_Breakout", label: "Opening Range Breakout (ORB)" },
    { value: "News_Catalyst", label: "News / Economic Catalyst" },
    { value: "Confluence_Multiple", label: "Multiple Indicator Confluence" },
    { value: "OrderFlow_Delta", label: "Order Flow / Delta Divergence" },
    { value: "Mean_Reversion", label: "Mean Reversion Setup" },
  ];

  const isEnabled = (value) => {
    return strategyPreferences.builtInEnabled[value] !== false;
  };

  const toggleBuiltIn = (value) => {
    const newPrefs = {
      ...strategyPreferences.builtInEnabled,
      [value]: !isEnabled(value)
    };
    setStrategyPreferences({ builtInEnabled: newPrefs });
  };

  const handleAddCustom = () => {
    if (newStrategyName.trim()) {
      addCustomStrategy({ 
        id: Date.now(), 
        name: newStrategyName.trim(), 
        enabled: true 
      });
      setNewStrategyName("");
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <button onClick={() => setView("dashboard")} style={{ color: C.muted }}>← Back</button>
      <h2>Manage Strategies</h2>
      <p style={{color: C.muted}}>Toggle which strategies appear in dropdowns.</p>

      <h3>Built-in Strategies</h3>
      <div style={{display: "grid", gap: 12, marginBottom: 40}}>
        {builtInList.map(s => (
          <div key={s.value} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px", background:"#1a1d2e", borderRadius:8}}>
            <span>{s.label}</span>
            <input 
              type="checkbox" 
              checked={isEnabled(s.value)} 
              onChange={() => toggleBuiltIn(s.value)}
            />
          </div>
        ))}
      </div>

      <h3>Your Custom Strategies</h3>
      <div style={{display:"flex", gap:12, marginBottom:20}}>
        <input
          type="text"
          value={newStrategyName}
          onChange={e => setNewStrategyName(e.target.value)}
          placeholder="New custom strategy name"
          style={{flex:1, padding:14, background:"#1a1d2e", border:`1px solid ${C.border}`, borderRadius:8}}
        />
        <Btn onClick={handleAddCustom}>Add</Btn>
      </div>

      {customStrategies.length > 0 && customStrategies.map(strat => (
        <div key={strat.id} style={{padding:"14px", background:"#1a1d2e", borderRadius:8, marginBottom:8, display:"flex", justifyContent:"space-between"}}>
          <span>{strat.name}</span>
          <button onClick={() => deleteCustomStrategy(strat.id)} style={{color: C.red}}>Delete</button>
        </div>
      ))}

      <Btn onClick={() => setView("entry")} style={{marginTop:40}}>Back to Trade Entry</Btn>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// CALENDAR HOOK — ForexFactory public JSON feed
// ─────────────────────────────────────────────────────────────
function useCalendar() {
  const [eventsByDay, setEventsByDay] = useState({});
  const [todayEvents, setTodayEvents] = useState([]);
  const [marketStatus, setMarketStatus] = useState("safe");
  const [nextHighImpact, setNextHighImpact] = useState(null);
  const [calLoading, setCalLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setCalLoading(true);
      try {
        const now = new Date();
        const nowMs = now.getTime();
        const etOptions = { timeZone: "America/New_York" };

        // Date range: today through 7 days ahead
        const pad = n => String(n).padStart(2, "0");
        const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
        const fromDate = fmtDate(now);
        const toDate = fmtDate(new Date(nowMs + 7 * 86400000));

        const res = await fetch(
          `https://finnhub.io/api/v1/calendar/economic?from=${fromDate}&to=${toDate}&token=d7lb131r01qm7o0b7520d7lb131r01qm7o0b752g`,
          { signal: AbortSignal.timeout(8000) }
        );
        const json = await res.json();

        // Finnhub returns { economicCalendar: [...] }
        const raw = json.economicCalendar || json || [];

        const todayLabelET = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...etOptions });
        const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" });
        const etOffset = etStr.includes("EDT") ? "-04:00" : "-05:00";

        const parsed = raw
          .filter(e => e.country === "US" || e.currency === "USD" || !e.country)
          .map(e => {
            // Finnhub format: { time: "2026-04-23 08:30:00", event: "...", impact: "high/medium/low", actual, estimate, prev, country }
            const raw = (e.time || e.date || "").replace(" ", "T");
            const withTZ = raw && !raw.includes("+") && !raw.includes("Z") ? raw + etOffset : raw;
            const dt = withTZ ? new Date(withTZ) : null;
            const dateLabel = dt
              ? dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...etOptions })
              : "Unknown";
            const timeLabel = dt
              ? dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", ...etOptions }) + " ET"
              : "All Day";
            return {
              dt, dateLabel,
              isToday: dateLabel === todayLabelET,
              time: timeLabel,
              event: e.event || e.title || "Unknown Event",
              impact: (e.impact || "low").toLowerCase(),
              currency: "USD",
              forecast: e.estimate || e.forecast || "—",
              previous: e.prev || e.previous || "—",
              actual: e.actual || null,
            };
          })
          .filter(e => e.dt && e.dt.getTime() >= nowMs - 60000) // only future + 60s buffer
          .sort((a, b) => a.dt - b.dt);

        // Group by day
        const grouped = {};
        parsed.forEach(e => {
          if (!grouped[e.dateLabel]) grouped[e.dateLabel] = [];
          grouped[e.dateLabel].push(e);
        });

        const todays = parsed.filter(e => e.isToday);
        setTodayEvents(todays);
        setEventsByDay(grouped);

        // Market status
        const upcomingHigh = todays
          .filter(e => e.impact === "high" && e.dt.getTime() > nowMs)
          .sort((a, b) => a.dt - b.dt);

        if (upcomingHigh.length > 0) {
          const next = upcomingHigh[0];
          const minsUntil = (next.dt.getTime() - nowMs) / 60000;
          setNextHighImpact({ ...next, minsUntil: Math.round(minsUntil) });
          setMarketStatus(minsUntil <= 15 ? "danger" : minsUntil <= 45 ? "caution" : "safe");
        } else {
          setMarketStatus("safe");
          setNextHighImpact(null);
        }

      } catch (err) {
        console.warn("Calendar fetch failed:", err.message);
        // Minimal fallback — just show empty state, don't fake data
        setTodayEvents([]);
        setEventsByDay({});
        setMarketStatus("safe");
      }
      setCalLoading(false);
    };
    load();
  }, []);

  return { eventsByDay, todayEvents, marketStatus, nextHighImpact, calLoading };
}

// ─────────────────────────────────────────────────────────────
// CSV IMPORT PARSER
// ─────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));

  // TopStep exact column names and common fallbacks
  const map = {
    id: ["id"],
    contract: ["contractname", "symbol", "instrument", "ticker"],
    entered_at: ["enteredat", "entry_time", "time"],
    exited_at: ["exitedat", "exit_time"],
    entry_price: ["entryprice", "entry_price", "open_price", "fill_price"],
    exit_price: ["exitprice", "exit_price", "close_price"],
    fees: ["fees"],
    commissions: ["commissions"],
    pnl: ["pnl", "profit_loss", "net_pnl"],
    size: ["size", "quantity", "qty", "contracts"],
    type: ["type"],
    trade_day: ["tradeday", "trade_date"],
    duration: ["tradeduration", "duration"]
  };

  const colIdx = {};
  Object.entries(map).forEach(([key, aliases]) => {
    colIdx[key] = headers.findIndex(h => aliases.includes(h));
  });

  return lines.slice(1).filter(l => l.trim()).map((line, idx) => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const get = (key) => (colIdx[key] !== -1 ? cols[colIdx[key]] : null);

    return {
      id: get("id") || `csv_${Date.now()}_${idx}`,
      symbol: get("contract") || "Unknown",
      entry_time: get("entered_at") || "", // Blank until input
      exit_time: get("exited_at") || "",
      entry_price: parseFloat(get("entry_price")) || 0,
      exit_price: parseFloat(get("exit_price")) || 0,
      fees: parseFloat(get("fees")) || 0,
      commissions: parseFloat(get("commissions")) || 0,
      pnl: parseFloat(get("pnl")) || 0,
      size: parseInt(get("size")) || 0,
      type: get("type") || "",
      trade_date: get("trade_day") || new Date().toISOString().split("T")[0],
      duration: get("duration") || "",
      created_at: new Date().toISOString() // Full ISO datetime with offset
    };
  });
}



// ─────────────────────────────────────────────────────────────
// ANALYTICS ENGINE
// ─────────────────────────────────────────────────────────────
function buildAnalytics(trades) {
  if (!trades.length) return null;

  const wins = trades.filter(t => t.result === "Win");
  const losses = trades.filter(t => t.result === "Loss");
  const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const winRate = wins.length / trades.length;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : 0;

  // Equity curve
  const sorted = [...trades].sort((a, b) => new Date(a.trade_date + " " + (a.trade_time || "00:00")) - new Date(b.trade_date + " " + (b.trade_time || "00:00")));
  let running = 0;
  const equityCurve = sorted.map(t => { running += t.pnl || 0; return { date: t.trade_date?.slice(5), v: Math.round(running) }; });

  // Drawdown
  let peak = 0;
  const drawdown = equityCurve.map(p => { peak = Math.max(peak, p.v); return { date: p.date, v: Math.min(0, p.v - peak) }; });

  // By setup
  const bySetup = {};
  trades.forEach(t => {
    const s = t.setup_type || "Unknown";
    if (!bySetup[s]) bySetup[s] = { wins: 0, total: 0, pnl: 0 };
    bySetup[s].total++;
    if (t.result === "Win") bySetup[s].wins++;
    bySetup[s].pnl += t.pnl || 0;
  });
  const setupData = Object.entries(bySetup).map(([setup, d]) => ({ setup, winRate: Math.round(d.wins / d.total * 100), total: d.total, pnl: Math.round(d.pnl) }));

  // Time-of-day heatmap (30-min buckets)
  const hourBuckets = {};
  trades.forEach(t => {
    if (!t.trade_time) return;
    const [h, m] = t.trade_time.split(":").map(Number);
    const slot = `${h}:${m < 30 ? "00" : "30"}`;
    if (!hourBuckets[slot]) hourBuckets[slot] = { wins: 0, losses: 0, pnl: 0 };
    if (t.result === "Win") hourBuckets[slot].wins++;
    else if (t.result === "Loss") hourBuckets[slot].losses++;
    hourBuckets[slot].pnl += t.pnl || 0;
  });
  const heatmap = [...Object.entries(hourBuckets)].sort(([a], [b]) => a.localeCompare(b))
    .map(([slot, d]) => ({ slot, ...d, total: d.wins + d.losses, wr: d.wins / (d.wins + d.losses || 1) }));

  // Streak
  let streak = 0, maxStreak = 0, curSign = null;
  for (const t of sorted) {
    const s = t.result === "Win" ? 1 : -1;
    if (s === curSign) { streak++; if (s === 1) maxStreak = Math.max(maxStreak, streak); }
    else { streak = 1; curSign = s; }
  }
  const lastResult = sorted[sorted.length - 1]?.result;
  let curStreak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].result === lastResult) curStreak++;
    else break;
  }

  // Daily P&L
  const byDay = {};
  trades.forEach(t => {
    const d = t.trade_date || "Unknown";
    if (!byDay[d]) byDay[d] = 0;
    byDay[d] += t.pnl || 0;
  });
  const dailyPnl = [...Object.entries(byDay)].sort().map(([d, v]) => ({ d: d.slice(5), v: Math.round(v) }));

  return { totalPnl, winRate, avgWin, avgLoss, profitFactor, equityCurve, drawdown, setupData, heatmap, wins: wins.length, losses: losses.length, total: trades.length, maxStreak, curStreak, lastResult, dailyPnl };
}

// ─────────────────────────────────────────────────────────────
// UI PRIMITIVES
// ─────────────────────────────────────────────────────────────
function Card({ children, style, glow }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${glow ? glow + "40" : C.border}`, borderRadius: 14, padding: 20, boxShadow: glow ? `0 0 20px ${glow}10` : "none", ...style }}>
      {children}
    </div>
  );
}

function Tag({ label, color, bg }) {
  return <span style={{ background: bg || color + "18", border: `1px solid ${color}30`, color, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{label}</span>;
}

function Pill({ value, positive }) {
  const c = value > 0 ? C.green : value < 0 ? C.red : C.muted;
  return <span style={{ color: c, fontFamily: "monospace", fontWeight: 700 }}>{fmt$(value)}</span>;
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: "0.1em" }}>{children}</div>
      {action}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", disabled, style }) {
  const styles = {
    primary: { background: `linear-gradient(135deg, ${C.green}, #00c853)`, color: "#000", border: "none" },
    ghost: { background: "transparent", color: C.sub, border: `1px solid ${C.border}` },
    danger: { background: C.red + "18", color: C.red, border: `1px solid ${C.red}30` },
    blue: { background: `linear-gradient(135deg, ${C.blue}, #6366f1)`, color: "#fff", border: "none" },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, transition: "all 0.15s", letterSpacing: "0.04em", ...styles[variant], ...style }}>
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// SETUP BANNER
// ─────────────────────────────────────────────────────────────
function SetupBanner({ onDismiss }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(SCHEMA_SQL); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div style={{ background: "linear-gradient(135deg, #1a1d2e, #161827)", border: `1px solid ${C.blue}40`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.blue, marginBottom: 6 }}>⚡ Connect Supabase for Live Persistence</div>
          <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
            Running in demo mode with local data. To enable real persistence:<br />
            1. Create a free project at <span style={{ color: C.blue }}>supabase.com</span><br />
            2. Run the SQL schema below in your SQL Editor<br />
            3. Paste your Project URL + Anon Key at the top of this file
          </div>
        </div>
        <button onClick={onDismiss} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18 }}>✕</button>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={copy} style={{ background: C.blue + "18", border: `1px solid ${C.blue}30`, color: C.blue, borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
          {copied ? "✓ Copied!" : "📋 Copy Schema SQL"}
        </button>
        <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer"
          style={{ background: C.green + "18", border: `1px solid ${C.green}30`, color: C.green, borderRadius: 8, padding: "8px 14px", fontSize: 12, textDecoration: "none", fontWeight: 600 }}>
          Open Supabase →
        </a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────
function Dashboard({ trades, setView, showSetup, setShowSetup, displayName = "Trader" }) {
  const today = new Date().toISOString().split("T")[0];
  const todayTrades = trades.filter(t => t.trade_date === today);
  const todayPnl = todayTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const todayWins = todayTrades.filter(t => t.result === "Win").length;
  const winRate = todayTrades.length ? todayWins / todayTrades.length : 0;
  const analytics = buildAnalytics(trades);

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) + " ET";

  const kpis = [
    { label: "Today P&L", value: fmt$(todayPnl), color: todayPnl >= 0 ? C.green : C.red },
    { label: "Trades Today", value: `${todayTrades.length}`, sub: "of 6 max", color: C.blue },
    { label: "Win Rate", value: fmtPct(winRate), color: C.purple },
    { label: "Discipline", value: analytics ? `${Math.round(trades.slice(0, 5).reduce((s, t) => s + (t.discipline_score || 7), 0) / Math.min(trades.slice(0, 5).length, 5))}/10` : "—", color: C.green },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {showSetup && <SetupBanner onDismiss={() => setShowSetup(false)} />}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, background: `linear-gradient(135deg, ${C.text}, ${C.sub})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {`${new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"}, ${displayName}`} 👋
          </h1>
          <p style={{ color: C.muted, margin: "4px 0 0", fontSize: 13, fontFamily: "monospace" }}>Discipline today. Freedom tomorrow.</p>
        </div>
        <div style={{ textAlign: "right", color: C.muted, fontSize: 11, fontFamily: "monospace" }}>
          <div>{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          <div style={{ marginTop: 2, color: C.sub }}>{timeStr}</div>
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {kpis.map(k => (
          <Card key={k.label} glow={k.color} style={{ padding: 16 }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, fontFamily: "monospace" }}>{k.value}</div>
            {k.sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{k.sub}</div>}
          </Card>
        ))}
      </div>

      {/* Market Status Banner */}
      <div style={{ background: "linear-gradient(135deg, rgba(0,230,118,0.1), rgba(0,200,83,0.04))", border: `1px solid ${C.green}25`, borderLeft: `3px solid ${C.green}`, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.green + "20", border: `2px solid ${C.green}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>✓</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>MARKET STATUS: <span style={{ color: C.green }}>SAFE TO TRADE</span></div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>No high-impact news in the next 90 minutes</div>
          </div>
        </div>
        <Btn variant="ghost" onClick={() => setView("market")} style={{ fontSize: 12, padding: "7px 14px" }}>View Calendar →</Btn>
      </div>

      {/* Quick Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {[
          { icon: "➕", label: "Log Trade", sub: "Manual or CSV Import", color: C.green, view: "entry" },
          { icon: "🧠", label: "Review Last Trade", sub: "AI Analysis & Feedback", color: C.purple, view: "review" },
          { icon: "🎯", label: "Can I Trade?", sub: "Pre-Trade Checklist", color: C.blue, view: "checklist" },
        ].map(a => (
          <button key={a.label} onClick={() => setView(a.view)}
            style={{ background: a.color + "10", border: `1px solid ${a.color}30`, borderRadius: 14, padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, textAlign: "left", transition: "all 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.background = a.color + "20"}
            onMouseLeave={e => e.currentTarget.style.background = a.color + "10"}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: a.color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{a.icon}</div>
            <div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{a.label}</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{a.sub}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Mini Equity Chart */}
      {analytics && analytics.equityCurve.length > 1 && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>TOTAL EQUITY</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: analytics.totalPnl >= 0 ? C.green : C.red, fontFamily: "monospace" }}>{fmt$(analytics.totalPnl)}</div>
            </div>
            <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
              <span style={{ color: C.green }}>● {analytics.wins}W</span>
              <span style={{ color: C.red }}>● {analytics.losses}L</span>
              <span style={{ color: C.muted }}>PF {analytics.profitFactor.toFixed(2)}</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={analytics.equityCurve}>
              <defs>
                <linearGradient id="eq2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.green} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={C.green} strokeWidth={2} fill="url(#eq2)" dot={false} />
              <Tooltip contentStyle={{ background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} formatter={v => [fmt$(v), "Equity"]} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Recent Trades */}
      <Card>
        <SectionTitle action={<button onClick={() => setView("analytics")} style={{ background: "none", border: "none", color: C.blue, fontSize: 12, cursor: "pointer" }}>View Analytics →</button>}>
          Recent Trades
        </SectionTitle>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>{["Time", "Symbol", "Setup", "Dir", "Result", "P&L", "Score"].map(h => (
                <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: C.muted, fontWeight: 500, whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {trades.slice(0, 5).map((t, i) => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                  <td style={{ padding: "10px", color: C.sub, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: t.result === "Win" ? C.green : t.result === "Loss" ? C.red : C.muted, marginRight: 8 }} />
                    {t.trade_time?.slice(0, 5) || "—"}
                  </td>
                  <td style={{ padding: "10px", color: C.text, fontFamily: "monospace", fontWeight: 600 }}>{t.symbol}</td>
                  <td style={{ padding: "10px" }}><Tag label={t.setup_type || "—"} color={C.purple} /></td>
                  <td style={{ padding: "10px", color: t.direction === "Long" ? C.green : C.red, fontWeight: 600 }}>{t.direction === "Long" ? "↑" : "↓"} {t.direction}</td>
                  <td style={{ padding: "10px" }}>
                    <span style={{ background: t.result === "Win" ? C.green + "18" : C.red + "18", color: t.result === "Win" ? C.green : C.red, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{t.result}</span>
                  </td>
                  <td style={{ padding: "10px" }}><Pill value={t.pnl || 0} /></td>
                  <td style={{ padding: "10px", color: !t.discipline_score ? C.muted : t.discipline_score >= 8 ? C.green : t.discipline_score >= 6 ? C.yellow : C.red, fontFamily: "monospace" }}>
                    {t.discipline_score ? `${t.discipline_score}/10` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SYMBOL INPUT — free text + user's history as suggestions
// ─────────────────────────────────────────────────────────────
function SymbolInput({ form, setForm, trades }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef();

  const pastSymbols = [...new Set((trades || []).map(t => t.symbol).filter(Boolean))];
  const defaults = ["NQ","MNQ","ES","MES","RTY","M2K","YM","MYM","CL","MCL","GC","MGC","SI","ZB","ZN","ZF","NG","6E","6J","6B","BTC","ETH"];
  const allSymbols = [...new Set([...pastSymbols, ...defaults])];
  const filtered = allSymbols.filter(s => s.includes(filter.toUpperCase()));


  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (s) => { setForm(prev => ({...prev, symbol: s})); setFilter(""); setOpen(false); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div ref={ref} style={{ position: "relative" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={form.symbol}
            onChange={e => { setForm({...form, symbol: e.target.value.toUpperCase()}); setFilter(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="e.g. NQ, MNQ, ES..."
            style={{ flex: 1, background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 13, outline: "none", fontFamily: "monospace", boxSizing: "border-box" }}
          />
        </div>
        {open && filtered.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 4, zIndex: 100, maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
            {filtered.map(s => (
              <div key={s} onClick={() => select(s)} style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, color: C.text, fontFamily: "monospace" }}>
                {s}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {/* New Date Input */}
        <input 
          type="date" 
          value={form.trade_date || ""} 
          onChange={e => setForm({...form, trade_date: e.target.value})} 
          style={{ background: "#1a1d2e", border: `1px solid ${C.border}`, padding: 8, borderRadius: 6, color: C.text }} 
        />
        {/* Existing Time Input */}
        <input 
          type="time" 
          value={form.entry_time || ""} 
          onChange={e => setForm({...form, entry_time: e.target.value})} 
          style={{ background: "#1a1d2e", border: `1px solid ${C.border}`, padding: 8, borderRadius: 6, color: C.text }} 
        />
        {/* Existing Fields */}
        <input type="number" placeholder="Exit Price" value={form.exit_price || ""} onChange={e => setForm({...form, exit_price: e.target.value})} style={{ background: "#1a1d2e", border: `1px solid ${C.border}`, padding: 8, borderRadius: 6, color: C.text }} />
        <input type="number" placeholder="Commissions" value={form.commissions || ""} onChange={e => setForm({...form, commissions: e.target.value})} style={{ background: "#1a1d2e", border: `1px solid ${C.border}`, padding: 8, borderRadius: 6, color: C.text }} />
        <input type="number" placeholder="Fees" value={form.fees || ""} onChange={e => setForm({...form, fees: e.target.value})} style={{ background: "#1a1d2e", border: `1px solid ${C.border}`, padding: 8, borderRadius: 6, color: C.text }} />
      </div>
    </div>
  ); 
}




// ─────────────────────────────────────────────────────────────
// IMPROVED 3-STAGE TRADE ENTRY
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// FULL TRADE ENTRY - COMPLETE 3-STAGE + ALL FIELDS EDITABLE
// ─────────────────────────────────────────────────────────────
function TradeEntry({ 
  addTrade, 
  updateTrade, 
  setView, 
  trades, 
  customStrategies = [], 
  strategyPreferences = { builtInEnabled: {} } 
}) {
  const [stage, setStage] = useState("pre-trade");
  const [editingTradeId, setEditingTradeId] = useState(null);

  const [form, setForm] = useState({
    symbol: "NQ",
    direction: "Long",
    trade_date: new Date().toISOString().split("T")[0],
    entry_time: "",
    exit_time: "",
    entry_price: "",
    exit_price: "",
    position_size: "1",
    stop_loss: "",
    take_profit: "",
    commissions: "",
    fees: "",
    setup_type: "A+",
    notes: "",
    market_condition: "",
    entry_signal: "",
    conviction_level: 5,
    is_news_event: false,
    decision_speed: "moderate",
    mental_state: "",
    emotional_intensity: 5
  });

  const [postTradeForm, setPostTradeForm] = useState({
    exit_reason: "",
    fear_level: 5,
    greed_level: 5,
    rule_violations: [],
    post_trade_reflection: ""
  });

  const formatTime = (input) => {
    if (!input) return "";
    let digits = input.replace(/[^0-9]/g, '').slice(0, 9);
    let result = '';
    if (digits.length >= 2) result += digits.slice(0,2) + ':';
    if (digits.length >= 4) result += digits.slice(2,4) + ':';
    if (digits.length >= 6) result += digits.slice(4,6);
    if (digits.length > 6) result += '.' + digits.slice(6,9);
    return result;
  };

  // Load editing trade
  useEffect(() => {
    const editingId = sessionStorage.getItem('editingTradeId');
    const editingData = sessionStorage.getItem('editingTradeData');
    const editingStage = sessionStorage.getItem('editingStage');

    if (editingId && editingData) {
      try {
        const tradeData = JSON.parse(editingData);
        setEditingTradeId(editingId);
        setForm({
          symbol: tradeData.symbol || "NQ",
          direction: tradeData.direction || "Long",
          trade_date: tradeData.trade_date || new Date().toISOString().split("T")[0],
          entry_time: tradeData.entry_time || "",
          exit_time: tradeData.exit_time || "",
          entry_price: tradeData.entry_price || "",
          exit_price: tradeData.exit_price || "",
          position_size: tradeData.position_size || "1",
          stop_loss: tradeData.stop_loss || "",
          take_profit: tradeData.take_profit || "",
          commissions: tradeData.commissions || "",
          fees: tradeData.fees || "",
          setup_type: tradeData.setup_type || "A+",
          notes: tradeData.notes || "",
          market_condition: tradeData.market_condition || "",
          entry_signal: tradeData.entry_signal || "",
          conviction_level: tradeData.conviction_level || 5,
          is_news_event: tradeData.is_news_event || false,
          decision_speed: tradeData.decision_speed || "moderate",
          mental_state: tradeData.mental_state || "",
          emotional_intensity: tradeData.emotional_intensity || 5
        });
        setPostTradeForm({
          exit_reason: tradeData.exit_reason || "",
          fear_level: tradeData.fear_level || 5,
          greed_level: tradeData.greed_level || 5,
          rule_violations: tradeData.rule_violations || [],
          post_trade_reflection: tradeData.post_trade_reflection || ""
        });
        setStage(editingStage || "pre-trade");
        sessionStorage.removeItem('editingTradeId');
        sessionStorage.removeItem('editingTradeData');
        sessionStorage.removeItem('editingStage');
      } catch (e) {
        console.error("Failed to load trade for editing", e);
      }
    }
  }, []);

  const builtInList = [
    { value: "Breakout_NewHigh", label: "Breakout - New High/Low" },
    { value: "Pullback_Support", label: "Pullback to Support/Resistance" },
    { value: "Reversal_Candle", label: "Reversal Candle (Pinbar, Engulfing)" },
    { value: "InsideBar_Breakout", label: "Inside Bar Breakout" },
    { value: "Flag_Pennant", label: "Bull/Bear Flag or Pennant" },
    { value: "Trend_Continuation", label: "Trend Continuation" },
    { value: "MA_Crossover", label: "Moving Average Crossover" },
    { value: "EMA_Ribbon", label: "EMA Ribbon Alignment" },
    { value: "Volume_Spike", label: "Volume Spike + Price Action" },
    { value: "RSI_Divergence", label: "RSI Divergence" },
    { value: "Bollinger_Squeeze", label: "Bollinger Band Squeeze" },
    { value: "VWAP_Reclaim", label: "VWAP Reclaim" },
    { value: "Scalp_Momentum", label: "Scalp - Momentum Ignition" },
    { value: "Opening_Range_Breakout", label: "Opening Range Breakout (ORB)" },
    { value: "News_Catalyst", label: "News / Economic Catalyst" },
    { value: "Confluence_Multiple", label: "Multiple Indicator Confluence" },
    { value: "OrderFlow_Delta", label: "Order Flow / Delta Divergence" },
    { value: "Mean_Reversion", label: "Mean Reversion Setup" },
  ];

  const riskReward = (() => {
    const entry = parseFloat(form.entry_price);
    const sl = parseFloat(form.stop_loss);
    const tp = parseFloat(form.take_profit);
    if (!entry || !sl || !tp) return "—";
    const risk = Math.abs(entry - sl);
    const reward = Math.abs(tp - entry);
    if (risk === 0) return "—";
    return `1:${(reward / risk).toFixed(2)}`;
  })();

  const calcPnl = () => {
    const e = parseFloat(form.entry_price);
    const x = parseFloat(form.exit_price);
    if (!e || !x) return 0;
    const ticks = (x - e) / 0.25;
    const dir = form.direction === "Long" ? 1 : -1;
    return Math.round(dir * ticks * 5 * (parseFloat(form.position_size) || 1));
  };

  const estPnl = calcPnl();

  const canProceed = () => {
    if (stage === "pre-trade") return form.market_condition && form.entry_signal;
    if (stage === "trade-entry") return form.entry_price && form.position_size;
    if (stage === "post-trade") return true;
    return false;
  };

  const handleNext = async () => {
    if (!canProceed()) return alert("Please complete required fields for this stage.");

    if (stage === "pre-trade") setStage("trade-entry");
    else if (stage === "trade-entry") setStage("post-trade");
    else {
      const finalTrade = {
        ...form,
        ...postTradeForm,
        pnl: estPnl,
        risk_reward: riskReward !== "—" ? riskReward : null,
        result: estPnl > 0 ? "Win" : estPnl < 0 ? "Loss" : "Breakeven"
      };

      if (editingTradeId) {
        await updateTrade(editingTradeId, finalTrade);
        alert("✅ Trade Updated Successfully!");
      } else {
        await addTrade(finalTrade);
        alert("✅ Trade Saved Successfully!");
      }

      setView("journal");
      setStage("pre-trade");
      setEditingTradeId(null);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <button onClick={() => setView("dashboard")} style={{ color: C.muted }}>← Dashboard</button>
      <h2>Log Trade — 3-Stage</h2>

      <div style={{ display: "flex", gap: 8, margin: "30px 0" }}>
        {["pre-trade", "trade-entry", "post-trade"].map((s, i) => (
          <div key={s} style={{
            flex: 1, padding: "14px", borderRadius: 10, textAlign: "center",
            background: stage === s ? C.blue + "30" : "#1a1d2e",
            border: `2px solid ${stage === s ? C.blue : C.border}`,
            color: stage === s ? C.blue : C.muted
          }}>
            {i + 1}. {s === "pre-trade" ? "Pre-Trade" : s === "trade-entry" ? "Execution" : "Reflection"}
          </div>
        ))}
      </div>

      {/* PRE-TRADE STAGE */}
      {stage === "pre-trade" && (
        <Card>
          <h3>1. Pre-Trade</h3>

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#ffffff", display: "block", marginBottom: 12 }}>Market Condition</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {["Trending Up", "Trending Down", "Ranging", "Volatile"].map(cond => (
                <button key={cond} onClick={() => setForm(p => ({...p, market_condition: cond}))}
                  style={{
                    padding: "14px 12px",
                    borderRadius: 8,
                    border: form.market_condition === cond ? `2px solid ${C.green}` : `1px solid ${C.border}`,
                    background: form.market_condition === cond ? C.green + "20" : "#1a1d2e",
                    color: form.market_condition === cond ? C.green : "#ffffff",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}>
                  {cond.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#ffffff", display: "block", marginBottom: 8 }}>Entry Signal / Strategy</label>
            <select value={form.entry_signal} onChange={e => setForm(p => ({...p, entry_signal: e.target.value}))}
              style={{ width: "100%", padding: "12px", background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, color: "#ffffff" }}>
              <option value="">Select Strategy / Pattern...</option>
              {builtInList.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              {customStrategies && customStrategies.length > 0 && (
                <optgroup label="My Custom Strategies">
                  {customStrategies.filter(s => s.enabled !== false).map(strat => (
                    <option key={strat.id || strat.name} value={strat.name}>{strat.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#ffffff", display: "block", marginBottom: 8 }}>
              Conviction Level: <span style={{ color: C.blue }}>{form.conviction_level}/10</span>
            </label>
            <input type="range" min="1" max="10" value={form.conviction_level} onChange={e => setForm(p => ({...p, conviction_level: +e.target.value}))} style={{width:"100%", accentColor: C.blue}} />
          </div>

          <div style={{ marginBottom: 24, padding: "12px", background: "#1a1d2e", borderRadius: 8, border: `1px solid ${C.border}` }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={form.is_news_event} onChange={e => setForm(p => ({...p, is_news_event: e.target.checked}))} style={{ width: 18, height: 18, accentColor: C.orange }} />
              <span style={{ color: "#ffffff", fontSize: 14 }}>Trade during or around a significant news event</span>
            </label>
          </div>

          <Btn onClick={handleNext} disabled={!canProceed()} style={{ width: "100%", padding: "14px" }}>
            Next → Execution
          </Btn>
        </Card>
      )}

      {/* EXECUTION STAGE - ALL FIELDS BRIGHT & EDITABLE */}
      {stage === "trade-entry" && (
        <Card>
          <h3>2. Execution</h3>

          <div style={{ marginTop: 16 }}>
            <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>Symbol</label>
            <input type="text" value={form.symbol} onChange={e => setForm(p => ({...p, symbol: e.target.value.toUpperCase()}))} style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#ffffff", border: `1px solid ${C.border}`, borderRadius: 8 }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Trade Date</label>
              <input type="date" value={form.trade_date} onChange={e => setForm(p => ({...p, trade_date: e.target.value}))} style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#e0e0e0", borderRadius: 8 }} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Position Size</label>
              <input type="number" value={form.position_size} onChange={e => setForm(p => ({...p, position_size: e.target.value}))} style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#e0e0e0", borderRadius: 8 }} />
            </div>
          </div>

          {/* TIME FIELDS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>Entry Time (HH:MM:SS.mmm)</label>
              <input 
                type="text" 
                value={form.entry_time} 
                placeholder="HH:MM:SS.mmm" 
                onChange={e => setForm(p => ({...p, entry_time: formatTime(e.target.value)}))} 
                style={{ 
                  width: "100%", 
                  padding: "18px 16px", 
                  background: "#1a1d2e", 
                  color: "#ffffff", 
                  border: `2px solid ${C.border}`, 
                  borderRadius: 8, 
                  fontFamily: "monospace", 
                  fontSize: "16px",
                  outline: "none"
                }} 
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>Exit Time (HH:MM:SS.mmm)</label>
              <input 
                type="text" 
                value={form.exit_time} 
                placeholder="HH:MM:SS.mmm" 
                onChange={e => setForm(p => ({...p, exit_time: formatTime(e.target.value)}))} 
                style={{ 
                  width: "100%", 
                  padding: "18px 16px", 
                  background: "#1a1d2e", 
                  color: "#ffffff", 
                  border: `2px solid ${C.border}`, 
                  borderRadius: 8, 
                  fontFamily: "monospace", 
                  fontSize: "16px",
                  outline: "none"
                }} 
              />
            </div>
          </div>

          {/* PRICE FIELDS - FIXED */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Entry Price <span style={{color: C.red}}>*</span></label>
              <input type="number" step="0.01" value={form.entry_price} onChange={e => setForm(p => ({...p, entry_price: e.target.value}))} style={{ width: "100%", padding: 16, background: "#1a1d2e", color: "#ffffff", border: `2px solid ${C.border}`, borderRadius: 8 }} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Exit Price <span style={{color: C.red}}>*</span></label>
              <input type="number" step="0.01" value={form.exit_price} onChange={e => setForm(p => ({...p, exit_price: e.target.value}))} style={{ width: "100%", padding: 16, background: "#1a1d2e", color: "#ffffff", border: `2px solid ${C.border}`, borderRadius: 8 }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Stop Loss</label>
              <input type="number" step="0.01" value={form.stop_loss} onChange={e => setForm(p => ({...p, stop_loss: e.target.value}))} style={{ width: "100%", padding: 16, background: "#1a1d2e", color: "#ffffff", border: `2px solid ${C.border}`, borderRadius: 8 }} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Take Profit</label>
              <input type="number" step="0.01" value={form.take_profit} onChange={e => setForm(p => ({...p, take_profit: e.target.value}))} style={{ width: "100%", padding: 16, background: "#1a1d2e", color: "#ffffff", border: `2px solid ${C.border}`, borderRadius: 8 }} />
            </div>
          </div>

          <div style={{ margin: "20px 0", padding: 16, background: "#1a1d2e", borderRadius: 8, textAlign: "center" }}>
            <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>Risk : Reward</label>
            <div style={{ fontSize: "22px", fontWeight: 700, color: C.blue }}>{riskReward}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Commissions</label>
              <input type="number" step="0.01" value={form.commissions || ""} onChange={e => setForm(p => ({...p, commissions: e.target.value}))} style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#e0e0e0", borderRadius: 8 }} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Fees</label>
              <input type="number" step="0.01" value={form.fees || ""} onChange={e => setForm(p => ({...p, fees: e.target.value}))} style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#e0e0e0", borderRadius: 8 }} />
            </div>
          </div>

          {estPnl !== 0 && (
            <div style={{ margin: "24px 0", padding: 14, background: estPnl > 0 ? C.green + "20" : C.red + "20", color: estPnl > 0 ? C.green : C.red, borderRadius: 8, textAlign: "center", fontWeight: 700 }}>
              Estimated P&L: {fmt$(estPnl)}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
            <Btn onClick={() => setStage("pre-trade")}>← Back</Btn>
            <Btn onClick={handleNext} disabled={!canProceed()}>Next → Reflection</Btn>
          </div>
        </Card>
      )}

      {/* POST-TRADE STAGE */}
      {stage === "post-trade" && (
        <Card>
          <h3>3. Post-Trade Reflection</h3>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Exit Reason</label>
            <select value={postTradeForm.exit_reason} onChange={e => setPostTradeForm(p => ({...p, exit_reason: e.target.value}))} style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#ffffff", borderRadius: 8 }}>
              <option value="">Select exit reason...</option>
              <option value="target_hit">Target Hit</option>
              <option value="stopped_out">Stopped Out</option>
              <option value="manual_exit">Manual Exit</option>
              <option value="time_exit">Time Exit</option>
              <option value="breakeven">Breakeven</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 8, color: C.red }}>Fear Level: {postTradeForm.fear_level}/10</label>
            <input type="range" min="1" max="10" value={postTradeForm.fear_level} onChange={e => setPostTradeForm(p => ({...p, fear_level: +e.target.value}))} style={{width:"100%", accentColor: C.red}} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", marginBottom: 8, color: C.green }}>Greed Level: {postTradeForm.greed_level}/10</label>
            <input type="range" min="1" max="10" value={postTradeForm.greed_level} onChange={e => setPostTradeForm(p => ({...p, greed_level: +e.target.value}))} style={{width:"100%", accentColor: C.green}} />
          </div>

          <textarea placeholder="What did I learn from this trade? (optional)" value={postTradeForm.post_trade_reflection} onChange={e => setPostTradeForm(p => ({...p, post_trade_reflection: e.target.value}))} style={{ width: "100%", minHeight: 140, padding: 14, background: "#1a1d2e", color: "#ffffff", borderRadius: 8 }} />

          <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
            <Btn onClick={() => setStage("trade-entry")}>← Back</Btn>
            <Btn onClick={handleNext}>✓ Save Trade</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// TRADE REVIEW (AI powered) - FIXED LAST TRADE
// ─────────────────────────────────────────────────────────────
function TradeReview({ trades, setView }) {
  // Sort trades by newest first (created_at or trade_date)
  const sortedTrades = [...trades].sort((a, b) => {
    const dateA = new Date(a.created_at || a.trade_date || 0);
    const dateB = new Date(b.created_at || b.trade_date || 0);
    return dateB - dateA;
  });

  const lastTrade = sortedTrades[0];

  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState(null);

  useEffect(() => {
    if (!lastTrade) { 
      setLoading(false); 
      return; 
    }

    const fetch_ = async () => {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            system: `You are a professional futures trading performance coach. Analyze the trade and return ONLY valid JSON, no markdown, no backticks:
{"disciplineScore":number,"setupRating":"A+"|"A"|"B"|"C","isAplusSetup":boolean,"emotionalFlags":string[],"mistakeTags":string[],"ruleBreaks":string[],"improvement":string,"summary":string,"strengths":string[]}`,
            messages: [{ role: "user", content: `Analyze: ${lastTrade.symbol} ${lastTrade.direction}, Entry ${lastTrade.entry_price}, Exit ${lastTrade.exit_price}, Size ${lastTrade.position_size}, P&L ${lastTrade.pnl?.toFixed(2)}, Setup: ${lastTrade.setup_type}, Checklist: trend_aligned=${lastTrade.trend_aligned}, setup_valid=${lastTrade.setup_valid}, risk_ok=${lastTrade.risk_ok}. Notes: ${lastTrade.notes || "none"}` }]
          })
        });
        const data = await res.json();
        const txt = data.content?.map(c => c.text || "").join("") || "";
        setReview(JSON.parse(txt.replace(/```json|```/g, "").trim()));
      } catch {
        // Fallback dynamic insight
        const pnl = lastTrade.pnl || 0;
        setReview({
          disciplineScore: lastTrade.discipline_score || 7,
          setupRating: lastTrade.setup_type || "A",
          isAplusSetup: lastTrade.setup_type === "A+",
          emotionalFlags: (lastTrade.fear_level > 7 || lastTrade.greed_level > 7) ? ["High emotional intensity"] : [],
          mistakeTags: [],
          ruleBreaks: lastTrade.rule_violations || [],
          strengths: ["Trade completed"],
          improvement: pnl >= 0 
            ? "Solid execution. Document what worked and replicate this setup."
            : "Review entry timing and signal confirmation. Was this a valid setup at entry?",
          summary: `${lastTrade.direction} trade on ${lastTrade.symbol}. ${pnl >= 0 ? "Profitable." : "Loss trade — review entry criteria and timing."}`
        });
      }
      setLoading(false);
    };

    fetch_();
  }, [lastTrade]);

  if (!lastTrade) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
      <div style={{ color: C.muted, fontSize: 14 }}>No trades logged yet.</div>
      <Btn onClick={() => setView("entry")} style={{ marginTop: 20 }}>Log Your First Trade →</Btn>
    </div>
  );

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: 0 }}>‹ Dashboard</button>
        <h2 style={{ margin: "8px 0 4px", fontSize: 20, fontWeight: 800 }}>Trade Review</h2>
        <p style={{ color: C.muted, fontSize: 12, margin: 0 }}>AI-powered analysis for your last trade</p>
      </div>

      {/* Trade Summary */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{lastTrade.symbol} · {lastTrade.setup_type} · {lastTrade.trade_date}</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: (lastTrade.pnl || 0) >= 0 ? C.green : C.red, fontFamily: "monospace" }}>{fmt$(lastTrade.pnl || 0)}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{lastTrade.direction} · {lastTrade.entry_price} → {lastTrade.exit_price}</div>
          </div>
          {!loading && review && (
            <div>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>A+ Setup?</div>
              <span style={{ padding: "6px 14px", borderRadius: 20, background: review.isAplusSetup ? C.green + "18" : C.red + "18", border: `1px solid ${review.isAplusSetup ? C.green : C.red}30`, color: review.isAplusSetup ? C.green : C.red, fontSize: 13, fontWeight: 700 }}>
                {review.isAplusSetup ? "✓ YES" : "✕ NO"}
              </span>
            </div>
          )}
        </div>
      </Card>

      {loading ? (
        <Card style={{ textAlign: "center", padding: 50 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>🧠</div>
          <div style={{ color: C.sub, fontSize: 14, marginBottom: 20 }}>Claude is analyzing your trade...</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: C.blue, animation: `pulse 1.2s ${i * 0.2}s infinite ease-in-out` }} />)}
          </div>
        </Card>
      ) : review && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Score */}
          <Card glow={review.disciplineScore >= 8 ? C.green : review.disciplineScore >= 6 ? C.yellow : C.red}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Discipline Score</div>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ fontSize: 56, fontWeight: 900, color: review.disciplineScore >= 8 ? C.green : review.disciplineScore >= 6 ? C.yellow : C.red, fontFamily: "monospace", lineHeight: 1 }}>
                {review.disciplineScore}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>/10</div>
                <div style={{ background: C.border, borderRadius: 4, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${review.disciplineScore * 10}%`, height: "100%", background: review.disciplineScore >= 8 ? C.green : review.disciplineScore >= 6 ? C.yellow : C.red, borderRadius: 4, transition: "width 1.2s ease" }} />
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>AI Summary</div>
            <p style={{ color: C.text, fontSize: 13, lineHeight: 1.7, margin: 0 }}>{review.summary}</p>
          </Card>

          {review.strengths?.length > 0 && (
            <Card glow={C.green}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>✅ Strengths</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {review.strengths.map(s => <Tag key={s} label={s} color={C.green} />)}
              </div>
            </Card>
          )}

          {review.mistakeTags?.length > 0 && (
            <Card glow={C.red}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>⚠️ Mistakes Detected</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {review.mistakeTags.map(t => <Tag key={t} label={t} color={C.red} />)}
              </div>
            </Card>
          )}

          <Card glow={C.blue}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>💡 Coaching Insight</div>
            <p style={{ color: C.text, fontSize: 13, lineHeight: 1.7, margin: 0, fontStyle: "italic" }}>"{review.improvement}"</p>
          </Card>
        </div>
      )}
    </div>
  );
}// ─────────────────────────────────────────────────────────────
// ANALYTICS (Full)
// ─────────────────────────────────────────────────────────────
function Analytics({ trades }) {
  const analytics = useMemo(() => buildAnalytics(trades), [trades]);
  const [tab, setTab] = useState("overview");

  if (!analytics) return <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>No trade data yet. Log some trades first.</div>;

  const impactColor = (wr) => wr >= 0.7 ? C.green : wr >= 0.5 ? C.yellow : C.red;

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>Analytics</h2>
      <p style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>Deep performance insights · {analytics.total} trades</p>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, background: "#0b0d19", border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, marginBottom: 20, overflowX: "auto" }}>
        {[["overview", "Overview"], ["charts", "Charts"], ["heatmap", "Heatmap"], ["setups", "By Setup"], ["insights", "AI Insights"], ["behavior", "🧠 Behavior"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ flex: 1, minWidth: 80, padding: "8px", borderRadius: 7, border: "none", background: tab === id ? C.panel : "transparent", color: tab === id ? C.text : C.muted, cursor: "pointer", fontSize: 12, fontWeight: tab === id ? 700 : 400, whiteSpace: "nowrap" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
            {[
              ["Total P&L", fmt$(analytics.totalPnl), analytics.totalPnl >= 0 ? C.green : C.red],
              ["Win Rate", fmtPct(analytics.winRate), C.blue],
              ["Profit Factor", analytics.profitFactor.toFixed(2), C.purple],
              ["Avg Win", fmt$(analytics.avgWin), C.green],
              ["Avg Loss", `-$${analytics.avgLoss.toFixed(2)}`, C.red],
              ["Total Trades", analytics.total, C.text],
            ].map(([l, v, c]) => (
              <Card key={l} style={{ padding: 16 }}>
                <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "monospace" }}>{v}</div>
              </Card>
            ))}
          </div>

          {/* Streak */}
          <Card>
            <SectionTitle>Current Streak</SectionTitle>
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <div style={{ fontSize: 40, fontWeight: 900, color: analytics.lastResult === "Win" ? C.green : C.red, fontFamily: "monospace" }}>
                {analytics.curStreak}
              </div>
              <div>
                <div style={{ fontSize: 14, color: analytics.lastResult === "Win" ? C.green : C.red, fontWeight: 700 }}>{analytics.lastResult === "Win" ? "🔥 Win Streak" : "⚠️ Loss Streak"}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Best win streak: {analytics.maxStreak}</div>
              </div>
            </div>
          </Card>

          {/* Daily PnL Bar */}
          <Card>
            <SectionTitle>Daily P&L</SectionTitle>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={analytics.dailyPnl} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <XAxis dataKey="d" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip contentStyle={{ background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} formatter={v => [fmt$(v), "P&L"]} />
                <Bar dataKey="v" radius={[4, 4, 0, 0]} maxBarSize={60} fill={C.green}>
                  {analytics.dailyPnl && analytics.dailyPnl.map((d, i) => <Cell key={i} fill={d.v >= 0 ? C.green : C.red} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {tab === "charts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card>
            <SectionTitle>Equity Curve</SectionTitle>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={analytics.equityCurve}>
                <defs>
                  <linearGradient id="eqC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.blue} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} formatter={v => [fmt$(v), "Equity"]} />
                <Area type="monotone" dataKey="v" stroke={C.blue} strokeWidth={2} fill="url(#eqC)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <SectionTitle>Drawdown</SectionTitle>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={analytics.drawdown}>
                <defs>
                  <linearGradient id="dd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.red} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.red} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} formatter={v => [fmt$(v), "Drawdown"]} />
                <Area type="monotone" dataKey="v" stroke={C.red} strokeWidth={2} fill="url(#dd)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {tab === "heatmap" && (
        <Card>
          <SectionTitle>Time-of-Day Performance Heatmap</SectionTitle>
          <p style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>Win rate by 30-minute trading window</p>
          {analytics.heatmap.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 40 }}>Not enough trade time data. Make sure trades have time fields.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {analytics.heatmap.map(h => (
                <div key={h.slot} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 55, fontSize: 11, color: C.sub, fontFamily: "monospace", flexShrink: 0 }}>{h.slot}</div>
                  <div style={{ flex: 1, height: 28, borderRadius: 6, background: C.border, overflow: "hidden", position: "relative" }}>
                    <div style={{ height: "100%", width: `${h.wr * 100}%`, background: `linear-gradient(90deg, ${impactColor(h.wr)}, ${impactColor(h.wr)}88)`, borderRadius: 6, transition: "width 0.8s ease" }} />
                    <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.sub }}>
                      {h.wins}W {h.losses}L
                    </div>
                  </div>
                  <div style={{ width: 45, fontSize: 12, fontWeight: 700, color: impactColor(h.wr), fontFamily: "monospace", textAlign: "right" }}>
                    {Math.round(h.wr * 100)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "setups" && (
        <Card>
          <SectionTitle>Win Rate by Setup Type</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={analytics.setupData} layout="vertical">
              <XAxis type="number" domain={[0, 100]} tick={{ fill: C.muted, fontSize: 10 }} unit="%" axisLine={false} tickLine={false} />
              <YAxis dataKey="setup" type="category" tick={{ fill: C.sub, fontSize: 12 }} axisLine={false} tickLine={false} width={45} />
              <Tooltip contentStyle={{ background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} formatter={v => [`${v}%`, "Win Rate"]} />
              <Bar dataKey="winRate" radius={[0, 6, 6, 0]}>
                {analytics.setupData.map((d, i) => <Cell key={i} fill={d.winRate >= 70 ? C.green : d.winRate >= 55 ? C.yellow : C.red} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            {analytics.setupData.map(d => (
              <div key={d.setup} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#0b0d19", borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{d.setup} Setup</span>
                <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                  <span style={{ color: C.muted }}>{d.total} trades</span>
                  <span style={{ color: d.winRate >= 70 ? C.green : d.winRate >= 55 ? C.yellow : C.red, fontWeight: 700 }}>{d.winRate}% WR</span>
                  <Pill value={d.pnl} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "insights" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <AIInsights trades={trades} analytics={analytics} />
        </div>
      )}

      {tab === "behavior" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <BehaviorAnalytics trades={trades} />
        </div>
      )}
    </div>
  );
}

function AIInsights({ trades, analytics }) {
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState([]);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const summary = `Total trades: ${analytics.total}, Win rate: ${fmtPct(analytics.winRate)}, Profit factor: ${analytics.profitFactor.toFixed(2)}, Best setup by WR: ${[...analytics.setupData].sort((a, b) => b.winRate - a.winRate)[0]?.setup}, Best time bucket: ${[...analytics.heatmap].sort((a, b) => b.wr - a.wr)[0]?.slot || "unknown"}, Current streak: ${analytics.curStreak} ${analytics.lastResult}, Avg win: ${fmt$(analytics.avgWin)}, Avg loss: -$${analytics.avgLoss.toFixed(2)}`;
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            system: `You are a professional futures trading coach. Return ONLY valid JSON array of 5 insight objects:
[{"category":"Performance"|"Behavior"|"Risk"|"Timing"|"Pattern","insight":"concise actionable insight","priority":"high"|"medium"|"low"}]`,
            messages: [{ role: "user", content: `Analyze this trader's stats and generate 5 key insights: ${summary}` }]
          })
        });
        const data = await res.json();
        const txt = data.content?.map(c => c.text || "").join("") || "";
        setInsights(JSON.parse(txt.replace(/```json|```/g, "").trim()));
      } catch {
        setInsights([
          { category: "Timing", insight: `Your best trading window based on data is ${[...analytics.heatmap].sort((a, b) => b.wr - a.wr)[0]?.slot || "morning session"}. Focus trades in this window.`, priority: "high" },
          { category: "Setup", insight: `${[...analytics.setupData].sort((a, b) => b.winRate - a.winRate)[0]?.setup} setups have your highest win rate. Prioritize quality over quantity.`, priority: "high" },
          { category: "Risk", insight: `Your profit factor of ${analytics.profitFactor.toFixed(2)} is ${analytics.profitFactor >= 2 ? "strong — maintain this edge." : "below optimal. Focus on cutting losers faster."}`, priority: "medium" },
          { category: "Behavior", insight: `Win rate of ${fmtPct(analytics.winRate)} suggests ${analytics.winRate >= 0.6 ? "solid entry discipline." : "reviewing entry criteria — aim for 60%+ selectivity."}`, priority: "medium" },
          { category: "Pattern", insight: "After consecutive wins, risk of revenge/overtrading increases. Consider a mandatory 15-min break after 3 wins in a row.", priority: "low" },
        ]);
      }
      setLoading(false);
    };
    fetch_();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return (
    <Card style={{ textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 24, marginBottom: 10 }}>🧠</div>
      <div style={{ color: C.muted, fontSize: 13 }}>Generating AI insights...</div>
    </Card>
  );

  const priorityColor = { high: C.red, medium: C.yellow, low: C.blue };
  const catIcon = { Performance: "📊", Behavior: "🧠", Risk: "🛡️", Timing: "⏰", Pattern: "🔁" };

  return insights.map((ins, i) => (
    <Card key={i} glow={priorityColor[ins.priority]}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ fontSize: 24, flexShrink: 0 }}>{catIcon[ins.category] || "💡"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <Tag label={ins.category} color={C.blue} />
            <Tag label={ins.priority + " priority"} color={priorityColor[ins.priority]} />
          </div>
          <p style={{ color: C.text, fontSize: 13, lineHeight: 1.6, margin: 0 }}>{ins.insight}</p>
        </div>
      </div>
    </Card>
  ));
}




// ─────────────────────────────────────────────────────────────
// CAN I TRADE — CHECKLIST WITH DETAILED REASONS
// ─────────────────────────────────────────────────────────────
const CATEGORY_ICONS = {
  Market: "📊",
  Strategy: "🎯",
  Risk: "🛡️",
  Mental: "🧠"
};

function TradeChecklist({ setView, userId }) {
  const storageKey = userId ? `fos_checklist_${userId}` : "fos_checklist_demo";

  const defaultChecklist = [
    { id: "mc_trend", text: "Clear trend or Pattern", category: "Market", weight: 15, type: "positive" },
    { id: "mc_htf", text: "Higher Timeframe Review", category: "Market", weight: 12, type: "positive" },
    { id: "mc_indicators", text: "Key Indicators Identified", category: "Market", weight: 10, type: "positive" },
    { id: "mc_vol", text: "Is volatility acceptable", category: "Market", weight: 8, type: "positive" },
    { id: "mc_news", text: "Did you check the economic calendar", category: "Market", weight: 15, type: "positive" },

    { id: "strat_wait", text: "Are you waiting for your strategy to tell you to enter, the exact pattern you've tested", category: "Strategy", weight: 18, type: "positive" },

    { id: "risk_range", text: "Is your range set correctly (stop logically placed)?", category: "Risk", weight: 12, type: "positive" },
    { id: "risk_percent", text: "Risk only 1-2% per trade", category: "Risk", weight: 15, type: "positive" },
    { id: "risk_brackets", text: "Are your Brackets Set BEFORE entry?", category: "Risk", weight: 12, type: "positive" },

    { id: "mental_calm", text: "Are you emotionally calm?", category: "Mental", weight: 10, type: "positive" },
    { id: "mental_focus", text: "Are you focused?", category: "Mental", weight: 10, type: "positive" },
    { id: "mental_checklist", text: "Did you follow your predefined checklist", category: "Mental", weight: 12, type: "positive" },
    { id: "mental_ok", text: "Are you ok win or loose the trade?", category: "Mental", weight: 8, type: "positive" },
  ];

  const [items, setItems] = useLocalStorage(storageKey, defaultChecklist);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState("check");

  const [newText, setNewText] = useState("");
  const [newCategory, setNewCategory] = useState("Market");
  const [newWeight, setNewWeight] = useState(10);
  const [newType, setNewType] = useState("positive");

  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [editWeight, setEditWeight] = useState(10);
  const [editType, setEditType] = useState("positive");

  const totalPossibleScore = items.reduce((sum, item) => sum + (item.weight || 10), 0);

  const currentScore = Object.keys(answers).reduce((sum, id) => {
    const item = items.find(i => i.id === id);
    if (!item) return sum;
    const weight = item.weight || 10;
    const isPositive = item.type === "positive";
    const answerYes = answers[id] === true;
    return sum + (answerYes ? (isPositive ? weight : -weight) : 0);
  }, 0);

  const percentage = totalPossibleScore > 0 
    ? Math.round(Math.max(0, currentScore) / totalPossibleScore * 100) 
    : 0;

  const allAnswered = items.every(item => answers[item.id] !== undefined);

  const evaluate = () => {
    const noAnswers = items.filter(i => answers[i.id] === false);
    const weakAreas = noAnswers.map(i => i.text).slice(0, 4);

    let r = "";
    let res = "";

    if (percentage >= 85) {
      res = "take";
      r = "Excellent setup. Almost everything aligned. You should take this trade with full conviction.";
    } else if (percentage >= 65) {
      res = "risky";
      r = `Decent but several weak areas: ${weakAreas.join(", ")}. Reduce size and be extra disciplined.`;
    } else {
      res = "no";
      r = `Too many problems: ${weakAreas.join(", ")}. Skip this trade and wait for a cleaner setup.`;
    }

    setResult(res);
    setReason(r);
  };

  const reset = () => {
    setAnswers({});
    setResult(null);
    setReason("");
  };

  const resetToDefault = () => {
    setItems(defaultChecklist);
    reset();
  };

  const addItem = () => {
    if (!newText.trim()) return;
    const id = `custom_${Date.now()}`;
    setItems(prev => [...prev, { 
      id, 
      text: newText.trim(), 
      category: newCategory, 
      weight: newWeight, 
      type: newType 
    }]);
    setNewText("");
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const saveEdit = (id) => {
    setItems(prev => prev.map(i => i.id === id ? { 
      ...i, 
      text: editText, 
      weight: editWeight, 
      type: editType 
    } : i));
    setEditingId(null);
  };

  const moveItem = (id, dir) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === id);
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const configs = {
    take:  { label: "✅ TAKE THE TRADE", color: C.green },
    risky: { label: "⚠️ PROCEED WITH CAUTION", color: C.yellow },
    no:    { label: "❌ DO NOT TRADE", color: C.red },
  };

  const grouped = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: 0 }}>‹ Dashboard</button>
        <h2 style={{ margin: "8px 0 4px", fontSize: 20, fontWeight: 800 }}>Can I Take This Trade?</h2>
        <p style={{ color: C.muted, fontSize: 12 }}>Your personal checklist • {percentage}% score</p>
      </div>

      {/* Header Buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, justifyContent: "flex-end" }}>
        {mode === "check" && result && <Btn variant="ghost" onClick={reset} style={{ fontSize: 12, padding: "7px 14px" }}>Reset</Btn>}
        <Btn 
          variant={mode === "edit" ? "primary" : "ghost"} 
          onClick={() => { setMode(m => m === "check" ? "edit" : "check"); reset(); }} 
          style={{ fontSize: 12, padding: "7px 14px" }}
        >
          {mode === "edit" ? "✓ Done Editing" : "✏️ Edit Checklist"}
        </Btn>
      </div>

      {/* CHECK MODE */}
      {mode === "check" && !result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {Object.entries(grouped).map(([category, catItems]) => (
            <Card key={category}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>{CATEGORY_ICONS[category] || "⭐"}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{category}</span>
              </div>

              {catItems.map(item => {
                const ans = answers[item.id];
                return (
                  <div key={item.id} style={{ padding: "12px 0", borderTop: "1px solid #1c1f30" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13, color: C.text, lineHeight: 1.5 }}>{item.text}</p>
                        <p style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Weight: {item.weight}</p>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setAnswers(p => ({...p, [item.id]: true}))}
                          style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${ans === true ? C.green : C.border}`, background: ans === true ? C.green + "20" : "transparent", color: ans === true ? C.green : C.muted, cursor: "pointer", fontSize: 12 }}>
                          Yes
                        </button>
                        <button onClick={() => setAnswers(p => ({...p, [item.id]: false}))}
                          style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${ans === false ? C.red : C.border}`, background: ans === false ? C.red + "20" : "transparent", color: ans === false ? C.red : C.muted, cursor: "pointer", fontSize: 12 }}>
                          No
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </Card>
          ))}

          <div style={{ textAlign: "center", margin: "20px 0" }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Current Score: <span style={{ color: C.blue }}>{percentage}%</span></div>
          </div>

          <Btn onClick={evaluate} disabled={!allAnswered} style={{ width: "100%", padding: 14 }}>
            Get My Answer →
          </Btn>
        </div>
      )}

      {/* RESULT WITH DETAILED REASON */}
      {mode === "check" && result && (
        <Card glow={configs[result].color} style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: configs[result].color }}>{configs[result].label}</div>
          <p style={{ color: C.text, fontSize: 15, lineHeight: 1.6, marginTop: 16 }}>{reason}</p>
          
          <Btn variant="ghost" onClick={reset} style={{ marginTop: 24 }}>Check Again</Btn>
        </Card>
      )}

      {/* EDIT MODE */}
      {mode === "edit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card>
            <SectionTitle>Your Personal Checklist</SectionTitle>
            {items.map((item, idx) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: idx > 0 ? `1px solid ${C.border}20` : "none" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                  <button onClick={() => moveItem(item.id, -1)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 10 }}>▲</button>
                  <button onClick={() => moveItem(item.id, 1)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 10 }}>▼</button>
                </div>

                <span style={{ fontSize: 14, flexShrink: 0 }}>{CATEGORY_ICONS[item.category] || "⭐"}</span>

                {editingId === item.id ? (
                  <>
                    <input value={editText} onChange={e => setEditText(e.target.value)} style={{ flex: 1, background: "#1a1d2e", border: `1px solid ${C.blue}`, borderRadius: 6, padding: "6px 10px", color: C.text }} />
                    <input type="number" value={editWeight} onChange={e => setEditWeight(+e.target.value)} style={{ width: 70, background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px" }} />
                    <select value={editType} onChange={e => setEditType(e.target.value)} style={{ background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px" }}>
                      <option value="positive">Positive (+)</option>
                      <option value="negative">Negative (-)</option>
                    </select>
                    <button onClick={() => saveEdit(item.id)} style={{ background: C.green + "18", border: "none", borderRadius: 6, padding: "6px 12px", color: C.green }}>Save</button>
                    <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", color: C.muted }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 12, color: C.text }}>{item.text}</span>
                    <span style={{ fontSize: 11, color: C.muted }}>({item.weight})</span>
                    <button onClick={() => { setEditingId(item.id); setEditText(item.text); setEditWeight(item.weight || 10); setEditType(item.type || "positive"); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", color: C.sub }}>✏️</button>
                    <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: C.muted }}>✕</button>
                  </>
                )}
              </div>
            ))}
          </Card>

          <Card>
            <SectionTitle>Add New Item</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input value={newText} onChange={e => setNewText(e.target.value)} placeholder="New checklist item" style={{ width: "100%", background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px", color: C.text }} />
              <div style={{ display: "flex", gap: 10 }}>
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ flex: 1, background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px", color: C.text }}>
                  {["Market","Strategy","Risk","Mental"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" value={newWeight} onChange={e => setNewWeight(+e.target.value)} style={{ width: 80, background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px", color: C.text }} />
                <select value={newType} onChange={e => setNewType(e.target.value)} style={{ background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px", color: C.text }}>
                  <option value="positive">Positive (+)</option>
                  <option value="negative">Negative (-)</option>
                </select>
              </div>
              <Btn onClick={addItem} disabled={!newText.trim()}>+ Add Item</Btn>
            </div>
          </Card>

          <button onClick={resetToDefault} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px", color: C.muted, cursor: "pointer" }}>
            ↺ Reset to Default Checklist
          </button>
        </div>
      )}
    </div>
  );
}






// ─────────────────────────────────────────────────────────────
// MARKET INTELLIGENCE (with real calendar)
// ─────────────────────────────────────────────────────────────
function Market() {
  const { eventsByDay, todayEvents, marketStatus, nextHighImpact, calLoading } = useCalendar();
  const [showWeek, setShowWeek] = useState(false);

  const statusConfig = {
    safe:    { bg: "rgba(0,230,118,0.08)",  border: C.green, icon: "✓", label: "SAFE TO TRADE",   color: C.green,  desc: "No high-impact news in the next 45 minutes." },
    caution: { bg: "rgba(255,214,0,0.08)",  border: C.yellow, icon: "⚠", label: "CAUTION",         color: C.yellow, desc: nextHighImpact ? `${nextHighImpact.event} in ${nextHighImpact.minsUntil} min — reduce size.` : "High impact news approaching." },
    danger:  { bg: "rgba(255,23,68,0.10)",  border: C.red,   icon: "✕", label: "NO TRADE ZONE",   color: C.red,    desc: nextHighImpact ? `${nextHighImpact.event} in ${nextHighImpact.minsUntil} min — stay out.` : "High impact news imminent." },
  };
  const sc = statusConfig[marketStatus];

  const EventRow = ({ ev, i, total }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: i > 0 ? `1px solid ${C.border}20` : "none", flexWrap: "wrap" }}>
      <div style={{ width: 80, fontSize: 11, color: C.sub, fontFamily: "monospace", flexShrink: 0 }}>{ev.time}</div>
      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={{ fontSize: 13, color: C.text }}>{ev.event}</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
          Fcst: <span style={{ color: C.sub }}>{ev.forecast}</span> · Prev: <span style={{ color: C.sub }}>{ev.previous}</span>
          {ev.actual && <> · <span style={{ color: C.blue }}>Actual: {ev.actual}</span></>}
        </div>
      </div>
      <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
        background: ev.impact === "high" ? C.red + "20" : ev.impact === "medium" ? C.yellow + "20" : C.blue + "15",
        color: ev.impact === "high" ? "#ff6b6b" : ev.impact === "medium" ? C.yellow : C.blue }}>
        {ev.impact}
      </span>
    </div>
  );

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>Market Intelligence</h2>
      <p style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>Live economic calendar · Real-time risk signals</p>

      {/* Dynamic Market Status Banner */}
      <div style={{ background: sc.bg, border: `1px solid ${sc.border}25`, borderLeft: `3px solid ${sc.border}`, borderRadius: 12, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: sc.color + "20", border: `2px solid ${sc.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: sc.color, fontWeight: 700 }}>{sc.icon}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>MARKET STATUS: <span style={{ color: sc.color }}>{sc.label}</span></div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sc.desc}</div>
          </div>
        </div>
        {nextHighImpact && (
          <div style={{ background: sc.color + "15", border: `1px solid ${sc.color}30`, borderRadius: 8, padding: "6px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Next Event</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: sc.color, fontFamily: "monospace" }}>{nextHighImpact.minsUntil}m</div>
          </div>
        )}
      </div>

      {/* Today's Calendar */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>
          Today's Events — {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          <span style={{ fontSize: 11, color: calLoading ? C.yellow : C.green }}>{calLoading ? "⟳ Loading..." : "● Live"}</span>
        </SectionTitle>
        {calLoading ? (
          <div style={{ textAlign: "center", padding: 30, color: C.muted, fontSize: 13 }}>Fetching live calendar...</div>
        ) : todayEvents.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: C.muted, fontSize: 13 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
            No USD events scheduled today — clean day to trade.
          </div>
        ) : (
          todayEvents.map((ev, i) => <EventRow key={i} ev={ev} i={i} total={todayEvents.length} />)
        )}
      </Card>

      {/* Full Week Toggle */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>
          Full Week Calendar
          <button onClick={() => setShowWeek(w => !w)}
            style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", color: C.sub, cursor: "pointer", fontSize: 12 }}>
            {showWeek ? "Hide ↑" : "Show ↓"}
          </button>
        </SectionTitle>
        {showWeek && (
          Object.entries(eventsByDay).map(([day, evs]) => (
            <div key={day} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: day === new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) ? C.green : C.sub, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4, paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
                {day} {day === new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) ? "← Today" : ""}
              </div>
              {evs.map((ev, i) => <EventRow key={i} ev={ev} i={i} total={evs.length} />)}
            </div>
          ))
        )}
      </Card>

      {/* Pre-Market Brief */}
      <Card>
        <SectionTitle>Pre-Market Brief</SectionTitle>
        {[
          {
            icon: marketStatus === "safe" ? "✅" : "🔔",
            title: todayEvents.filter(e => e.impact === "high").length > 0
              ? `${todayEvents.filter(e => e.impact === "high").length} high-impact event${todayEvents.filter(e => e.impact === "high").length > 1 ? "s" : ""} today`
              : "No high-impact events today",
            desc: todayEvents.filter(e => e.impact === "high").map(e => `${e.time} — ${e.event}`).join(" · ") || "Clean calendar — good conditions to trade your setups.",
            color: todayEvents.filter(e => e.impact === "high").length > 0 ? C.red : C.green,
          },
          { icon: "📊", title: "Market Bias: Slightly Bullish", desc: "Trend holding on higher timeframes — favor longs at support.", color: C.blue },
          { icon: "⏰", title: "Best trading windows", desc: "9:30–11:30 AM ET · 1:00–3:30 PM ET · Avoid lunch chop 11:30–1:00", color: C.green },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 12, marginBottom: i < 2 ? 14 : 0, paddingBottom: i < 2 ? 14 : 0, borderBottom: i < 2 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: item.color + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{item.icon}</div>
            <div>
              <div style={{ fontSize: 13, color: item.color, fontWeight: 700 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TRADE LOG (full history + delete)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// BEHAVIOR DETECTION (Future: Used for AI insights)
// ─────────────────────────────────────────────────────────────
// function detectBehavior(oldTrade, newTrade) {
//   const tags = [];
//
//   if (
//     newTrade.direction === "long" &&
//     newTrade.stop_loss < oldTrade.stop_loss
//   ) {
//     tags.push("moved_stop_loss_lower");
//   }
//
//   if (
//     newTrade.direction === "short" &&
//     newTrade.stop_loss > oldTrade.stop_loss
//   ) {
//     tags.push("moved_stop_loss_higher");
//   }
//
//   if (
//     newTrade.exit_price &&
//     newTrade.take_profit &&
//     newTrade.exit_price < newTrade.take_profit &&
//     newTrade.pnl > 0
//   ) {
//     tags.push("cut_winner_early");
//   }
//
//   if (newTrade.risk_ok === false) {
//     tags.push("risk_rule_violation");
//   }
//
//   if (
//     oldTrade.discipline_score &&
//     newTrade.discipline_score < oldTrade.discipline_score
//   ) {
//     tags.push("discipline_drop");
//   }
//
//   return tags;
// }


// ─────────────────────────────────────────────────────────────
// TRADE LOG WITH CLICKABLE ROWS (PENCIL ICON REMOVED)
// ─────────────────────────────────────────────────────────────
function TradeLog({ trades, deleteTrade, updateTrade, setView, openTradeReview }) {
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all" 
    ? trades 
    : trades.filter(t => t.result === filter || t.setup_type === filter);

  const deleteTrade_local = (id) => {
    if (window.confirm('Delete this trade permanently?')) {
      deleteTrade(id);
    }
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>Trade Journal</h2>
      <p style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>{trades.length} trades logged</p>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", "Win", "Loss", "A+", "B"].map(f => (
          <button 
            key={f} 
            onClick={() => setFilter(f)}
            style={{ 
              padding: "6px 14px", 
              borderRadius: 20, 
              border: `1px solid ${filter === f ? C.blue : C.border}`, 
              background: filter === f ? C.blue + "20" : "transparent", 
              color: filter === f ? C.blue : C.muted, 
              cursor: "pointer", 
              fontSize: 12, 
              fontWeight: 600 
            }}
          >
            {f === "all" ? "All Trades" : f}
          </button>
        ))}
      </div>

      <Card style={{ padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Date", "Symbol", "Dir", "Setup", "Entry", "Exit", "P&L", "Score", ""].map(h => (
                  <th key={h} style={{ padding: "12px 14px", textAlign: "left", color: C.muted, fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr 
                  key={t.id} 
                  style={{ 
                    borderBottom: `1px solid ${C.border}15`, 
                    cursor: "pointer",
                    transition: "background 0.1s"
                  }}
                  onClick={() => openTradeReview(t)}
                  onMouseEnter={e => e.currentTarget.style.background = "#ffffff05"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "11px 14px", color: C.muted, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                    {t.trade_date?.slice(5)}<br />
                    <span style={{ fontSize: 10 }}>{t.trade_time?.slice(0, 5)}</span>
                  </td>
                  <td style={{ padding: "11px 14px", color: C.text, fontFamily: "monospace", fontWeight: 700 }}>{t.symbol}</td>
                  <td style={{ padding: "11px 14px", color: t.direction === "Long" ? C.green : C.red, fontWeight: 700 }}>
                    {t.direction === "Long" ? "↑" : "↓"}
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <Tag label={t.setup_type || "—"} color={C.purple} />
                  </td>
                  <td style={{ padding: "11px 14px", fontFamily: "monospace", color: C.sub }}>{t.entry_price || "—"}</td>
                  <td style={{ padding: "11px 14px", fontFamily: "monospace", color: C.sub }}>{t.exit_price || "—"}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <Pill value={t.pnl || 0} />
                  </td>
                  <td style={{ 
                    padding: "11px 14px", 
                    color: !t.discipline_score ? C.muted : 
                           t.discipline_score >= 8 ? C.green : 
                           t.discipline_score >= 6 ? C.yellow : C.red, 
                    fontFamily: "monospace" 
                  }}>
                    {t.discipline_score ? `${t.discipline_score}/10` : "—"}
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        deleteTrade_local(t.id); 
                      }}
                      style={{ 
                        background: "none", 
                        border: "none", 
                        color: C.muted, 
                        cursor: "pointer", 
                        fontSize: 14, 
                        padding: "2px 6px", 
                        borderRadius: 4 
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = C.red}
                      onMouseLeave={e => e.currentTarget.style.color = C.muted}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}






// ─────────────────────────────────────────────────────────────
// PASSWORD RESET COMPONENT
// ─────────────────────────────────────────────────────────────
function PasswordResetForm({ onBack, email, setEmail, setLocalError, localError, authLoading }) {
  const [resetSent, setResetSent] = useState(false);

  const handleResetPassword = async () => {
    setLocalError("");
    if (!email) { 
      setLocalError("Please enter your email."); 
      return; 
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email })
      });

      const data = await res.json();
      
      if (res.ok || data.user) {
        setResetSent(true);
      } else {
        setLocalError(data.error_description || data.error || "Failed to send reset link");
      }
    } catch (err) {
      setLocalError("Error sending reset link: " + err.message);
    }
  };

  if (resetSent) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <Card>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h2 style={{ color: C.text, marginBottom: 8 }}>Check Your Email</h2>
              <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>
                We've sent a password reset link to <strong>{email}</strong>
              </p>
              <p style={{ color: C.sub, fontSize: 12, marginBottom: 20, lineHeight: 1.6 }}>
                Click the link in your email to set a new password. The link expires in 24 hours.
              </p>
              <p style={{ color: C.sub, fontSize: 12, marginBottom: 20 }}>
                Not seeing it? Check your spam folder or try another email address.
              </p>
            </div>

            <button 
              onClick={onBack}
              style={{
                width: "100%",
                padding: 12,
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.text,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600
              }}
            >
              Back to Sign In
            </button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, background: `linear-gradient(135deg, ${C.green}, ${C.blue})`, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 26, marginBottom: 14 }}>📊</div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.08em", color: C.text }}>Reset Password</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Enter your email to receive a reset link</div>
        </div>

        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 10, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>Email</label>
              <input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleResetPassword()}
                placeholder="your@email.com"
                style={{ width: "100%", background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }} 
              />
            </div>

            {localError && (
              <div style={{ background: C.red + "15", border: `1px solid ${C.red}30`, borderRadius: 8, padding: "10px 14px", color: "#ff6b6b", fontSize: 13 }}>
                ⚠️ {localError}
              </div>
            )}

            <Btn onClick={handleResetPassword} disabled={authLoading} style={{ width: "100%", padding: 14, fontSize: 14 }}>
              {authLoading ? "Sending..." : "Send Reset Link →"}
            </Btn>

            <button 
              onClick={onBack}
              style={{
                width: "100%",
                padding: 12,
                background: "none",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.muted,
                cursor: "pointer",
                fontSize: 14
              }}
            >
              Back to Sign In
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RESET PASSWORD PAGE (shown when user clicks email reset link)
// ─────────────────────────────────────────────────────────────
function ResetPasswordPage({ onBack }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!newPassword || !confirmPassword) {
      setError("Please fill in both password fields");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);

    try {
      // Get the token from URL - Supabase sends it in the hash
      const fullHash = window.location.hash;
      const hashParams = new URLSearchParams(fullHash.substring(1));
      
      console.log("=== PASSWORD RESET DEBUG ===");
      console.log("Full URL:", window.location.href);
      console.log("Full Hash:", fullHash);
      console.log("Hash Params Keys:", Array.from(hashParams.keys()));
      
      // Try different ways to extract token
      let accessToken = hashParams.get("access_token");
      let tokenType = hashParams.get("type");
      let errorCode = hashParams.get("error");
      
      console.log("access_token:", accessToken);
      console.log("type:", tokenType);
      console.log("error:", errorCode);
      
      if (!accessToken) {
        setError("No access token found in reset link. Make sure you clicked the link in your email.");
        setLoading(false);
        return;
      }

      // Log token format
      const tokenSegments = accessToken.split('.');
      console.log("Token segments count:", tokenSegments.length, "(should be 3 for JWT)");
      console.log("Token preview:", accessToken.substring(0, 20) + "...");

      // Update password using Supabase - use the correct endpoint
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ password: newPassword })
      });

      const data = await res.json();

      console.log("Reset response status:", res.status);
      console.log("Reset response:", data);

      if (!res.ok) {
        console.error("Password reset error:", data);
        throw new Error(data.error_description || data.error || data.message || "Failed to reset password");
      }

      setSuccess(true);
      setTimeout(() => {
        // Clear the hash from URL and redirect to login
        window.location.href = "/";
      }, 2000);
    } catch (err) {
      console.error("Reset error:", err);
      setError(err.message || "Error resetting password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <Card>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h2 style={{ color: C.text, marginBottom: 8, fontSize: 20, fontWeight: 800 }}>Password Updated!</h2>
              <p style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>
                Your password has been successfully reset. Redirecting to login...
              </p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } input:focus { border-color: #4f8ef7 !important; box-shadow: 0 0 0 2px rgba(79,142,247,0.15) !important; } button { font-family: inherit; }`}</style>
      
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, background: `linear-gradient(135deg, ${C.green}, ${C.blue})`, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 26, marginBottom: 14 }}>📊</div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.08em", color: C.text }}>Reset Password</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Enter your new password</div>
        </div>

        <Card>
          <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* New Password */}
            <div>
              <label style={{ fontSize: 10, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: "100%", background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label style={{ fontSize: 10, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={e => e.key === "Enter" && handleResetPassword(e)}
                style={{ width: "100%", background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div style={{ background: C.red + "15", border: `1px solid ${C.red}30`, borderRadius: 8, padding: "10px 14px", color: "#ff6b6b", fontSize: 13 }}>
                ⚠️ {error}
              </div>
            )}

            {/* Submit Button */}
            <Btn type="submit" disabled={loading} style={{ width: "100%", padding: 14, fontSize: 14 }}>
              {loading ? "Updating..." : "Reset Password →"}
            </Btn>

            {/* Back Button */}
            <button
              type="button"
              onClick={onBack}
              style={{
                width: "100%",
                padding: 12,
                background: "none",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.muted,
                cursor: "pointer",
                fontSize: 14
              }}
            >
              Back to Sign In
            </button>
          </form>
        </Card>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: C.muted }}>
          Your password will be securely updated in Supabase.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LOGIN SCREEN
// ─────────────────────────────────────────────────────────────
function LoginScreen({ signIn, signUp, authLoading, authError }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [localError, setLocalError] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);

  const [confirmed, setConfirmed] = useState(false);

  const handleSubmit = async () => {
    setLocalError("");
    if (!email || !password) { setLocalError("Please fill in all fields."); return; }
    if (mode === "signup") {
      const result = await signUp(email, password, displayName);
      if (result?.confirm) {
        setConfirmed(true); // show "check your email" message
        return;
      }
    } else {
      const ok = await signIn(email, password);
      if (!ok) return;
    }
  };

  // Show password reset form
  if (showResetPassword) {
    return (
      <PasswordResetForm 
        onBack={() => { setShowResetPassword(false); setEmail(""); setLocalError(""); }}
        email={email}
        setEmail={setEmail}
        setLocalError={setLocalError}
        localError={localError}
        authLoading={authLoading}
      />
    );
  }

  const inp = (label, value, onChange, type = "text", placeholder = "") => (
    <div>
      <label style={{ fontSize: 10, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        onKeyDown={e => e.key === "Enter" && handleSubmit()}
        style={{ width: "100%", background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } input:focus { border-color: #4f8ef7 !important; box-shadow: 0 0 0 2px rgba(79,142,247,0.15) !important; } button { font-family: inherit; }`}</style>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, background: `linear-gradient(135deg, ${C.green}, ${C.blue})`, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 26, marginBottom: 14 }}>📊</div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.08em", color: C.text }}>FUTURES EXECUTION OS</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Discipline today. Freedom tomorrow.</div>
        </div>

        <Card>
          {/* Mode tabs */}
          <div style={{ display: "flex", gap: 4, background: "#0b0d19", border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, marginBottom: 24 }}>
            {[["login", "Sign In"], ["signup", "Create Account"]].map(([id, label]) => (
              <button key={id} onClick={() => { setMode(id); setLocalError(""); }}
                style={{ flex: 1, padding: "9px", borderRadius: 7, border: "none", background: mode === id ? C.panel : "transparent", color: mode === id ? C.text : C.muted, cursor: "pointer", fontSize: 13, fontWeight: mode === id ? 700 : 400 }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {mode === "signup" && inp("Your Name", displayName, setDisplayName, "text", "e.g. Alex Trader")}
            {inp("Email", email, setEmail, "email", "your@email.com")}
            {inp("Password", password, setPassword, "password", "••••••••")}

            {confirmed && (
              <div style={{ background: C.yellow + "15", border: `1px solid ${C.yellow}30`, borderRadius: 8, padding: "14px", fontSize: 13, textAlign: "center" }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>⚠️</div>
                <div style={{ fontWeight: 700, marginBottom: 4, color: C.yellow }}>Email confirmation still required</div>
                <div style={{ color: C.sub, fontSize: 12, marginBottom: 12 }}>
                  Go to <strong>Supabase → Authentication → Providers → Email</strong> and make sure <strong>"Confirm email"</strong> is toggled <strong>OFF</strong>, then save and try again.
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  <button onClick={() => { setConfirmed(false); setMode("signup"); }}
                    style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 14px", color: C.muted, cursor: "pointer", fontSize: 12 }}>
                    Try Again
                  </button>
                  <button onClick={() => { setConfirmed(false); setMode("login"); }}
                    style={{ background: "none", border: `1px solid ${C.green}40`, borderRadius: 8, padding: "7px 14px", color: C.green, cursor: "pointer", fontSize: 12 }}>
                    Go to Sign In
                  </button>
                </div>
              </div>
            )}

            {!confirmed && (authError || localError) && (
              <div style={{ background: C.red + "15", border: `1px solid ${C.red}30`, borderRadius: 8, padding: "10px 14px", color: "#ff6b6b", fontSize: 13 }}>
                ⚠️ {authError || localError}
              </div>
            )}

            {!confirmed && (
              <>
                <Btn onClick={handleSubmit} disabled={authLoading} style={{ width: "100%", padding: 14, fontSize: 14 }}>
                  {authLoading ? "Please wait..." : mode === "login" ? "Sign In →" : "Create Account →"}
                </Btn>
                
                {mode === "login" && (
                  <button
                    onClick={() => setShowResetPassword(true)}
                    style={{
                      width: "100%",
                      padding: 10,
                      background: "none",
                      border: "none",
                      color: C.blue,
                      cursor: "pointer",
                      fontSize: 13,
                      textDecoration: "none",
                      textAlign: "center",
                      fontWeight: 500
                    }}
                    onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                    onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}
                  >
                    Forgot Password?
                  </button>
                )}
              </>
            )}
          </div>
        </Card>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: C.muted }}>
          Your data is private and stored securely in Supabase.
        </div>
      </div>
    </div>
  );
}



// ─────────────────────────────────────────────────────────────
// PROFILE SETTINGS
// ─────────────────────────────────────────────────────────────
function ProfileSettings({ profile, updateProfile, signOut, setView }) {
  const [name, setName] = useState(profile?.display_name || "");
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    await updateProfile({ display_name: name });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: 0 }}>‹ Dashboard</button>
        <h2 style={{ margin: "8px 0 4px", fontSize: 20, fontWeight: 800 }}>Profile Settings</h2>
        <p style={{ color: C.muted, fontSize: 12, margin: 0 }}>Manage your account</p>
      </div>

      <Card style={{ marginBottom: 14 }}>
        {/* Avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: `linear-gradient(135deg, ${C.blue}, ${C.purple})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
            {(profile?.display_name || "?")[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{profile?.display_name || "Trader"}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{profile?.email || ""}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 10, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>Display Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              style={{ width: "100%", background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>This is shown in your dashboard greeting and sidebar.</div>
          </div>

          <div>
            <label style={{ fontSize: 10, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>Email</label>
            <input
              value={profile?.email || ""}
              disabled
              style={{ width: "100%", background: "#0b0d19", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", color: C.muted, fontSize: 14, outline: "none", boxSizing: "border-box", cursor: "not-allowed" }}
            />
          </div>

          <Btn onClick={handleSave} disabled={!name.trim() || saved} style={{ width: "100%" }}>
            {saved ? "✓ Saved!" : "Save Changes"}
          </Btn>
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>Sign Out</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>You'll need to log back in to access your data.</div>
        <Btn variant="danger" onClick={signOut} style={{ width: "100%" }}>Sign Out</Btn>
      </Card>
    </div>
  );
}

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
  { id: "strategies", label: "Strategies", emoji: "🎯" }   // ← ADD THIS LINE
];

export default function App() {
  const [view, setView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSetup, setShowSetup] = useLocalStorage("fos_setup_banner", true);
  const { session, profile, authLoading, authError, signIn, signUp, signOut, updateProfile, isLoggedIn } = useAuth();
 const userId = session?.user?.id || null;


const { 
    trades, 
    addTrade, 
    deleteTrade, 
    updateTrade, 
    customStrategies, 
    addCustomStrategy, 
    deleteCustomStrategy, 
    isConfigured 
  } = useSupabase(userId);

  // Strategy Preferences - which ones are enabled
  const [strategyPreferences, setStrategyPreferences] = useLocalStorage('fos_strategy_preferences', {
    builtInEnabled: {}   // e.g. { "Breakout_NewHigh": true, ... }
  });

  // REVIEW MODAL STATE + FUNCTIONS
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedTradeForReview, setSelectedTradeForReview] = useState(null);

  









const openTradeReview = (trade) => {
    setSelectedTradeForReview(trade);
    setShowReviewModal(true);
  };

  const closeReviewModal = () => {
    setShowReviewModal(false);
    setSelectedTradeForReview(null);
  };

const activeNav = ["checklist"].includes(view) ? "entry" : view;
  const displayName = profile?.display_name || session?.user?.email?.split("@")[0] || "Trader";
  const avatarLetter = displayName[0].toUpperCase();

// ── Check for Password Reset Token ──────────────────────────
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const resetToken = hashParams.get("access_token");
  const tokenType = hashParams.get("type");
  const isPasswordReset = resetToken && tokenType === "recovery";

  if (isPasswordReset) {
    return <ResetPasswordPage onBack={() => window.location.href = "/"} />;
  }

  // ── Login Screen ──────────────────────────────────────────────
  if (!isLoggedIn) {
    return <LoginScreen signIn={signIn} signUp={signUp} authLoading={authLoading} authError={authError} />;
  }

  // ←←← ADD THIS COMMA HERE (after the if block)



const views = {
  dashboard: () => <Dashboard trades={trades} setView={setView} showSetup={showSetup && !isConfigured} setShowSetup={setShowSetup} displayName={displayName} />,
  entry: () => <TradeEntry
    addTrade={addTrade}
    updateTrade={updateTrade}
    setView={setView}
    trades={trades}
    customStrategies={customStrategies}
    strategyPreferences={strategyPreferences}
  />,
  review: () => <TradeReview trades={trades} setView={setView} />,
  checklist: () => <TradeChecklist setView={setView} userId={userId} />,   // ← Updated
  analytics: () => <Analytics trades={trades} />,
  market: () => <Market />,
  journal: () => <TradeLog
    trades={trades}
    deleteTrade={deleteTrade}
    updateTrade={updateTrade}
    setView={setView}
    openTradeReview={openTradeReview}
  />,



    profile: () => <ProfileSettings profile={profile} updateProfile={updateProfile} signOut={signOut} setView={setView} />,
    strategies: () => <ManageStrategies
      customStrategies={customStrategies}
      addCustomStrategy={addCustomStrategy}
      deleteCustomStrategy={deleteCustomStrategy}
      strategyPreferences={strategyPreferences}
      setStrategyPreferences={setStrategyPreferences}
      setView={setView}
    />
  };









  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Sans', -apple-system, sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1c1f30; border-radius: 4px; }
        input:focus, select:focus, textarea:focus { border-color: #4f8ef7 !important; box-shadow: 0 0 0 2px rgba(79,142,247,0.15) !important; }
        @keyframes pulse { 0%,100% { opacity: 0.3; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1); } }
        button { font-family: inherit; }
      `}</style>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.bg + "ee", backdropFilter: "blur(12px)", zIndex: 50 }}>
        <button onClick={() => setSidebarOpen(o => !o)}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, width: 36, height: 36, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", flexShrink: 0 }}>
          {[0, 1, 2].map(i => <div key={i} style={{ width: 15, height: 1.5, background: C.sub, borderRadius: 1 }} />)}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 14 }}>
          <div style={{ width: 30, height: 30, background: `linear-gradient(135deg, ${C.green}, ${C.blue})`, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📊</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: C.text }}>FUTURES EXECUTION OS</div>
            <div style={{ fontSize: 9, color: C.blue, letterSpacing: "0.12em" }}>PHASE 2 · {isConfigured ? "LIVE" : "DEMO"}</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} ET</div>
      </div>

      {/* Sidebar Overlay */}
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 60, backdropFilter: "blur(4px)" }} />}

      {/* Sidebar */}
      <aside style={{ position: "fixed", top: 0, left: 0, height: "100vh", width: 220, background: "#0b0d19", borderRight: `1px solid ${C.border}`, zIndex: 70, display: "flex", flexDirection: "column", padding: "20px 0", transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)", transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)" }}>
        <div style={{ padding: "0 16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, background: `linear-gradient(135deg, ${C.green}, ${C.blue})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📊</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.text }}>FUTURES OS</div>
            <div style={{ fontSize: 9, color: C.blue }}>PHASE 2</div>
          </div>
          <button onClick={() => setSidebarOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <nav style={{ flex: 1, padding: "16px 10px", overflowY: "auto" }}>
          {[...NAV, { id: "profile", label: "Profile", emoji: "👤" }].map(item => {
            const active = activeNav === item.id;
            return (
              <button key={item.id} onClick={() => { setView(item.id); setSidebarOpen(false); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "none", background: active ? C.green + "10" : "transparent", color: active ? C.green : C.muted, cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 400, marginBottom: 2, transition: "all 0.15s", borderLeft: `2px solid ${active ? C.green : "transparent"}` }}>
                <span style={{ fontSize: 16 }}>{item.emoji}</span>
                {item.label}
              </button>
            );
          })}
        </nav>
        <div onClick={() => { setView("profile"); setSidebarOpen(false); }}
          style={{ padding: "14px 16px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.background = "#ffffff05"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${C.blue}, ${C.purple})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{avatarLetter}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
            <div style={{ fontSize: 10, color: C.blue }}>Edit Profile →</div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: "20px 16px 90px", maxWidth: 960, margin: "0 auto", width: "100%" }}>
        {(views[view] || views.dashboard)()}
      </main>

      {/* Bottom Nav */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.bg + "f0", borderTop: `1px solid ${C.border}`, backdropFilter: "blur(16px)", display: "flex", zIndex: 50, paddingBottom: "env(safe-area-inset-bottom, 4px)" }}>
        {NAV.map(item => {
          const active = activeNav === item.id;
          return (
            <button key={item.id} onClick={() => setView(item.id)}
              style={{ flex: 1, padding: "10px 4px 8px", background: "none", border: "none", color: active ? C.green : C.muted, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, transition: "color 0.15s", position: "relative" }}>
              {active && <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 24, height: 2, background: C.green, borderRadius: "0 0 3px 3px" }} />}
              <span style={{ fontSize: 18 }}>{item.emoji}</span>
              <span style={{ fontSize: 9, fontWeight: active ? 700 : 400, letterSpacing: "0.03em" }}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* TRADE HISTORY MODAL */}
      {showReviewModal && selectedTradeForReview && (
        <TradeHistoryModal
          trade={selectedTradeForReview}
          isOpen={showReviewModal}
          onClose={closeReviewModal}
          updateTrade={updateTrade}
          customStrategies={customStrategies}
        />
      )}
    </div>
  );
}