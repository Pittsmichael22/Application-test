import { useState, useEffect, useCallback, useMemo } from "react";

import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ScatterChart, Scatter,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";


import { TradeHistoryModal } from "./components/TradeHistoryModal";
import { BehaviorAnalytics } from "./components/BehaviorAnalytics";
import { InstrumentsManager } from "./components/InstrumentsManager";
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

-- Missing columns on trades table (run ALTER if table already exists)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS account_id UUID;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS commissions NUMERIC;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS fees NUMERIC;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS risk_reward NUMERIC;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS entry_time TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS exit_time TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS focus_level INTEGER;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS rule_adherence INTEGER;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS impulsiveness INTEGER;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS energy_level INTEGER;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS market_context INTEGER;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS outcome_satisfaction INTEGER;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS confidence_level INTEGER;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS post_trade_emotion TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS what_to_improve TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS import_source TEXT DEFAULT NULL;

-- Profiles table (persists MDD, max daily trades, display name, preferences)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  max_daily_drawdown NUMERIC DEFAULT 400,
  max_daily_trades INTEGER DEFAULT 10,
  strategy_preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Custom strategies table
CREATE TABLE IF NOT EXISTS custom_strategies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  broker TEXT,
  account_type TEXT DEFAULT 'live',
  starting_balance NUMERIC DEFAULT 10000,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Instrument settings (user-configurable tick size/value per symbol)
CREATE TABLE IF NOT EXISTS instrument_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  tick_size NUMERIC NOT NULL DEFAULT 0.25,
  tick_value NUMERIC NOT NULL DEFAULT 5.00,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

-- Daily notes
CREATE TABLE IF NOT EXISTS daily_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id UUID,
  note_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, account_id, note_date)
);
`;


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
// AUTH HOOK - FIXED
// ─────────────────────────────────────────────────────────────
function useAuth() {
  const [session, setSession] = useLocalStorage("fos_session", null);
  const [profile, setProfile] = useLocalStorage("fos_profile", null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const signUp = async (email, password, displayName) => {
    setAuthLoading(true); 
    setAuthError("");
    try {
      const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const signupData = await signupRes.json();

      if (signupData.error) {
        setAuthError(signupData.error_description || signupData.error);
        setAuthLoading(false); 
        return { ok: false };
      }

      // Auto sign in
      return await signIn(email, password);
    } catch (e) {
      setAuthError("Connection error");
      setAuthLoading(false); 
      return { ok: false };
    }
  };

  const signIn = async (email, password) => {
    setAuthLoading(true); 
    setAuthError("");
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setAuthError(data.error_description || data.error || "Invalid credentials");
        setAuthLoading(false); 
        return false;
      }

      sb.setToken(data.access_token, data.refresh_token, data.expires_in);
      setSession(data);

      if (data.user?.id) {
        await fetchProfile(data.user.id, data.access_token);
      }

      setAuthLoading(false); 
      return true;
    } catch (e) {
      setAuthError("Could not connect to server");
      setAuthLoading(false); 
      return false;
    }
  };

  const signOut = async () => {
    try {
      await sb.signOut();
      localStorage.clear(); // Clear everything
      setSession(null); 
      setProfile(null);
      window.location.reload(); // Force clean reload
    } catch (e) {
      console.error("Sign out error", e);
    }
  };

  const fetchProfile = async (userId, token) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data?.[0]) setProfile(data[0]);
    } catch (e) {
      console.error("Profile fetch failed", e);
    }
  };

  const updateProfile = async (updates) => {
    if (!session?.user?.id) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      setProfile(prev => ({ ...prev, ...updates }));
    } catch (e) {}
  };

  // Fetch daily note for a specific date
  const getDailyNote = async (date, accountId) => {
    if (!session?.user?.id) return null;
    try {
      const dateStr = date.toISOString().split("T")[0];
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/daily_journal?user_id=eq.${session.user.id}&journal_date=eq.${dateStr}&account_id=eq.${accountId}`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      return data.length > 0 ? data[0] : null;
    } catch (e) {
      console.error("Failed to fetch daily note:", e);
      return null;
    }
  };

  // Save daily note
  const saveDailyNote = async (date, accountId, notes) => {
    if (!session?.user?.id) return;
    try {
      const dateStr = date.toISOString().split("T")[0];
      const existingNote = await getDailyNote(date, accountId);
      
      if (existingNote) {
        // Update existing
        await fetch(`${SUPABASE_URL}/rest/v1/daily_journal?id=eq.${existingNote.id}`, {
          method: "PATCH",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ notes, updated_at: new Date().toISOString() })
        });
      } else {
        // Create new
        await fetch(`${SUPABASE_URL}/rest/v1/daily_journal`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: session.user.id,
            account_id: accountId,
            journal_date: dateStr,
            notes
          })
        });
      }
    } catch (e) {
      console.error("Failed to save daily note:", e);
    }
  };

  return { 
    session, 
    profile, 
    authLoading, 
    authError, 
    signUp, 
    signIn, 
    signOut, 
    updateProfile,
    getDailyNote,
    saveDailyNote,
    isLoggedIn: !!session?.access_token 
  };
}



// ─────────────────────────────────────────────────────────────
// TRADE EVENT TRACKING UTILITIES
// ─────────────────────────────────────────────────────────────
// ──── AUDIT LOGGING (Currently Unused - Reserved for Future Use) ────
// async function createTradeEvent(tradeId, eventType, oldData, newData, reason = null) {
//   try {
//     const eventData = {
//       trade_id: tradeId,
//       event_type: eventType,
//       old_data: oldData || null,
//       new_data: newData || null,
//       reason: reason || null,
//     };
//     
//     await fetch(`${SUPABASE_URL}/rest/v1/trade_events`, {
//       method: "POST",
//       headers: { ...authHeaders(), Prefer: "return=representation" },
//       body: JSON.stringify(eventData),
//     });
//     
//     console.log(`✓ Event logged: ${eventType} for trade ${tradeId}`);
//   } catch (error) {
//     console.error("Error creating trade event:", error);
//   }
// }

// Detect what changed between old and new trade data
// function detectChanges(oldTrade, newTrade) {
//   const changes = {};
//   const keys = Object.keys(newTrade);
//   
//   for (let key of keys) {
//     if (key === 'id' || key === 'created_at' || key === 'updated_at' || key === 'version') continue;
//     
//     const oldVal = oldTrade?.[key];
//     const newVal = newTrade[key];
//     
//     // Deep compare for arrays
//     const oldStr = JSON.stringify(oldVal);
//     const newStr = JSON.stringify(newVal);
//     
//     if (oldStr !== newStr) {
//       changes[key] = { from: oldVal, to: newVal };
//     }
//   }
//   
//   return changes;
// }

// Determine event type based on changes
// function determineEventType(changes) {
//   if (changes.stop_loss && !changes.take_profit && Object.keys(changes).length === 1) return 'STOP_MOVED';
//   if (changes.take_profit && !changes.stop_loss && Object.keys(changes).length === 1) return 'TP_MOVED';
//   if (changes.notes && Object.keys(changes).length === 1) return 'NOTE_ADDED';
//   if (changes.exit_price || changes.pnl) return 'FULL_EXIT';
//   return 'EDITED';
// }


function fmt$(n) {
  if (n === null || n === undefined) return "—";
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}
function fmtPct(n) { return `${(n * 100).toFixed(1)}%`; }



// ─────────────────────────────────────────────────────────────
// SUPABASE HOOK - FIXED
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUMENT TICK SETTINGS — module-level, used everywhere
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_INSTRUMENTS = [
  { symbol: "NQ",   description: "E-mini NASDAQ-100",          tickSize: 0.25,     tickValue: 5.00    },
  { symbol: "MNQ",  description: "Micro NASDAQ-100",           tickSize: 0.25,     tickValue: 0.50    },
  { symbol: "ES",   description: "E-mini S&P 500",             tickSize: 0.25,     tickValue: 12.50   },
  { symbol: "MES",  description: "Micro S&P 500",              tickSize: 0.25,     tickValue: 1.25    },
  { symbol: "YM",   description: "E-mini Dow Jones",           tickSize: 1.00,     tickValue: 5.00    },
  { symbol: "MYM",  description: "Micro Dow Jones",            tickSize: 1.00,     tickValue: 0.50    },
  { symbol: "RTY",  description: "E-mini Russell 2000",        tickSize: 0.10,     tickValue: 5.00    },
  { symbol: "M2K",  description: "Micro Russell 2000",         tickSize: 0.10,     tickValue: 0.50    },
  { symbol: "CL",   description: "Crude Oil",                  tickSize: 0.01,     tickValue: 10.00   },
  { symbol: "MCL",  description: "Micro Crude Oil",            tickSize: 0.01,     tickValue: 1.00    },
  { symbol: "NG",   description: "Natural Gas",                tickSize: 0.001,    tickValue: 10.00   },
  { symbol: "GC",   description: "Gold",                       tickSize: 0.10,     tickValue: 10.00   },
  { symbol: "MGC",  description: "Micro Gold",                 tickSize: 0.10,     tickValue: 1.00    },
  { symbol: "SI",   description: "Silver",                     tickSize: 0.005,    tickValue: 25.00   },
  { symbol: "ZN",   description: "10-Year T-Note",             tickSize: 0.015625, tickValue: 15.625  },
  { symbol: "ZB",   description: "30-Year T-Bond",             tickSize: 0.03125,  tickValue: 31.25   },
  { symbol: "6E",   description: "Euro FX",                    tickSize: 0.00005,  tickValue: 6.25    },
  { symbol: "6B",   description: "British Pound",              tickSize: 0.0001,   tickValue: 6.25    },
  { symbol: "ZC",   description: "Corn",                       tickSize: 0.25,     tickValue: 12.50   },
  { symbol: "ZS",   description: "Soybeans",                   tickSize: 0.25,     tickValue: 12.50   },
  { symbol: "ZW",   description: "Wheat",                      tickSize: 0.25,     tickValue: 12.50   },
  { symbol: "BTC",  description: "Bitcoin Futures (CME)",      tickSize: 5.00,     tickValue: 25.00   },
  { symbol: "MBT",  description: "Micro Bitcoin Futures",      tickSize: 5.00,     tickValue: 2.50    },
  { symbol: "ETH",  description: "Ether Futures (CME)",        tickSize: 0.25,     tickValue: 12.50   },
  { symbol: "MET",  description: "Micro Ether Futures",        tickSize: 0.25,     tickValue: 1.25    },
];

function getTickInfo(symbol = "", userSettings = []) {
  const s = symbol.toUpperCase().trim();
  const custom = userSettings.find(u => u.symbol.toUpperCase() === s);
  if (custom) return { tickSize: Number(custom.tick_size), tickValue: Number(custom.tick_value) };
  const builtin = DEFAULT_INSTRUMENTS.find(d => d.symbol === s);
  if (builtin) return { tickSize: builtin.tickSize, tickValue: builtin.tickValue };
  const partial = DEFAULT_INSTRUMENTS.find(d => s.startsWith(d.symbol));
  if (partial) return { tickSize: partial.tickSize, tickValue: partial.tickValue };
  return { tickSize: 0.01, tickValue: 1.00 };
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCIPLINE SCORE — module-level
// ─────────────────────────────────────────────────────────────────────────────
function calcDisciplineScore(trade) {
  const ruleAdherence = Number(trade.rule_adherence   ?? 5);
  const impulsiveness = Number(trade.impulsiveness    ?? 5);
  const conviction    = Number(trade.conviction_level ?? 5);
  const focus         = Number(trade.focus_level      ?? 5);
  const fear          = Number(trade.fear_level       ?? 5);
  const greed         = Number(trade.greed_level      ?? 5);
  return Math.round(
    (ruleAdherence + (10 - impulsiveness) + conviction + focus + (10 - Math.max(fear, greed))) / 5
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALISE TRADE — single source of truth for result + discipline_score
// ─────────────────────────────────────────────────────────────────────────────
function normaliseTrade(data) {
  // Convert empty strings to null for numeric fields to avoid Supabase validation errors
  const numericFields = [
    'entry_price', 'exit_price', 'position_size', 'stop_loss', 'take_profit',
    'conviction_level', 'fear_level', 'greed_level', 'focus_level', 
    'rule_adherence', 'impulsiveness', 'energy_level', 'market_context',
    'outcome_satisfaction', 'confidence_level', 'emotional_intensity', 'commissions', 'fees'
  ];
  
  const cleaned = { ...data };
  numericFields.forEach(field => {
    if (cleaned[field] === '' || cleaned[field] === undefined) {
      cleaned[field] = null;
    } else {
      const parsed = parseFloat(cleaned[field]);
      cleaned[field] = isNaN(parsed) ? null : parsed;
    }
  });
  
  // Recalculate P&L if entry_price, exit_price, and position_size are available
  let pnl = parseFloat(data.pnl) || 0;
  
  if (cleaned.entry_price != null && cleaned.exit_price != null) {
    const entryPrice = parseFloat(cleaned.entry_price);
    const exitPrice = parseFloat(cleaned.exit_price);
    const positionSize = parseFloat(cleaned.position_size) || 1;
    
    if (!isNaN(entryPrice) && !isNaN(exitPrice) && !isNaN(positionSize)) {
      const priceDifference = exitPrice - entryPrice;
      
      // For Long: profit if exit > entry
      // For Short: profit if exit < entry (entry - exit)
      if (cleaned.direction === "Long") {
        pnl = priceDifference * positionSize;
      } else if (cleaned.direction === "Short") {
        pnl = (entryPrice - exitPrice) * positionSize;
      }
      
      // Subtract commissions and fees if present
      if (cleaned.commissions) pnl -= cleaned.commissions;
      if (cleaned.fees) pnl -= cleaned.fees;
    }
  } else if (data.pnl !== undefined) {
    // If prices aren't available, use the provided pnl
    pnl = parseFloat(data.pnl) || 0;
  }
  
  return {
    ...cleaned,
    pnl: parseFloat(pnl.toFixed(2)),
    result: pnl > 0 ? "Win" : pnl < 0 ? "Loss" : "Breakeven",
    discipline_score: calcDisciplineScore(cleaned),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUMENT SETTINGS HOOK
// ─────────────────────────────────────────────────────────────────────────────
function useInstrumentSettings(userId) {
  const [instrumentSettings, setInstrumentSettings] = useState([]);

  const fetchSettings = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/instrument_settings?user_id=eq.${userId}&order=symbol.asc`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      setInstrumentSettings(Array.isArray(data) ? data : []);
    } catch (e) { console.error("Failed to fetch instrument settings", e); }
  }, [userId]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const saveSetting = async (symbol, tickSize, tickValue, description) => {
    if (!userId || !symbol) return;
    const payload = { user_id: userId, symbol: symbol.toUpperCase().trim(),
      tick_size: parseFloat(tickSize), tick_value: parseFloat(tickValue), description: description || null };
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/instrument_settings`, {
        method: "POST",
        headers: { ...authHeaders(), Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(payload),
      });
      if (res.ok) fetchSettings();
      else { const err = await res.json(); alert("Failed: " + (err.message || err.error)); }
    } catch (e) { alert("Network error saving instrument settings"); }
  };

  const deleteSetting = async (id) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/instrument_settings?id=eq.${id}`,
        { method: "DELETE", headers: authHeaders() });
      fetchSettings();
    } catch (e) { alert("Failed to delete"); }
  };

  return { instrumentSettings, saveSetting, deleteSetting };
}

// ─────────────────────────────────────────────────────────────
// SUPABASE HOOK - FINAL CLEAN VERSION
// ─────────────────────────────────────────────────────────────
function useSupabase(userId) {
  const isConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  const uid = userId;

  const [trades, setTrades] = useLocalStorage(`fos_trades_${uid || "demo"}`, []);
  const [customStrategies, setCustomStrategies] = useLocalStorage(`fos_custom_strategies_${uid || "demo"}`, []);

  const fetchTrades = useCallback(async () => {
    if (!isConfigured || !uid) return;

    try {
      await ensureValidToken();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/trades?user_id=eq.${uid}&order=trade_date.desc,created_at.desc&select=*`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      setTrades(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("fetchTrades error:", e);
    }
  }, [isConfigured, uid, setTrades]);

  const fetchCustomStrategies = useCallback(async () => {
    if (!isConfigured || !uid) return;

    try {
      await ensureValidToken();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/custom_strategies?user_id=eq.${uid}&order=created_at.desc&select=*`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      setCustomStrategies(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("fetchCustomStrategies error:", e);
    }
  }, [isConfigured, uid, setCustomStrategies]);

  const addTrade = useCallback(async (tradeData) => {
    const normalised = normaliseTrade(tradeData);
    const newTrade = {
      ...normalised,
      id: Date.now().toString(),
      user_id: uid,
      created_at: new Date().toISOString()
    };

    if (!isConfigured || !uid) {
      setTrades(prev => [newTrade, ...prev]);
      return newTrade;
    }

    try {
      await ensureValidToken();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/trades`, {
        method: "POST",
        headers: { ...authHeaders(), Prefer: "return=representation" },
        body: JSON.stringify({ ...normalised, user_id: uid })
      });

      const saved = await res.json();
      if (res.ok && saved?.[0]) {
        setTrades(prev => [saved[0], ...prev]);
        return saved[0];
      } else {
        console.error("addTrade Supabase error:", res.status, saved);
      }
    } catch (e) {
      console.error("addTrade error:", e);
    }
    // Fallback: add local copy only if Supabase failed
    setTrades(prev => [newTrade, ...prev]);
    return newTrade;
  }, [isConfigured, uid, setTrades]);

  const deleteTrade = useCallback(async (id) => {
    if (isConfigured && uid) {
      try {
        await fetch(
          `${SUPABASE_URL}/rest/v1/trades?id=eq.${id}&user_id=eq.${uid}`,
          { method: "DELETE", headers: authHeaders() }
        );
      } catch (e) {
        console.error("deleteTrade error:", e);
      }
    }
    setTrades(prev => prev.filter(t => t.id !== id));
  }, [isConfigured, uid, setTrades]);

  const updateTrade = useCallback(async (id, updatedData) => {
    let updatedTrade = null;

    // Update local state immediately
    setTrades(prev => {
      const existing = prev.find(t => t.id === id);
      if (!existing) return prev;
      updatedTrade = normaliseTrade({ ...existing, ...updatedData });
      return prev.map(t => (t.id === id ? updatedTrade : t));
    });

    if (isConfigured && uid) {
      try {
        await ensureValidToken();
        const normalisedUpdate = normaliseTrade(updatedData);
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/trades?id=eq.${id}&user_id=eq.${uid}`,
          {
            method: "PATCH",
            headers: { ...authHeaders(), Prefer: "return=representation" },
            body: JSON.stringify(normalisedUpdate)
          }
        );
        const saved = await res.json();
        if (res.ok && saved?.[0]) {
          setTrades(prev => prev.map(t => (t.id === id ? saved[0] : t)));
          return saved[0];
        } else {
          console.error('Update failed:', res.status, saved);
        }
      } catch (e) {
        console.error("updateTrade error:", e);
      }
    }
    return updatedTrade;
  }, [isConfigured, uid, setTrades]);

  // Custom Strategies (similar cleanup)
  const addCustomStrategy = useCallback(async (strategy) => {
    const newStrategy = {
      user_id: uid,
      name: strategy.name,
      id: Date.now().toString(),
      confirmation_factors: strategy.confirmation_factors || null,
      created_at: new Date().toISOString(),
    };

    if (!isConfigured || !uid) {
      setCustomStrategies(prev => [newStrategy, ...prev]);
      return newStrategy;
    }

    try {
      await ensureValidToken();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/custom_strategies`, {
        method: "POST",
        headers: { ...authHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(newStrategy)
      });
      const saved = await res.json();
      if (res.ok && saved?.[0]) {
        setCustomStrategies(prev => [saved[0], ...prev]);
        return saved[0];
      }
    } catch (e) {
      console.error("addCustomStrategy error:", e);
    }

    setCustomStrategies(prev => [newStrategy, ...prev]);
    return newStrategy;
  }, [isConfigured, uid, setCustomStrategies]);

  const deleteCustomStrategy = useCallback(async (id) => {
    if (isConfigured && uid) {
      try {
        await fetch(
          `${SUPABASE_URL}/rest/v1/custom_strategies?id=eq.${id}&user_id=eq.${uid}`,
          { method: "DELETE", headers: authHeaders() }
        );
      } catch (e) {
        console.error("deleteCustomStrategy error:", e);
      }
    }
    setCustomStrategies(prev => prev.filter(s => s.id !== id));
  }, [isConfigured, uid, setCustomStrategies]);

  useEffect(() => {
    if (uid) {
      fetchTrades();
      fetchCustomStrategies();
    }
  }, [uid, fetchTrades, fetchCustomStrategies]);

  return {
    trades,
    addTrade,
    deleteTrade,
    updateTrade,
    refetch: fetchTrades,
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
// MANAGE STRATEGIES - Toggle Built-in + Custom + Daily Limit
// =========================================================================
function ManageStrategies({
  customStrategies,
  addCustomStrategy,
  deleteCustomStrategy,
  setView,
  strategyPreferences,
  setStrategyPreferences,
  profile,
  updateProfile
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
          style={{flex:1, padding:14, background:"#1a1d2e", border:`1px solid ${C.border}`, borderRadius:8, color:C.text}}
          onKeyDown={e => e.key === 'Enter' && handleAddCustom()}
        />
        <Btn onClick={handleAddCustom}>Add</Btn>
      </div>

      {customStrategies.length > 0 && customStrategies.map(strat => (
        <div key={strat.id} style={{padding:"14px", background:"#1a1d2e", borderRadius:8, marginBottom:8, display:"flex", justifyContent:"space-between"}}>
          <span>{strat.name}</span>
          <button onClick={() => deleteCustomStrategy(strat.id)} style={{color: C.red}}>Delete</button>
        </div>
      ))}

      <h3>Risk Limits</h3>
      <div style={{padding:16, background:`${C.green}15`, border:`1px solid ${C.green}40`, borderRadius:8, marginBottom:16}}>
        <label style={{display:"block", marginBottom:8, color:C.text, fontSize:14, fontWeight:600}}>Max Daily Drawdown ($)</label>
        <input
          type="text"
          key={profile?.max_daily_drawdown}
          defaultValue={profile?.max_daily_drawdown || 400}
          onBlur={e => {
            const val = e.target.value.replace(/[^0-9.]/g, '');
            const numVal = val ? parseFloat(val) : 400;
            updateProfile({...profile, max_daily_drawdown: numVal});
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const val = e.target.value.replace(/[^0-9.]/g, '');
              const numVal = val ? parseFloat(val) : 400;
              updateProfile({...profile, max_daily_drawdown: numVal});
              e.target.blur();
            }
          }}
          style={{width:"100%", padding:12, background:"#1a1d2e", border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:14}}
        />
        <div style={{fontSize:11, color:C.sub, marginTop:8}}>
          Maximum loss allowed per day before trading should stop.
        </div>
      </div>

      <div style={{padding:16, background:`${C.blue}15`, border:`1px solid ${C.blue}40`, borderRadius:8, marginBottom:20}}>
        <label style={{display:"block", marginBottom:8, color:C.text, fontSize:14, fontWeight:600}}>Max Daily Trades</label>
        <input
          type="number"
          min="1"
          key={profile?.max_daily_trades}
          defaultValue={profile?.max_daily_trades || 10}
          onBlur={e => {
            const numVal = parseInt(e.target.value) || 10;
            updateProfile({...profile, max_daily_trades: numVal});
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const numVal = parseInt(e.target.value) || 10;
              updateProfile({...profile, max_daily_trades: numVal});
              e.target.blur();
            }
          }}
          style={{width:"100%", padding:12, background:"#1a1d2e", border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:14}}
        />
        <div style={{fontSize:11, color:C.sub, marginTop:8}}>
          Maximum number of trades allowed per day.
        </div>
      </div>
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

    // Parse datetime fields
    const enteredRaw = get("entered_at") || "";
    const exitedRaw  = get("exited_at")  || "";
    const splitDateTime = (raw) => {
      if (!raw) return { date: null, time: null };
      const [datePart, timePart] = raw.includes("T") ? raw.split("T") : raw.split(" ");
      return { date: datePart || null, time: timePart ? timePart.split(".")[0] : null };
    };
    const entered = splitDateTime(enteredRaw);
    const exited  = splitDateTime(exitedRaw);

    // Direction from type field
    const rawType = (get("type") || "").toLowerCase();
    const direction = rawType.includes("buy")  ? "Long"
                    : rawType.includes("sell") ? "Short"
                    : rawType.includes("long") ? "Long"
                    : rawType.includes("short") ? "Short" : "";

    // Duration: parse "H:MM:SS" or seconds
    const parseDuration = (raw) => {
      if (!raw) return null;
      if (raw.includes(":")) {
        const parts = raw.split(":").map(Number);
        if (parts.length === 3) return parts[0] * 60 + parts[1];
        if (parts.length === 2) return parts[0];
      }
      const secs = parseInt(raw);
      return isNaN(secs) ? null : Math.round(secs / 60);
    };

    const pnl = parseFloat(get("pnl")) || 0;

    return {
      symbol:           (get("contract") || "Unknown").replace(/\s+/g, ""),
      direction,
      entry_time:       entered.time || "",
      exit_time:        exited.time  || "",
      trade_date:       get("trade_day") || entered.date || new Date().toISOString().split("T")[0],
      entry_price:      parseFloat(get("entry_price")) || 0,
      exit_price:       parseFloat(get("exit_price"))  || 0,
      position_size:    parseFloat(get("size"))         || 1,
      fees:             parseFloat(get("fees"))          || 0,
      commissions:      parseFloat(get("commissions"))   || 0,
      pnl,
      result:           pnl > 0 ? "Win" : pnl < 0 ? "Loss" : "Breakeven",
      duration_minutes: parseDuration(get("duration")),
      import_source:    "csv",
      created_at:       new Date().toISOString(),
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
// AI INSIGHTS COMPONENT (Currently Unused - Reserved for Future)
// ─────────────────────────────────────────────────────────────
// function AIInsights({ trades, analytics }) {
//   const [loading, setLoading] = useState(true);
//   const [insights, setInsights] = useState([]);
//
//   useEffect(() => {
//     const generateInsights = () => {
//       const avgImp = trades.reduce((s, t) => s + (t.impulsiveness || 5), 0) / trades.length;
//       const avgRule = trades.reduce((s, t) => s + (t.rule_adherence || 5), 0) / trades.length;
//
//       setInsights([
//         {
//           category: "Performance",
//           insight: `Your win rate is ${fmtPct(analytics.winRate)}. High impulsiveness (${avgImp.toFixed(1)}/10) is likely costing you money.`,
//           priority: "high"
//         },
//         {
//           category: "Behavior",
//           insight: `Rule adherence average is ${avgRule.toFixed(1)}/10. Strong rule following correlates with your best trades.`,
//           priority: "medium"
//         },
//         {
//           category: "Timing",
//           insight: `Your best trading window based on data is around 9:30–11:30 AM ET.`,
//           priority: "medium"
//         },
//         {
//           category: "Risk",
//           insight: `Profit factor of ${analytics.profitFactor.toFixed(2)} suggests room to improve risk management.`,
//           priority: "low"
//         }
//       ]);
//       setLoading(false);
//     };
//
//     generateInsights();
//   }, [trades, analytics]);
//
//   if (loading) {
//     return <Card style={{ textAlign: "center", padding: 40 }}>Generating AI insights...</Card>;
//   }
//
//   return (
//     <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
//       {insights.map((ins, i) => (
//         <Card key={i} style={{ padding: 18 }}>
//           <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{ins.category}</div>
//           <p style={{ color: C.text, lineHeight: 1.6 }}>{ins.insight}</p>
//         </Card>
//       ))}
//     </div>
//   );
// }

// ─────────────────────────────────────────────────────────────
// PROGRESS DATA HELPER (Currently Unused - Reserved for Future)
// ─────────────────────────────────────────────────────────────
// function progressData(trades) {
//   const sorted = [...trades].sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date));
//   return sorted.map((t, i) => ({
//     date: t.trade_date?.slice(5) || `T${i+1}`,
//     ruleAdherence: t.rule_adherence || 5,
//     focus: t.focus_level || 5,
//     confidence: t.conviction_level || 5,
//     impulsiveness: t.impulsiveness || 5,
//   }));
// }





// ─────────────────────────────────────────────────────────────
// UI PRIMITIVES
// ─────────────────────────────────────────────────────────────
function Card({ children, style, glow, onClick }) {
  return (
    <div 
      style={{ 
        background: C.panel, 
        border: `1px solid ${glow ? glow + "40" : C.border}`, 
        borderRadius: 14, 
        padding: 20, 
        boxShadow: glow ? `0 0 20px ${glow}10` : "none", 
        cursor: onClick ? "pointer" : "default",
        ...style 
      }}
      onClick={onClick}
    >
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
// ─────────────────────────────────────────────────────────────
// MARKET INTELLIGENCE - ECONOMIC CALENDAR
// ─────────────────────────────────────────────────────────────
function EconomicCalendarWidget() {
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
        const raw = json.economicCalendar || [];

        const etOptions = { timeZone: "America/New_York" };
        const todayLabelET = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...etOptions });
        const nowMs = now.getTime();

        const parsed = raw
          .filter(e => e.country === "US" || e.currency === "USD")
          .map(e => {
            const rawTime = (e.time || "").replace(" ", "T");
            const dt = rawTime ? new Date(rawTime) : null;
            const dateLabel = dt
              ? dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...etOptions })
              : "Unknown";
            const timeLabel = dt
              ? dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", ...etOptions })
              : "All Day";
            
            const impactMap = { "high": 9, "medium": 5, "low": 2 };
            const impact = impactMap[(e.impact || "low").toLowerCase()] || 5;

            return {
              dt,
              isToday: dateLabel === todayLabelET,
              time: timeLabel,
              event: e.event || "Unknown",
              impact,
            };
          })
          .filter(e => e.dt && e.dt.getTime() >= nowMs - 60000)
          .sort((a, b) => a.dt - b.dt);

        const todaysEvents = parsed.filter(e => e.isToday).slice(0, 4);
        setEvents(todaysEvents);
        setLoading(false);
      } catch (err) {
        console.warn("Economic calendar fetch failed");
        setLoading(false);
      }
    };

    fetchEconomicEvents();
  }, []);

  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionTitle>Economic Calendar</SectionTitle>
      {loading ? (
        <div style={{ color: C.muted, fontSize: 12 }}>Loading...</div>
      ) : events.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {events.map((ev, i) => (
            <div key={i} style={{ padding: 10, background: C.border + "30", borderRadius: 6, display: "grid", gridTemplateColumns: "60px 1fr 35px", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{ev.time}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{ev.event}</div>
              <div style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: ev.impact >= 8 ? C.red : C.yellow }}>
                {ev.impact >= 8 ? "High" : "Med"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: C.muted, fontSize: 12 }}>No events today</div>
      )}
    </Card>
  );
}

function MarketRiskWidget() {
  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionTitle>Market Risk Indicator</SectionTitle>
      <div style={{ padding: 12, background: C.border + "30", borderRadius: 8, border: `1px solid ${C.yellow}40` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.yellow }}>✓ Low Risk</div>
        <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>Market conditions stable. Good time to trade.</div>
      </div>
    </Card>
  );
}

function MarketAwarenessWidget({ trades = [], accounts = [], currentAccountId }) {
  const [selectedSymbol, setSelectedSymbol] = useState("auto");
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Auto-detect last traded symbol from last 10 trades
  const lastTradedSymbol = trades.length > 0 
    ? trades[0]?.symbol || "NQ"
    : "NQ";

  const symbolOptions = [
    { value: "auto", label: `Auto-detect (${lastTradedSymbol})` },
    { value: lastTradedSymbol, label: `Last Traded: ${lastTradedSymbol}` },
    { value: "NQ", label: "Nasdaq (NQ)" },
    { value: "ES", label: "S&P 500 (ES)" },
    { value: "YM", label: "Dow (YM)" },
    { value: "EURUSD", label: "EUR/USD" },
    { value: "BTC", label: "BTC/USD" },
    { value: "CL", label: "Crude Oil (CL)" },
    { value: "GC", label: "Gold (GC)" },
  ];

  const activeSymbol = selectedSymbol === "auto" ? lastTradedSymbol : selectedSymbol;

  // Fetch market data
  useEffect(() => {
    const fetchMarketData = async () => {
      setLoading(true);
      try {
        const FINNHUB_API_KEY = process.env.REACT_APP_FINNHUB_API_KEY;
        
        if (!FINNHUB_API_KEY) {
          console.warn("Finnhub API key not set. Set REACT_APP_FINNHUB_API_KEY in .env.local");
          setLoading(false);
          return;
        }
        
        // Map trading symbols to Finnhub symbols
        const symbolMap = {
          "NQ": "NDX",      // Nasdaq 100
          "ES": "GSPC",     // S&P 500
          "YM": "DJI",      // Dow Jones
          "EURUSD": "EURUSD",
          "BTC": "BTCUSD",
          "CL": "USOIL",
          "GC": "GOLD"
        };
        
        const finnhubSymbol = symbolMap[activeSymbol] || activeSymbol;
        
        // Fetch all data in parallel
        const [quoteRes, calendarRes, vixRes, nikkeiRes, daxRes] = await Promise.all([
          fetch(`https://finnhub.io/api/v1/quote?symbol=${finnhubSymbol}&token=${FINNHUB_API_KEY}`),
          fetch(`https://finnhub.io/api/v1/economic-calendar?token=${FINNHUB_API_KEY}`),
          fetch(`https://finnhub.io/api/v1/quote?symbol=VIX&token=${FINNHUB_API_KEY}`),
          fetch(`https://finnhub.io/api/v1/quote?symbol=N225&token=${FINNHUB_API_KEY}`),
          fetch(`https://finnhub.io/api/v1/quote?symbol=DAX&token=${FINNHUB_API_KEY}`)
        ]);
        
        const quote = await quoteRes.json();
        const calendarData = await calendarRes.json();
        const vix = await vixRes.json();
        const nikkei = await nikkeiRes.json();
        const dax = await daxRes.json();
        
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const timeInMinutes = hour * 60 + minute;
        
        // Determine US market status
        let usStatus = "Closed";
        let usBias = "Neutral";
        
        if (timeInMinutes >= 570 && timeInMinutes < 960) { // 9:30 AM - 4:00 PM ET
          usStatus = "Open";
          usBias = quote.d >= 0 ? "Bullish" : "Bearish";
        } else if (timeInMinutes >= 480 && timeInMinutes < 570) { // Pre-market
          usStatus = "Pre-Market";
          usBias = quote.d >= 0 ? "Bullish" : "Bearish";
        } else if (timeInMinutes >= 960 && timeInMinutes < 1020) { // After hours
          usStatus = "After Hours";
          usBias = quote.d >= 0 ? "Bullish" : "Bearish";
        }
        
        // Calculate risk meter from VIX
        const vixLevel = vix.c || 15;
        let baseRisk = 5;
        
        if (vixLevel < 12) baseRisk = 3;
        else if (vixLevel < 15) baseRisk = 4;
        else if (vixLevel < 18) baseRisk = 5;
        else if (vixLevel < 22) baseRisk = 6.5;
        else if (vixLevel < 25) baseRisk = 7.5;
        else baseRisk = 8.5;
        
        const riskMeterValue = (baseRisk + (Math.random() * 0.3 - 0.15)).toFixed(1);
        
        // Build session snapshot with real data
        const sessionSnapshot = [
          {
            session: "Asia",
            status: "Closed",
            bias: nikkei.d >= 0 ? "Bullish" : "Bearish",
            move: `Nikkei ${nikkei.d >= 0 ? "+" : ""}${nikkei.dp?.toFixed(2)}%`
          },
          {
            session: "Europe",
            status: "Open",
            bias: dax.d >= 0 ? "Bullish" : "Bearish",
            move: `DAX ${dax.d >= 0 ? "+" : ""}${dax.dp?.toFixed(2)}%`
          },
          {
            session: "US Open",
            status: usStatus,
            bias: usBias,
            move: `${finnhubSymbol} ${quote.d >= 0 ? "+" : ""}${quote.dp?.toFixed(2)}%`
          }
        ];
        
        // Filter and rank key drivers from economic calendar
        const today = new Date().toISOString().split('T')[0];
        const todayEvents = (Array.isArray(calendarData) ? calendarData : [])
          .filter(e => e.releaseTime && e.releaseTime.startsWith(today))
          .sort((a, b) => {
            const impactScore = { high: 3, medium: 2, low: 1 };
            return (impactScore[b.impact] || 0) - (impactScore[a.impact] || 0);
          })
          .slice(0, 3)
          .map((e, idx) => ({
            rank: idx + 1,
            event: e.event,
            time: new Date(e.releaseTime).toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit' 
            }),
            impact: e.estimate 
              ? `Expected: ${e.estimate}, Previous: ${e.previous}`
              : (e.impact?.charAt(0).toUpperCase() || 'M') + (e.impact?.slice(1) || 'edium') + " Impact"
          }));
        
        // Calculate volatility expectation from VIX
        let volatilityText = "Moderate volatility, directional bias likely";
        if (vixLevel > 20) {
          volatilityText = "Elevated volatility expected, quick moves likely";
        } else if (vixLevel > 18) {
          volatilityText = "Slightly elevated volatility, watch economic data";
        } else if (vixLevel < 12) {
          volatilityText = "Low volatility, ranging market expected";
        }
        
        // Calculate confidence from data
        const priceConfidence = Math.min(Math.abs(quote.dp || 0), 5) * 5;
        const vixConfidence = (30 - Math.abs(vixLevel - 15)) * 1.5;
        const eventConfidence = todayEvents.length > 0 ? 20 : 10;
        const confidence = Math.min(
          Math.round(priceConfidence + vixConfidence + eventConfidence),
          95
        );
        
        const predictions = {
          bias: `${usBias} with ${vixLevel > 18 ? "elevated" : "controlled"} chop`,
          volatility: volatilityText,
          confidenceLevel: confidence
        };
        
        setSessionData({
          sessionSnapshot,
          keyDrivers: todayEvents,
          predictions,
          riskMeter: riskMeterValue
        });
        
        setLastUpdate(new Date());
      } catch (err) {
        console.warn("Market data fetch failed:", err);
      }
      setLoading(false);
    };

    fetchMarketData();
    
    // Refresh every 60 seconds
    const interval = setInterval(fetchMarketData, 60 * 1000);
    return () => clearInterval(interval);
  }, [activeSymbol]);

  // Default data while loading
  const defaultData = {
    sessionSnapshot: [
      { session: "Asia", status: "Closed", bias: "Mixed", move: "Nikkei +0.4%" },
      { session: "Europe", status: "Open", bias: "Mildly Bullish", move: "DAX +0.6%" },
      { session: "US Open", status: "~2h away", bias: "Bullish", move: "Jobs reaction expected" }
    ],
    keyDrivers: [
      { rank: 1, event: "US Economic Data", time: "8:30 AM", impact: "Market moving" },
      { rank: 2, event: "Fed Commentary", time: "Ongoing", impact: "Rate expectations" },
      { rank: 3, event: "Corporate Earnings", time: "Daily", impact: "Sector rotation" }
    ],
    predictions: {
      bias: "Bullish with controlled chop",
      volatility: "Elevated first 90 mins, then directional grind",
      confidenceLevel: 72
    },
    riskMeter: "5.0"
  };

  const data = sessionData || defaultData;
  const formatTime = (date) => {
    if (!date) return "Never";
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  // Check if market is open (US ET)
  const getMarketStatus = () => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const hour = now.getHours();
    const minute = now.getMinutes();
    const timeInMinutes = hour * 60 + minute;
    
    // Weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { isOpen: false, status: "Closed (Weekend)", nextOpen: "Monday 9:30 AM" };
    }
    
    // Regular hours: 9:30 AM - 4:00 PM ET
    if (timeInMinutes >= 570 && timeInMinutes < 960) {
      return { isOpen: true, status: "Open", nextOpen: null };
    }
    
    // Pre-market: 4:00 AM - 9:30 AM ET
    if (timeInMinutes >= 240 && timeInMinutes < 570) {
      return { isOpen: false, status: "Pre-Market", nextOpen: `${(570 - timeInMinutes)} mins` };
    }
    
    // After-hours: 4:00 PM - 8:00 PM ET
    if (timeInMinutes >= 960 && timeInMinutes < 1200) {
      return { isOpen: false, status: "After Hours", nextOpen: "Tomorrow 9:30 AM" };
    }
    
    // Closed overnight
    return { isOpen: false, status: "Closed (Overnight)", nextOpen: "Tomorrow 9:30 AM" };
  };

  const marketStatus = getMarketStatus();

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <SectionTitle>📊 Market Awareness</SectionTitle>
        <div style={{ fontSize: 11, color: C.muted }}>
          {loading ? "Updating..." : `Updated: ${formatTime(lastUpdate)}`}
        </div>
      </div>

      {/* Symbol Selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: C.muted, marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Watch Symbol
        </label>
        <select 
          value={selectedSymbol}
          onChange={(e) => setSelectedSymbol(e.target.value)}
          style={{
            width: "100%",
            padding: 10,
            background: "#1a1d2e",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            color: C.text,
            fontSize: 13
          }}
        >
          {symbolOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Session Snapshot */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
          Today's Session Snapshot
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {data.sessionSnapshot.map((s, i) => (
            <div key={i} style={{ background: "#1a1d2e", padding: 12, borderRadius: 8, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>{s.session}</div>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Status: {s.status}</div>
              <div style={{ fontSize: 10, color: C.sub, marginBottom: 2 }}>Bias: <span style={{ color: C.yellow }}>{s.bias}</span></div>
              <div style={{ fontSize: 10, color: C.sub }}>{s.move}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Meter */}
      <div style={{ marginBottom: 16, padding: 12, background: `${C.yellow}15`, border: `1px solid ${C.yellow}40`, borderRadius: 8 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
          Risk Meter (Intraday)
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: C.yellow }}>{data.riskMeter}</div>
          <div style={{ fontSize: 12, color: C.text }}>/ 10</div>
        </div>
      </div>

      {/* Key Drivers */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
          Today's Key Drivers (Ranked)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.keyDrivers.map((d) => (
            <div key={d.rank} style={{ background: "#1a1d2e", padding: 10, borderRadius: 8, fontSize: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: C.text }}>#{d.rank} {d.event}</span>
                <span style={{ color: C.muted }}>{d.time}</span>
              </div>
              <div style={{ color: C.sub }}>{d.impact}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Real-Time Prediction */}
      <div style={{ marginBottom: 16, padding: 12, background: `${C.green}15`, border: `1px solid ${C.green}40`, borderRadius: 8 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
          Real-Time Prediction – Today Only
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Bias</div>
            <div style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>{data.predictions.bias}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Volatility Expectation</div>
            <div style={{ fontSize: 13, color: C.yellow, fontWeight: 700 }}>{data.predictions.volatility}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Confidence Level</div>
            <div style={{ fontSize: 13, color: C.blue, fontWeight: 700 }}>{data.predictions.confidenceLevel}%</div>
          </div>
        </div>
      </div>

      {/* Quick Risk Rules */}
      <div style={{ padding: 12, background: `${C.red}15`, border: `1px solid ${C.red}40`, borderRadius: 8 }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
          Quick Risk Rules for Today
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, color: C.text, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ color: C.yellow, marginTop: 1 }}>•</span>
            <span>Max size only after key events confirmed</span>
          </div>
          <div style={{ fontSize: 12, color: C.text, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ color: C.yellow, marginTop: 1 }}>•</span>
            <span>Avoid big positions into weekend</span>
          </div>
          <div style={{ fontSize: 12, color: C.text, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ color: C.yellow, marginTop: 1 }}>•</span>
            <span>Best trading window: 9:30 AM - 12:00 PM ET</span>
          </div>
        </div>
      </div>

      {/* Market Status Note */}
      <div style={{ marginTop: 12, fontSize: 10, color: marketStatus.isOpen ? C.green : C.yellow, fontStyle: "italic", textAlign: "center", padding: "8px", background: "#1a1d2e", borderRadius: 6 }}>
        {marketStatus.isOpen ? "🟢 Market Open" : `🔴 ${marketStatus.status}`} • Using Finnhub real-time data • Updates every 60 seconds
      </div>
    </Card>
  );
}

function PreMarketBriefWidget() {
  return <MarketAwarenessWidget />;
}

function NewsWidget() {
  const [newsItems, setNewsItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const NEWSAPI_KEY = process.env.REACT_APP_NEWSAPI_KEY;
        
        if (!NEWSAPI_KEY) {
          console.warn("NewsAPI key not set. Set REACT_APP_NEWSAPI_KEY in .env.local");
          setLoading(false);
          return;
        }
        
        // Market-related keywords for filtering
        const keywords = [
          "trading", "market", "stocks", "cryptocurrency", "bitcoin",
          "ethereum", "forex", "earnings", "inflation", "fed",
          "interest rate", "economic data", "nasdaq", "s&p 500"
        ];
        
        const query = keywords.join(" OR ");
        
        // Fetch from NewsAPI
        const response = await fetch(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&language=en&pageSize=20&apiKey=${NEWSAPI_KEY}`
        );
        
        if (!response.ok) throw new Error("NewsAPI fetch failed");
        
        const data = await response.json();
        
        // Deduplicate by title
        const seen = new Set();
        const sourceCount = {};
        
        const filtered = (data.articles || [])
          .filter(a => {
            // Deduplicate
            if (seen.has(a.title)) return false;
            seen.add(a.title);
            
            // Limit 3 per source for diversity
            const source = (a.source?.name || "News").trim();
            sourceCount[source] = (sourceCount[source] || 0) + 1;
            return sourceCount[source] <= 3;
          })
          .map(a => ({
            time: new Date(a.publishedAt).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit'
            }),
            source: a.source?.name || "News",
            title: a.title,
            link: a.url,
            image: a.urlToImage
          }))
          .slice(0, 8); // Show top 8 articles
        
        setNewsItems(filtered);
        setLastUpdated(new Date());
        setLoading(false);
      } catch (err) {
        console.warn("News fetch failed:", err);
        setLoading(false);
      }
    };
    
    fetchNews();
    
    // Refresh every 15 minutes (within 100/day limit)
    const interval = setInterval(fetchNews, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const formatLastUpdated = (date) => {
    if (!date) return "Never";
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // seconds
    
    if (diff < 60) {
      // Show actual time for "just now"
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionTitle>News Feed</SectionTitle>
        <div style={{ fontSize: 10, color: C.muted }}>Updated: {formatLastUpdated(lastUpdated)}</div>
      </div>
      {loading ? (
        <div style={{ color: C.muted, fontSize: 12 }}>Loading...</div>
      ) : newsItems.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {newsItems.map((item, i) => (
            <a
              key={i}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: 10, background: C.border + "30", borderRadius: 6, cursor: "pointer", textDecoration: "none", display: "flex", gap: 8 }}
            >
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 4,
                  flexShrink: 0,
                  background: (() => {
                    const colors = [C.blue, C.purple, C.green, C.red, C.yellow];
                    const hash = item.source.charCodeAt(0) % colors.length;
                    return colors[hash];
                  })(),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  opacity: 0.8,
                }}
              >
                {item.source.includes("Reuters") ? "📰" : item.source.includes("CNBC") ? "📺" : item.source.includes("FXStreet") ? "💱" : "📊"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                  <div style={{ fontSize: 9, color: C.muted }}>{item.time}</div>
                  <div style={{ fontSize: 9, color: C.blue }}>{item.source}</div>
                </div>
                <div style={{ fontSize: 10, color: C.text, lineHeight: "1.3" }}>
                  {item.title.length > 70 ? item.title.substring(0, 70) + "..." : item.title}
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div style={{ color: C.muted, fontSize: 12 }}>No market-impacting news available</div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// TODAY'S PERFORMANCE WITH MDD TOGGLE
// ─────────────────────────────────────────────────────────────
function TodaysPerformanceCard({ trades = [], maxDailyDrawdown = 400 }) {
  const [showMDD, setShowMDD] = useState(false);
  
  const today = new Date().toDateString();
  const todaysTrades = trades.filter(t => new Date(t.trade_date).toDateString() === today);
  const todayPnL = todaysTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  
  // Calculate actual MDD from trades for today
  let runningPnL = 0;
  let peakPnL = 0;
  let maxDrawdown = 0;
  
  const sortedTrades = [...todaysTrades].sort((a, b) => new Date(a.entry_time) - new Date(b.entry_time));
  
  sortedTrades.forEach(trade => {
    runningPnL += (trade.pnl || 0);
    peakPnL = Math.max(peakPnL, runningPnL);
    const currentDrawdown = peakPnL - runningPnL;
    maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
  });

  // Build chart data based on actual trades
  const chartData = sortedTrades.length > 0 
    ? sortedTrades.map((trade, i) => {
        const accPnL = sortedTrades.slice(0, i + 1).reduce((s, t) => s + (t.pnl || 0), 0);
        
        // Calculate drawdown up to this point
        let runPnL = 0;
        let peak = 0;
        let dd = 0;
        for (let j = 0; j <= i; j++) {
          runPnL += (sortedTrades[j].pnl || 0);
          peak = Math.max(peak, runPnL);
          dd = Math.max(dd, peak - runPnL);
        }
        
        return {
          time: new Date(trade.entry_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          pnl: accPnL,
          mdd: dd  // Actual drawdown at this point
        };
      })
    : [
        { time: "12 AM", pnl: 0, mdd: 0 },
        { time: "6 AM", pnl: 0, mdd: 0 },
        { time: "12 PM", pnl: 0, mdd: 0 },
        { time: "6 PM", pnl: 0, mdd: 0 },
      ];
  
  const drawdownPercent = (maxDrawdown / maxDailyDrawdown) * 100;
  const isNearLimit = drawdownPercent > 75;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <SectionTitle>Today's Performance</SectionTitle>
        <button
          onClick={() => setShowMDD(!showMDD)}
          style={{
            padding: "6px 12px",
            background: showMDD ? C.red : C.border,
            color: C.text,
            border: "none",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          {showMDD ? "MDD On" : "MDD Off"}
        </button>
      </div>

      {showMDD && (
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>
          MDD Limit: {fmt$(maxDailyDrawdown)} | Current: {fmt$(maxDrawdown)}
        </div>
      )}

      <div style={{ fontSize: 32, fontWeight: 800, color: todayPnL > 0 ? C.green : todayPnL < 0 ? C.red : C.text, marginBottom: 12, fontFamily: "monospace" }}>
        {fmt$(todayPnL)}
      </div>

      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis dataKey="time" stroke={C.muted} />
            <YAxis stroke={C.muted} />
            <Tooltip formatter={(v) => fmt$(v)} />
            <Line type="monotone" dataKey="pnl" stroke={todayPnL > 0 ? C.green : todayPnL < 0 ? C.red : C.yellow} strokeWidth={2} />
            {showMDD && <Line type="monotone" dataKey="mdd" stroke={C.red} strokeWidth={2} strokeDasharray="5,5" />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {isNearLimit && (
        <div style={{ marginTop: 12, padding: 10, background: C.red + "20", border: `1px solid ${C.red}40`, borderRadius: 8, color: C.red, fontSize: 11 }}>
          ⚠️ Current drawdown: {fmt$(maxDrawdown)} ({drawdownPercent.toFixed(1)}% of limit)
        </div>
      )}
    </Card>
  );
}

function MarketStatusCard() {
  const [nextEvent, setNextEvent] = useState(null);
  const [timeToEvent, setTimeToEvent] = useState(null);
  const [isSafe, setIsSafe] = useState(true);

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
          { signal: AbortSignal.timeout(5000) }
        );
        const json = await res.json();
        const raw = json.economicCalendar || [];

        const impactMap = { "high": 9, "medium": 5, "low": 2 };
        const parsed = raw
          .filter(e => (e.impact || "").toLowerCase() === "high" && (e.country === "US" || e.currency === "USD"))
          .map(e => ({
            dt: new Date(e.time || e.date),
            event: e.event || "Unknown",
            impact: impactMap[(e.impact || "low").toLowerCase()] || 5,
          }))
          .sort((a, b) => a.dt - b.dt);

        const nowMs = now.getTime();
        const upcoming = parsed.find(e => e.dt.getTime() > nowMs);

        if (upcoming) {
          setNextEvent(upcoming);
          const diff = (upcoming.dt.getTime() - nowMs) / 1000;
          setTimeToEvent(diff);
          setIsSafe(diff > 300); // Safe if more than 5 minutes
        } else {
          setIsSafe(true);
          setNextEvent(null);
        }
      } catch (err) {
        console.warn("Market status fetch failed");
        setIsSafe(true);
      }
    };

    fetchEconomicEvents();
    const interval = setInterval(fetchEconomicEvents, 60000);
    return () => clearInterval(interval);
  }, []);

  // Update countdown every second
  useEffect(() => {
    if (!nextEvent) return;
    const interval = setInterval(() => {
      const now = new Date();
      const diff = (nextEvent.dt.getTime() - now.getTime()) / 1000;
      if (diff <= 0) {
        setIsSafe(true);
        setNextEvent(null);
      } else {
        setTimeToEvent(diff);
        setIsSafe(diff > 300);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [nextEvent]);

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };

  return (
    <Card glow={isSafe ? C.green : C.red} style={{
      background: isSafe ? `${C.green}15` : `${C.red}15`,
      border: `1px solid ${isSafe ? C.green : C.red}40`,
      marginBottom: 16
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 24 }}>{isSafe ? "✅" : "⚠️"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: isSafe ? C.green : C.red }}>
            {isSafe ? "SAFE TO TRADE" : "HIGH IMPACT EVENT INCOMING"}
          </div>
          {nextEvent && (
            <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>
              {nextEvent.event} in {formatTime(timeToEvent)}
            </div>
          )}
          {!nextEvent && (
            <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>
              No high-impact events in the next 7 days
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function Dashboard({
  trades, 
  setView, 
  showSetup, 
  setShowSetup, 
  displayName = "Trader", 
  accounts = [], 
  currentAccountId, 
  setCurrentAccountId,
  profile,
  openTradeReview,
  updateTrade
}) {
  const [selectedAccountId, setSelectedAccountId] = useState(() => 
    Array.isArray(accounts) && accounts.length > 0 ? accounts[0].id : null
  );
  const [showRMultiple, setShowRMultiple] = useState(false);

  const selectedAccount = Array.isArray(accounts) 
    ? accounts.find(a => a.id === currentAccountId) 
    : null;

  const accountTrades = currentAccountId && Array.isArray(accounts)
    ? trades.filter(t => t.account_id === currentAccountId) 
    : trades;

  const today = new Date().toDateString();
  const todayTrades = accountTrades.filter(t => new Date(t.trade_date).toDateString() === today);
  const todayPnl = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const todayWins = todayTrades.filter(t => t.result === "Win").length;
  const winRate = todayTrades.length ? todayWins / todayTrades.length : 0;
  const analytics = buildAnalytics(accountTrades);

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) + " ET";

  const dailyLimit = profile?.max_daily_trades ?? 10;

  // Calculate 7-day Discipline Trend
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const lastWeekTrades = accountTrades.filter(t => new Date(t.created_at) >= sevenDaysAgo);
  const lastWeekDiscipline = lastWeekTrades.length > 0
    ? lastWeekTrades.reduce((s, t) => s + (t.discipline_score || 7), 0) / lastWeekTrades.length
    : 0;
  const todayDiscipline = todayTrades.length > 0
    ? todayTrades.reduce((s, t) => s + (t.discipline_score || 7), 0) / todayTrades.length
    : 0;
  const disciplineTrend = todayDiscipline - lastWeekDiscipline;

  const kpis = [
    { label: "Today P&L", value: fmt$(todayPnl), color: todayPnl >= 0 ? C.green : C.red },
    { 
      label: "Trades Today", 
      value: `${todayTrades.length}`, 
      sub: `of ${dailyLimit} max`, 
      color: todayTrades.length >= dailyLimit ? C.yellow : C.blue 
    },
    { label: "Win Rate", value: fmtPct(winRate), color: C.purple },
    { 
      label: "Discipline", 
      value: analytics ? 
        `${Math.round(accountTrades.slice(0, 5).reduce((s, t) => s + (t.discipline_score || 7), 0) / 
          Math.min(accountTrades.slice(0, 5).length || 1, 5))}/10` : "—", 
      sub: disciplineTrend > 0.1 ? "📈 Improving" : disciplineTrend < -0.1 ? "📉 Declining" : "→ Stable",
      color: C.green,
      onClick: () => setView("discipline")
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
      {/* LEFT COLUMN - MAIN CONTENT */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {showSetup && <SetupBanner onDismiss={() => setShowSetup(false)} />}

      {/* ACCOUNT SELECTOR */}
      {Array.isArray(accounts) && accounts.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: C.muted, marginBottom: 6, display: "block" }}>Viewing Account</label>
          <select 
            value={currentAccountId || ""} 
            onChange={e => setCurrentAccountId(e.target.value)}
            style={{ width: "100%", padding: 12, background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }}
          >
            <option value="">All Accounts</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name} — {acc.account_type?.toUpperCase()} (${acc.starting_balance})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, background: `linear-gradient(135deg, ${C.text}, ${C.sub})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {displayName} 👋
          </h1>
          <p style={{ color: C.muted, margin: "4px 0 0", fontSize: 13, fontFamily: "monospace" }}>Discipline today. Freedom tomorrow.</p>
        </div>
        <div style={{ textAlign: "right", color: C.muted, fontSize: 11, fontFamily: "monospace" }}>
          <div>{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          <div style={{ marginTop: 2, color: C.sub }}>{timeStr}</div>
        </div>
      </div>

      {/* Market Status Card */}
      <MarketStatusCard />

      {/* KPI Strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {kpis.map(k => (
          <Card key={k.label} glow={k.color} style={{ padding: 16 }} onClick={k.onClick}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, fontFamily: "monospace" }}>{k.value}</div>
            {k.sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{k.sub}</div>}
          </Card>
        ))}
      </div>
{/* Quick Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <Card 
          style={{ cursor: "pointer", transition: "all 0.2s" }} 
          onClick={() => setView("entry")}
          onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 48, height: 48, background: C.green + "20", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>✍️</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Log Trade</div>
              <div style={{ fontSize: 12, color: C.muted }}>Manual or CSV Import</div>
            </div>
          </div>
        </Card>

        <Card 
          style={{ cursor: "pointer", transition: "all 0.2s" }} 
          onClick={() => setView("review")}
          onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 48, height: 48, background: C.purple + "20", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🧠</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Review Last Trade</div>
              <div style={{ fontSize: 12, color: C.muted }}>AI Analysis & Feedback</div>
            </div>
          </div>
        </Card>

        <Card 
          style={{ cursor: "pointer", transition: "all 0.2s" }} 
          onClick={() => setView("checklist")}
          onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 48, height: 48, background: C.blue + "20", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>✅</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Can I Trade?</div>
              <div style={{ fontSize: 12, color: C.muted }}>Pre-Trade Checklist</div>
            </div>
          </div>
        </Card>
      </div>



      {/* Today's Performance with MDD Toggle */}
      <TodaysPerformanceCard trades={accountTrades} maxDailyDrawdown={parseFloat(profile?.max_daily_drawdown) || 400} key={profile?.max_daily_drawdown} />
      
      {/* Equity Curve */}
      <Card>
        <SectionTitle>Total Equity</SectionTitle>
        <div style={{ fontSize: 32, fontWeight: 800, color: C.green, marginBottom: 8 }}>
          {fmt$(analytics?.totalPnl || 0)}
        </div>
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics?.equityCurve || []}>
              <defs>
                <linearGradient id="eqC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.green} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={C.green} strokeWidth={3} fill="url(#eqC)" />
              <Tooltip formatter={v => [fmt$(v), "Equity"]} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginTop: 8 }}>
          <div>178W • 76L • PF 1.44</div>
          <div style={{ color: C.green }}>All Time</div>
        </div>
      </Card>

      {/* Recent Trades */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <SectionTitle action={<button onClick={() => setView("analytics")} style={{ background: "none", border: "none", color: C.blue, fontSize: 12, cursor: "pointer" }}>View Analytics →</button>}>
            Recent Trades ({selectedAccount ? selectedAccount.name : "All Accounts"})
          </SectionTitle>
          <button
            onClick={() => setShowRMultiple && setShowRMultiple(!showRMultiple)}
            style={{
              padding: "4px 8px",
              background: showRMultiple ? C.blue : C.border,
              color: C.text,
              border: "none",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            {showRMultiple ? "R-Multiple" : "P&L"}
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>{["Date / Time", "Symbol", "Setup", "Dir", "Result", showRMultiple ? "R-Multiple" : "P&L", "Score"].map(h => (
                <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: C.muted, fontWeight: 500, whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {accountTrades.slice(0, 5).map((t) => (
                <tr 
                  key={t.id} 
                  onClick={() => openTradeReview(t)}
                  style={{ 
                    borderBottom: `1px solid ${C.border}20`,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    backgroundColor: "transparent"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = C.border + "20"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <td style={{ padding: "10px", color: C.sub, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                    {t.trade_date || t.created_at?.split("T")[0] || "—"}<br />
                    <span style={{ fontSize: 10 }}>{t.trade_time?.slice(0, 5) || "—"}</span>
                  </td>
                  <td style={{ padding: "10px", color: C.text, fontFamily: "monospace", fontWeight: 600 }}>{t.symbol}</td>
                  <td style={{ padding: "10px" }}><Tag label={t.setup_type || "—"} color={C.purple} /></td>
                  <td style={{ padding: "10px", color: t.direction === "Long" ? C.green : C.red, fontWeight: 600 }}>{t.direction === "Long" ? "↑" : "↓"} {t.direction}</td>
                  <td style={{ padding: "10px" }}>
                    <span style={{ background: t.result === "Win" ? C.green + "18" : C.red + "18", color: t.result === "Win" ? C.green : C.red, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{t.result}</span>
                  </td>
                  <td style={{ padding: "10px" }}>
                    {showRMultiple ? (
                      (() => {
                        let rMultiple = null;
                        // Calculate risk from stop loss if available
                        if (t.entry_price && t.stop_loss) {
                          const risk = Math.abs(t.entry_price - t.stop_loss);
                          rMultiple = risk > 0 ? t.pnl / risk : null;
                        }
                        // Otherwise use risk field if available
                        if (rMultiple === null && t.risk) {
                          rMultiple = t.pnl / t.risk;
                        }
                        
                        return rMultiple !== null ? (
                          <span style={{ color: rMultiple > 0 ? C.green : C.red, fontWeight: 600, fontFamily: "monospace" }}>
                            {rMultiple > 0 ? "+" : ""}{rMultiple.toFixed(1)}R
                          </span>
                        ) : (
                          <span style={{ color: C.muted, fontFamily: "monospace" }}>—</span>
                        );
                      })()
                    ) : (
                      <Pill value={t.pnl || 0} />
                    )}
                  </td>
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

      {/* RIGHT COLUMN - MARKET INTELLIGENCE */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <EconomicCalendarWidget />
        <MarketRiskWidget />
        <PreMarketBriefWidget />
        <NewsWidget />
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
  strategyPreferences = { builtInEnabled: {} },
  accounts = [],
  currentAccountId,
  setCurrentAccountId,
  userId,
  supabase
}) {
const [stage, setStage] = useState("account-select");
  // CSV Import Function
const handleCSVImport = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    const text = event.target.result;
    const parsed = parseCSV(text);

    if (parsed.length === 0) {
      alert("No valid trades found in the CSV file.");
      return;
    }

    if (!form.account_id) {
      alert("Please select an account in Stage 0 (Account Selection) before importing CSV.");
      return;
    }

    let imported = 0;
    for (const trade of parsed) {
      await addTrade({ 
        ...trade, 
        account_id: form.account_id   // ← Uses the account selected in Stage 1
      });
      imported++;
    }

    alert(`✅ Successfully imported ${imported} trades from CSV into account!`);
    e.target.value = ""; // Reset file input
  };
  reader.readAsText(file);
};
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
    setup_type: "",
    notes: "",
    market_condition: "",
    entry_signal: "",
    conviction_level: 5,
    is_news_event: false,
    decision_speed: "moderate",
    mental_state: "",
    emotional_intensity: 5,
    focus_level: 5,
    rule_adherence: 5,
    impulsiveness: 5,
    energy_level: 5,
    market_context: 5,
    outcome_satisfaction: 5,
    account_id: ""
  });

  const [postTradeForm, setPostTradeForm] = useState({
    exit_reason: "",
    fear_level: 5,
    greed_level: 5,
    post_trade_emotion: "",
    post_trade_reflection: "",
    rule_violations: [],
    what_to_improve: ""
  });

  // formatTime - Currently unused, keeping for potential future use
  // const formatTime = (input) => {
  //   if (!input) return "";
  //   let digits = input.replace(/[^0-9]/g, '').slice(0, 9);
  //   let result = '';
  //   if (digits.length >= 2) result += digits.slice(0,2) + ':';
  //   if (digits.length >= 4) result += digits.slice(2,4) + ':';
  //   if (digits.length >= 6) result += digits.slice(4,6);
  //   if (digits.length > 6) result += '.' + digits.slice(6,9);
  //   return result;
  // };

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
          setup_type: tradeData.setup_type || "",
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
    const e     = parseFloat(form.entry_price);
    const x     = parseFloat(form.exit_price);
    const size  = parseFloat(form.position_size) || 1;
    const fees  = parseFloat(form.fees)          || 0;
    const comms = parseFloat(form.commissions)   || 0;
    if (!e || !x) return 0;
    const dir = form.direction === "Long" ? 1 : -1;
    const { tickSize, tickValue } = getTickInfo(form.symbol, []);
    const ticks = (x - e) / tickSize;
    const gross = dir * ticks * tickValue * size;
    return Math.round((gross - fees - comms) * 100) / 100;
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
      // ✅ Calculate duration_minutes from entry_time and exit_time
      let duration = null;
      if (form.entry_time && form.exit_time) {
        try {
          // Parse times in HH:MM:SS.mmm or HH:MM format
          const parseTime = (timeStr) => {
            if (!timeStr) return null;
            // Remove any whitespace
            timeStr = timeStr.trim();
            const parts = timeStr.split(':');
            if (parts.length < 2) return null;
            
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            
            // Handle seconds with or without milliseconds (HH:MM:SS.mmm or HH:MM:SS)
            let seconds = 0;
            if (parts.length >= 3) {
              const secondParts = parts[2].split('.');
              seconds = parseInt(secondParts[0], 10) || 0;
            }
            
            if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
            
            return hours * 3600 + minutes * 60 + seconds;
          };
          
          const entrySeconds = parseTime(form.entry_time);
          const exitSeconds = parseTime(form.exit_time);
          
          console.log(`Duration calc: entry=${form.entry_time} (${entrySeconds}s), exit=${form.exit_time} (${exitSeconds}s)`);
          
          if (entrySeconds !== null && exitSeconds !== null) {
            let diffSeconds = exitSeconds - entrySeconds;
            
            // Handle case where trade spans multiple days (exit time < entry time)
            if (diffSeconds < 0) {
              diffSeconds += 24 * 3600; // Add 24 hours
            }
            
            duration = Math.round(diffSeconds / 60); // Convert to minutes
            console.log(`Duration calculated: ${duration} minutes`);
          }
        } catch (e) {
          console.error("Error calculating duration:", e);
        }
      }

     const finalTrade = {
  ...form,
  ...postTradeForm,
  account_id: form.account_id || currentAccountId,
  pnl: estPnl,
  risk_reward: riskReward !== "—" ? riskReward : null,
  result: estPnl > 0 ? "Win" : estPnl < 0 ? "Loss" : "Breakeven",
  duration_minutes: duration,
  // Ensure mental_state is set only once (from form)
  mental_state: form.mental_state || postTradeForm.mental_state || null
};

      console.log("Final trade object:", finalTrade);

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
  {["account-select", "pre-trade", "trade-entry", "post-trade"].map((s, i) => (
    <div key={s} style={{
      flex: 1, padding: "14px", borderRadius: 10, textAlign: "center",
      background: stage === s ? C.blue + "30" : "#1a1d2e",
      border: `2px solid ${stage === s ? C.blue : C.border}`,
      color: stage === s ? C.blue : C.muted
    }}>
      {i + 1}. {s === "account-select" ? "Account" :
               s === "pre-trade" ? "Pre-Trade" :
               s === "trade-entry" ? "Execution" : "Reflection"}
    </div>
  ))}
</div>


{/* ACCOUNT SELECTION STAGE - FIRST STEP */}
{stage === "account-select" && (
  <Card>
    <h3>0. Select Trading Account</h3>
    <p style={{ color: C.muted, marginBottom: 20 }}>All trades in this session will be linked to this account.</p>
    
    <select
      value={form.account_id || ""}
      onChange={e => {
        const accId = e.target.value;
        setForm(p => ({...p, account_id: accId}));
        setCurrentAccountId(accId);   // Sync global state
      }}
      style={{ width: "100%", padding: 16, background: "#1a1d2e", color: "#ffffff", border: `2px solid ${C.border}`, borderRadius: 12, fontSize: 15 }}
    >
      <option value="">Choose an Account...</option>
      {accounts && accounts.length > 0 ? (
        accounts.map(acc => (
          <option key={acc.id} value={acc.id}>
            {acc.name} — {acc.account_type?.toUpperCase()} — ${acc.starting_balance}
          </option>
        ))
      ) : (
        <option value="">No accounts found — go to Portfolio first</option>
      )}
    </select>

    <Btn
      onClick={() => {
        if (form.account_id) {
          setCurrentAccountId(form.account_id);   // Ensure it's set
          setStage("pre-trade");
        } else {
          alert("Please select an account");
        }
      }}
      style={{ width: "100%", marginTop: 24 }}
    >
      Continue to Pre-Trade →
    </Btn>
  </Card>
)}




      {/* PRE-TRADE STAGE */}
      {stage === "pre-trade" && (
        <Card>
          <h3>1. Pre-Trade</h3>

          {/* CSV Import Button */}
          <div style={{ marginBottom: 24, textAlign: "center" }}>
            <label style={{ 
              display: "inline-block", 
              padding: "12px 24px", 
              background: C.blue + "15", 
              border: `2px solid ${C.blue}`, 
              borderRadius: 12, 
              color: C.blue, 
              cursor: "pointer", 
              fontSize: 14,
              fontWeight: 600
            }}>
              📥 Import CSV (TopStep, Tradovate, etc.)
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleCSVImport} 
                style={{ display: "none" }} 
              />
            </label>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
              Supports TopStep / Tradovate / most broker exports
            </div>
          </div>



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
            <input 
              type="text" 
              value={form.symbol} 
              onChange={e => setForm(p => ({...p, symbol: e.target.value.toUpperCase()}))} 
              style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#ffffff", border: `1px solid ${C.border}`, borderRadius: 8 }} 
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Trade Date</label>
              <input 
                type="date" 
                value={form.trade_date} 
                onChange={e => setForm(p => ({...p, trade_date: e.target.value}))} 
                style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#e0e0e0", borderRadius: 8 }} 
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Position Size</label>
              <input 
                type="number" 
                value={form.position_size} 
                onChange={e => setForm(p => ({...p, position_size: e.target.value}))} 
                style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#e0e0e0", borderRadius: 8 }} 
              />
            </div>
          </div>

        {/* TIME FIELDS - FIXED */}
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
  <div>
    <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Entry Time</label>
    <input 
      type="text" 
      placeholder="HH:MM:SS.mmm" 
      maxLength="12"
      value={form.entry_time || ""} 
      onChange={e => {
        let val = e.target.value.replace(/[^0-9:.]/g, '');
        
        // Auto-format as user types
        if (val.length === 2 && !val.includes(':')) {
          val = val + ':';
        } else if (val.length === 5 && (val.match(/:/g) || []).length === 1) {
          val = val + ':';
        } else if (val.length === 8 && (val.match(/:/g) || []).length === 2) {
          val = val + '.';
        }
        
        // Prevent exceeding max length
        if (val.length > 12) {
          val = val.slice(0, 12);
        }
        
        setForm(p => ({...p, entry_time: val}));
      }}
      style={{ 
        width: "100%", 
        padding: 14, 
        background: "#1a1d2e", 
        color: "#e0e0e0", 
        borderRadius: 8, 
        fontFamily: "monospace", 
        fontSize: 16 
      }} 
    />
  </div>
  <div>
    <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Exit Time</label>
    <input 
      type="text" 
      placeholder="HH:MM:SS.mmm" 
      maxLength="12"
      value={form.exit_time || ""} 
      onChange={e => {
        let val = e.target.value.replace(/[^0-9:.]/g, '');
        
        // Enforce format: HH:MM:SS.mmm
        if (val.length === 2 && !val.includes(':')) {
          val = val + ':';
        } else if (val.length === 5 && val.match(/^\d{2}:\d{2}$/)) {
          val = val + ':';
        } else if (val.length === 8 && val.match(/^\d{2}:\d{2}:\d{2}$/)) {
          val = val + '.';
        } else if (val.length > 12) {
          val = val.slice(0, 12);
        }
        
        // Validate each part
        const parts = val.split(/[:.]/)
        if (parts[0] && parts[0].length === 2) {
          const hh = parseInt(parts[0]);
          if (hh > 23) val = '23' + val.substring(2);
        }
        if (parts[1] && parts[1].length === 2) {
          const mm = parseInt(parts[1]);
          if (mm > 59) val = val.substring(0, 3) + '59' + val.substring(5);
        }
        if (parts[2] && parts[2].length === 2) {
          const ss = parseInt(parts[2]);
          if (ss > 59) val = val.substring(0, 6) + '59' + val.substring(8);
        }
        if (parts[3] && parts[3].length === 3) {
          const mmm = parseInt(parts[3]);
          if (mmm > 999) val = val.substring(0, 9) + '999';
        }
        
        setForm(p => ({...p, exit_time: val}));
      }}
      style={{ 
        width: "100%", 
        padding: 14, 
        background: "#1a1d2e", 
        color: "#e0e0e0", 
        borderRadius: 8, 
        fontFamily: "monospace", 
        fontSize: 16 
      }} 
    />
  </div>
</div>

          {/* DIRECTION TOGGLE */}
          <div style={{ marginTop: 20, marginBottom: 20 }}>
            <label style={{ display: "block", marginBottom: 12, color: "#ffffff", fontSize: 14, fontWeight: 600 }}>Trade Direction *</label>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setForm(p => ({...p, direction: "Long"}))}
                style={{
                  flex: 1,
                  padding: 14,
                  background: form.direction === "Long" ? "#00e676" : "#1a1d2e",
                  color: form.direction === "Long" ? "#000" : "#00e676",
                  border: `2px solid ${form.direction === "Long" ? "#00e676" : "#00e67640"}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                  transition: "all 0.2s"
                }}
              >
                ↑ Long
              </button>
              <button
                onClick={() => setForm(p => ({...p, direction: "Short"}))}
                style={{
                  flex: 1,
                  padding: 14,
                  background: form.direction === "Short" ? "#ff1744" : "#1a1d2e",
                  color: form.direction === "Short" ? "#fff" : "#ff1744",
                  border: `2px solid ${form.direction === "Short" ? "#ff1744" : "#ff174440"}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                  transition: "all 0.2s"
                }}
              >
                ↓ Short
              </button>
            </div>
          </div>

          {/* PRICE FIELDS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Entry Price *</label>
              <input 
                type="number" 
                step="0.01" 
                value={form.entry_price || ""} 
                onChange={e => setForm(p => ({...p, entry_price: e.target.value}))} 
                style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#e0e0e0", borderRadius: 8 }} 
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Exit Price *</label>
              <input 
                type="number" 
                step="0.01" 
                value={form.exit_price || ""} 
                onChange={e => setForm(p => ({...p, exit_price: e.target.value}))} 
                style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#e0e0e0", borderRadius: 8 }} 
              />
            </div>
          </div>

          {/* RISK FIELDS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Stop Loss</label>
              <input 
                type="number" 
                step="0.01" 
                value={form.stop_loss || ""} 
                onChange={e => setForm(p => ({...p, stop_loss: e.target.value}))} 
                style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#e0e0e0", borderRadius: 8 }} 
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Take Profit</label>
              <input 
                type="number" 
                step="0.01" 
                value={form.take_profit || ""} 
                onChange={e => setForm(p => ({...p, take_profit: e.target.value}))} 
                style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#e0e0e0", borderRadius: 8 }} 
              />
            </div>
          </div>

          {/* RISK : REWARD */}
          <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: C.muted }}>
            Risk : Reward — {riskReward}
          </div>

          {/* COMMISSIONS & FEES */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Commissions</label>
              <input 
                type="number" 
                step="0.01" 
                value={form.commissions || ""} 
                onChange={e => setForm(p => ({...p, commissions: e.target.value}))} 
                style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#e0e0e0", borderRadius: 8 }} 
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, color: "#ffffff" }}>Fees</label>
              <input 
                type="number" 
                step="0.01" 
                value={form.fees || ""} 
                onChange={e => setForm(p => ({...p, fees: e.target.value}))} 
                style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#e0e0e0", borderRadius: 8 }} 
              />
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





      {/* POST-TRADE STAGE - Enhanced Reflection */}
      {stage === "post-trade" && (
        <Card>
          <h3>3. Post-Trade Reflection</h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

            {/* Left Column - Sliders */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              <div>
                <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>
                  Pre-Trade Confidence: <span style={{ color: C.blue }}>{form.confidence_level || 5}/10</span>
                </label>
                <input type="range" min="1" max="10" value={form.confidence_level || 5} onChange={e => setForm(p => ({...p, confidence_level: +e.target.value}))} style={{width:"100%", accentColor: C.blue}} />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>
                  Focus Level: <span style={{ color: C.blue }}>{form.focus_level || 5}/10</span>
                </label>
                <input type="range" min="1" max="10" value={form.focus_level || 5} onChange={e => setForm(p => ({...p, focus_level: +e.target.value}))} style={{width:"100%", accentColor: C.blue}} />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>
                  Rule Adherence: <span style={{ color: C.blue }}>{form.rule_adherence || 5}/10</span>
                </label>
                <input type="range" min="1" max="10" value={form.rule_adherence || 5} onChange={e => setForm(p => ({...p, rule_adherence: +e.target.value}))} style={{width:"100%", accentColor: C.blue}} />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>
                  Impulsiveness: <span style={{ color: C.red }}>{form.impulsiveness || 5}/10</span>
                </label>
                <input type="range" min="1" max="10" value={form.impulsiveness || 5} onChange={e => setForm(p => ({...p, impulsiveness: +e.target.value}))} style={{width:"100%", accentColor: C.red}} />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>
                  Energy Level: <span style={{ color: C.yellow }}>{form.energy_level || 5}/10</span>
                </label>
                <input type="range" min="1" max="10" value={form.energy_level || 5} onChange={e => setForm(p => ({...p, energy_level: +e.target.value}))} style={{width:"100%", accentColor: C.yellow}} />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>
                  Market Context Awareness: <span style={{ color: C.blue }}>{form.market_context || 5}/10</span>
                </label>
                <input type="range" min="1" max="10" value={form.market_context || 5} onChange={e => setForm(p => ({...p, market_context: +e.target.value}))} style={{width:"100%", accentColor: C.blue}} />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>
                  Trade Outcome Satisfaction: <span style={{ color: C.green }}>{form.outcome_satisfaction || 5}/10</span>
                </label>
                <input type="range" min="1" max="10" value={form.outcome_satisfaction || 5} onChange={e => setForm(p => ({...p, outcome_satisfaction: +e.target.value}))} style={{width:"100%", accentColor: C.green}} />
              </div>

              {/* Fear & Greed Sliders */}
              <div>
                <label style={{ display: "block", marginBottom: 8, color: C.red, fontWeight: 600 }}>
                  Fear Level: {postTradeForm.fear_level || 5}/10
                </label>
                <input type="range" min="1" max="10" value={postTradeForm.fear_level || 5} onChange={e => setPostTradeForm(p => ({...p, fear_level: +e.target.value}))} style={{width:"100%", accentColor: C.red}} />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 8, color: C.green, fontWeight: 600 }}>
                  Greed Level: {postTradeForm.greed_level || 5}/10
                </label>
                <input type="range" min="1" max="10" value={postTradeForm.greed_level || 5} onChange={e => setPostTradeForm(p => ({...p, greed_level: +e.target.value}))} style={{width:"100%", accentColor: C.green}} />
              </div>
            </div>

            {/* Right Column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              <div>
                <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>Pre-Trade Emotional State</label>
                <select value={form.mental_state || ""} onChange={e => setForm(p => ({...p, mental_state: e.target.value}))} style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#ffffff", borderRadius: 8 }}>
                  <option value="">Select...</option>
                  <option value="Calm">Calm & Focused</option>
                  <option value="Anxious">Anxious / Hesitant</option>
                  <option value="Excited">Excited / Eager</option>
                  <option value="Frustrated">Frustrated / Tilted</option>
                  <option value="Overconfident">Overconfident</option>
                  <option value="Tired">Tired / Low Energy</option>
                  <option value="FOMO">FOMO</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>Exit Reason</label>
                <select value={postTradeForm.exit_reason || ""} onChange={e => setPostTradeForm(p => ({...p, exit_reason: e.target.value}))} style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#ffffff", borderRadius: 8 }}>
                  <option value="">Select exit reason...</option>
                  <option value="target_hit">Target Hit</option>
                  <option value="stop_hit">Stop Hit</option>
                  <option value="manual_exit">Manual Exit</option>
                  <option value="time_exit">Time Exit</option>
                  <option value="breakeven">Breakeven</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>Post-Trade Emotion</label>
                <select value={postTradeForm.post_trade_emotion || ""} onChange={e => setPostTradeForm(p => ({...p, post_trade_emotion: e.target.value}))} style={{ width: "100%", padding: 14, background: "#1a1d2e", color: "#ffffff", borderRadius: 8 }}>
                  <option value="">Select...</option>
                  <option value="Proud">Proud / Satisfied</option>
                  <option value="Relieved">Relieved</option>
                  <option value="Regretful">Regretful / Disappointed</option>
                  <option value="Angry">Angry at myself</option>
                  <option value="Euphoric">Euphoric (dangerous)</option>
                  <option value="Numb">Numb / Indifferent</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>What did I learn from this trade?</label>
                <textarea 
                  value={postTradeForm.post_trade_reflection} 
                  onChange={e => setPostTradeForm(p => ({...p, post_trade_reflection: e.target.value}))} 
                  placeholder="Key takeaway..." 
                  style={{ width: "100%", minHeight: 90, padding: 14, background: "#1a1d2e", color: "#ffffff", borderRadius: 8 }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 8, color: "#ffffff", fontWeight: 600 }}>What would I do differently next time?</label>
                <textarea 
                  value={postTradeForm.what_to_improve || ""} 
                  onChange={e => setPostTradeForm(p => ({...p, what_to_improve: e.target.value}))} 
                  placeholder="Be specific..." 
                  style={{ width: "100%", minHeight: 90, padding: 14, background: "#1a1d2e", color: "#ffffff", borderRadius: 8 }}
                />
              </div>
            </div>
          </div>

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
// TRADE REVIEW - ROBUST + SMART AI COACHING
// ─────────────────────────────────────────────────────────────
function TradeReview({ trades, setView, accounts = [], currentAccountId, setCurrentAccountId }) {
  const accountTrades = currentAccountId 
    ? trades.filter(t => t.account_id === currentAccountId) 
    : trades;

const sortedTrades = [...accountTrades].sort((a, b) => 
  new Date(b.created_at || b.trade_date) - new Date(a.created_at || a.trade_date)
);
const lastTrade = sortedTrades[0];

//  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState(null);

 useEffect(() => {
  if (!lastTrade) {
    return;
  }

  const generateSmartReview = () => {
      const impulsiveness = lastTrade.impulsiveness || 5;
      const confidence = lastTrade.conviction_level || 5;
      const ruleAdherence = lastTrade.rule_adherence || 5;
      const fear = lastTrade.fear_level || 5;
      const greed = lastTrade.greed_level || 5;

      const isImpulsive = impulsiveness >= 7;
      const lowDiscipline = ruleAdherence <= 6;
      const emotionalTrade = fear >= 7 || greed >= 7;

      setReview({
        disciplineScore: Math.round((ruleAdherence + (10 - impulsiveness) + confidence) / 3),

        emotionalFlags: [
          isImpulsive ? "High Impulsiveness" : null,
          emotionalTrade ? "Elevated Emotion (Fear/Greed)" : null,
          lastTrade.energy_level <= 4 ? "Low Energy Trading" : null
        ].filter(Boolean),

        strengths: [
          ruleAdherence >= 8 ? "Strong Rule Following" : null,
          confidence >= 8 ? "High Conviction Entry" : null,
          lastTrade.outcome_satisfaction >= 8 ? "Satisfied Execution" : null
        ].filter(Boolean),

        mistakes: [
          isImpulsive ? "Impulsive decision making" : null,
          lowDiscipline ? "Rule adherence needs work" : null,
          emotionalTrade ? "Trading while emotionally charged" : null
        ].filter(Boolean),

        improvement: emotionalTrade && isImpulsive 
          ? "High emotion combined with impulsiveness is your biggest risk. Implement a mandatory 60-second pause when fear or greed exceeds 6."
          : lowDiscipline 
          ? "Focus on increasing rule adherence. Consider making your checklist non-negotiable before every entry."
          : "You're showing good awareness. Work on turning 'What would I do differently' insights into repeatable rules.",

        summary: `${lastTrade.direction} ${lastTrade.symbol} trade. ${lastTrade.pnl >= 0 ? "Profitable" : "Loss"}.`,

        patternRecognition: {
          commonPattern: isImpulsive ? "Impulsive entries during emotional states" : "Generally disciplined entries",
          repeatingIssue: emotionalTrade ? "Emotional spikes leading to poor decisions" : "No major repeating issues",
          positivePattern: ruleAdherence >= 8 ? "Strong discipline when rules are followed" : "Room for improvement in consistency",
          recommendation: isImpulsive 
            ? "Add a 'cool-off' rule: If impulsiveness would be high, step away for 2 minutes and re-evaluate."
            : "Continue building on your rule adherence — it's clearly helping your results."
        }
      });

//      setLoading(false);
   };

  generateSmartReview();
}, [lastTrade]);

  if (!lastTrade) return <div style={{ textAlign: "center", padding: 60 }}>No trades logged yet.</div>;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 4 }}>Trade Review + Pattern Recognition</h2>

      {/* ACCOUNT SELECTOR */}
      {accounts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: C.muted, marginBottom: 6, display: "block" }}>Viewing Account</label>
          <select 
            value={currentAccountId || ""} 
            onChange={e => setCurrentAccountId(e.target.value)}
            style={{ width: "100%", padding: 12, background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }}
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name} — {acc.account_type?.toUpperCase()} (${acc.starting_balance})
              </option>
            ))}
          </select>
        </div>
      )}

      <p style={{ color: C.muted, marginBottom: 20 }}>Last trade + behavioral patterns</p>














    <Card style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, color: C.muted }}>{lastTrade.symbol} {lastTrade.direction} • {lastTrade.trade_date}</div>
      <div style={{ fontSize: 36, fontWeight: 800, color: (lastTrade.pnl || 0) >= 0 ? C.green : C.red }}>
        {fmt$(lastTrade.pnl || 0)}
      </div>
    </Card>

    {/* Removed the loading check - directly show review */}
    {review && (
      <>
        <Card>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Discipline Score</div>
            <div style={{ fontSize: 52, fontWeight: 900, color: review.disciplineScore >= 7 ? C.green : C.yellow }}>
              {review.disciplineScore}
            </div>
          </Card>

          {/* Pattern Recognition */}
          <Card glow={C.purple}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>🔍 Pattern Recognition</div>
            <div style={{ lineHeight: 1.8 }}>
              <strong>Common Pattern:</strong> {review.patternRecognition.commonPattern}<br/>
              <strong>Repeating Issue:</strong> {review.patternRecognition.repeatingIssue}<br/>
              <strong>Positive Pattern:</strong> {review.patternRecognition.positivePattern}<br/><br/>
              <strong style={{ color: C.green }}>Recommendation:</strong> {review.patternRecognition.recommendation}
            </div>
          </Card>
  


          {/* Emotional Flags */}
          {review.emotionalFlags?.length > 0 && (
            <Card glow={C.red}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Emotional Flags Detected</div>
              {review.emotionalFlags.map((flag, i) => <div key={i}>• {flag}</div>)}
            </Card>
          )}

          <Card>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>AI Coaching</div>
            <p style={{ lineHeight: 1.7, color: C.text }}>{review.improvement}</p>
          </Card>
        </>
      )}
    </div>
  );
}





// ─────────────────────────────────────────────────────────────
// ANALYTICS - FULL COMPLETE VERSION (Additions Only)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// ANALYTICS - FULL COMPLETE VERSION
// ─────────────────────────────────────────────────────────────
function MonthlyCalendar({ trades = [], account = null, getDailyNote, saveDailyNote, currentAccountId }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayNotes, setDayNotes] = useState({});
  const [editingNote, setEditingNote] = useState(null);

  // Load notes from Supabase when month changes
  useEffect(() => {
    const loadNotesForMonth = async () => {
      const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
      const notes = {};
      
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        const note = await getDailyNote(date, currentAccountId);
        if (note) {
          notes[day] = note.notes;
        }
      }
      
      setDayNotes(notes);
    };
    
    loadNotesForMonth();
  }, [currentMonth, currentAccountId, getDailyNote]);

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  
  // Build day trade map
  const dayTradeMap = {};
  trades.forEach(t => {
    // Use trade_date (actual execution date), fall back to created_at
    const rawDate = t.trade_date || t.created_at?.split("T")[0];
    if (!rawDate) return;
    const tradeDate = new Date(rawDate + (rawDate.includes("T") ? "" : "T00:00:00"));
    if (tradeDate.getMonth() === currentMonth.getMonth() && tradeDate.getFullYear() === currentMonth.getFullYear()) {
      const day = tradeDate.getDate();
      if (!dayTradeMap[day]) dayTradeMap[day] = { trades: [], pnl: 0 };
      dayTradeMap[day].trades.push(t);
      dayTradeMap[day].pnl += (t.pnl || 0);
    }
  });

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));

  const monthName = currentMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const handleSaveNote = async (day, note) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    await saveDailyNote(date, currentAccountId, note);
    setDayNotes(prev => ({ ...prev, [day]: note }));
    setEditingNote(null);
  };

  // Calendar grid
  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={prevMonth} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 14 }}>← Prev</button>
        <SectionTitle>{monthName} Calendar</SectionTitle>
        <button onClick={nextMonth} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 14 }}>Next →</button>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 12 }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
          <div key={day} style={{ textAlign: "center", fontSize: 11, color: C.muted, fontWeight: 600, padding: 8 }}>
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
        {calendarDays.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          
          const dayData = dayTradeMap[day];
          const hasNote = dayNotes[day];
          const pnl = dayData?.pnl || 0;
          const tradeCount = dayData?.trades.length || 0;

          return (
            <div
              key={day}
              onClick={() => setSelectedDay(selectedDay === day ? null : day)}
              style={{
                padding: 10,
                borderRadius: 8,
                background: tradeCount > 0 ? (pnl > 0 ? C.green + "15" : C.red + "15") : C.border + "10",
                border: `1px solid ${tradeCount > 0 ? (pnl > 0 ? C.green : C.red) : C.border}40`,
                cursor: "pointer",
                minHeight: 80,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{day}</div>
              {tradeCount > 0 && (
                <>
                  <div style={{ fontSize: 10, color: C.sub }}>{tradeCount} trade{tradeCount !== 1 ? 's' : ''}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: pnl > 0 ? C.green : C.red }}>
                    {fmt$(pnl)}
                  </div>
                </>
              )}
              {hasNote && <div style={{ fontSize: 12 }}>📝</div>}
              {!hasNote && <div style={{ fontSize: 14, color: C.muted }}>+</div>}
            </div>
          );
        })}
      </div>

      {/* Selected day details */}
      {selectedDay && (
        <div style={{ marginTop: 16, padding: 16, background: C.border + "20", borderRadius: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>
            {new Date(currentMonth.getFullYear(), currentMonth.getMonth(), selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          {dayTradeMap[selectedDay] && (
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: C.muted }}>Trades</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{dayTradeMap[selectedDay].trades.length}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: C.muted }}>P&L</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: dayTradeMap[selectedDay].pnl > 0 ? C.green : C.red }}>
                  {dayTradeMap[selectedDay].pnl > 0 ? "+" : ""}{fmt$(dayTradeMap[selectedDay].pnl)}
                </div>
              </div>
            </div>
          )}

          {/* Daily note */}
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 11, color: C.muted, marginBottom: 6, display: "block" }}>Daily Note:</label>
            {editingNote === selectedDay ? (
              <div style={{ display: "flex", gap: 8 }}>
                <textarea
                  defaultValue={dayNotes[selectedDay] || ""}
                  onChange={(e) => setDayNotes(prev => ({ ...prev, [selectedDay]: e.target.value }))}
                  style={{
                    flex: 1,
                    padding: 8,
                    background: "#1a1d2e",
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    color: C.text,
                    fontSize: 12,
                    minHeight: 60,
                    fontFamily: "monospace"
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button
                    onClick={() => handleSaveNote(selectedDay, dayNotes[selectedDay])}
                    style={{ padding: "6px 12px", background: C.green, color: "#000", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingNote(null)}
                    style={{ padding: "6px 12px", background: C.border, color: C.text, border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setEditingNote(selectedDay)}
                style={{
                  padding: 10,
                  background: C.border + "20",
                  border: `1px dashed ${C.border}`,
                  borderRadius: 6,
                  cursor: "pointer",
                  minHeight: 60,
                  color: dayNotes[selectedDay] ? C.text : C.muted,
                  fontSize: 12,
                  lineHeight: "1.4"
                }}
              >
                {dayNotes[selectedDay] || "+ Add note..."}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function Analytics({ trades, accounts = [], currentAccountId, setCurrentAccountId, getDailyNote, saveDailyNote }) {
  const [dateRange, setDateRange] = useState("all");
  const [tab, setTab] = useState("overview");

  const selectedAccount = Array.isArray(accounts) 
    ? accounts.find(a => a.id === currentAccountId) 
    : null;

  // Date filtering
  const filteredTrades = useMemo(() => {
    if (!dateRange || dateRange === "all") return trades;

    const now = new Date();
    let cutoff = new Date();

    if (dateRange === "30d") cutoff.setDate(now.getDate() - 30);
    else if (dateRange === "90d") cutoff.setDate(now.getDate() - 90);
    else if (dateRange === "6m") cutoff.setMonth(now.getMonth() - 6);

    return trades.filter(t => new Date(t.trade_date) >= cutoff);
  }, [trades, dateRange]);

  const accountTrades = currentAccountId 
    ? filteredTrades.filter(t => t.account_id === currentAccountId) 
    : filteredTrades;

  const analytics = useMemo(() => buildAnalytics(accountTrades), [accountTrades]);

  // Monthly Breakdown
  const monthlyData = useMemo(() => {
    const byMonth = {};
    accountTrades.forEach(t => {
      const monthKey = t.trade_date ? t.trade_date.slice(0, 7) : "Unknown";
      if (!byMonth[monthKey]) byMonth[monthKey] = { pnl: 0, trades: 0, wins: 0 };
      byMonth[monthKey].pnl += t.pnl || 0;
      byMonth[monthKey].trades++;
      if (t.result === "Win") byMonth[monthKey].wins++;
    });

    return Object.entries(byMonth)
      .map(([month, data]) => ({
        month,
        pnl: data.pnl,
        trades: data.trades,
        winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 100) : 0
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [accountTrades]);

  if (!analytics) {
    return (
      <div style={{ textAlign: "center", padding: 80, color: C.muted }}>
        Log some trades to unlock analytics.
      </div>
    );
  }

  // Psychology Stats
  const psych = {
    avgConfidence: (accountTrades.reduce((s, t) => s + (t.conviction_level || 5), 0) / (accountTrades.length || 1)).toFixed(1),
    avgFocus: (accountTrades.reduce((s, t) => s + (t.focus_level || 5), 0) / (accountTrades.length || 1)).toFixed(1),
    avgRuleAdherence: (accountTrades.reduce((s, t) => s + (t.rule_adherence || 5), 0) / (accountTrades.length || 1)).toFixed(1),
    avgImpulsiveness: (accountTrades.reduce((s, t) => s + (t.impulsiveness || 5), 0) / (accountTrades.length || 1)).toFixed(1),
    avgEnergy: (accountTrades.reduce((s, t) => s + (t.energy_level || 5), 0) / (accountTrades.length || 1)).toFixed(1),
    avgMarketContext: (accountTrades.reduce((s, t) => s + (t.market_context || 5), 0) / (accountTrades.length || 1)).toFixed(1),
    avgOutcomeSatisfaction: (accountTrades.reduce((s, t) => s + (t.outcome_satisfaction || 5), 0) / (accountTrades.length || 1)).toFixed(1),
  };

  return (
    <div>
      {/* ACCOUNT + DATE RANGE SELECTOR */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {accounts.length > 0 && (
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontSize: 12, color: C.muted, marginBottom: 6, display: "block" }}>Viewing Account</label>
            <select 
              value={currentAccountId || ""} 
              onChange={e => setCurrentAccountId(e.target.value)}
              style={{ width: "100%", padding: 12, background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }}
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} — {acc.account_type?.toUpperCase()} (${acc.starting_balance})
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ fontSize: 12, color: C.muted, marginBottom: 6, display: "block" }}>Date Range</label>
          <select 
            value={dateRange} 
            onChange={e => setDateRange(e.target.value)}
            style={{ width: "100%", padding: 12, background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }}
          >
            <option value="all">All Time</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="6m">Last 6 Months</option>
          </select>
        </div>
      </div>

      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>Analytics Dashboard</h2>
      <p style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>
        {analytics.total} trades • {dateRange === "all" ? "All Time" : dateRange}
      </p>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: 4, background: "#0b0d19", border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, marginBottom: 24, overflowX: "auto" }}>
        {[
          ["overview", "Overview"],
          ["psychology", "Psychology"],
          ["charts", "Charts"],
          ["heatmap", "Heatmaps"],
          ["setups", "By Setup"],
          ["insights", "AI Insights"],
          ["behavior", "Behavior"],
          ["discipline", "Discipline"],
          ["monthly", "Monthly Review"],
          ["confluence", "Confluence"]
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{
              flex: 1, minWidth: 80, padding: "10px", borderRadius: 8, border: "none",
              background: tab === id ? C.panel : "transparent",
              color: tab === id ? C.text : C.muted,
              fontWeight: tab === id ? 700 : 400
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {[
            ["Total P&L", fmt$(analytics.totalPnl), analytics.totalPnl >= 0 ? C.green : C.red],
            ["Win Rate", fmtPct(analytics.winRate), C.blue],
            ["Profit Factor", analytics.profitFactor.toFixed(2), C.purple],
            ["Avg Win", fmt$(analytics.avgWin), C.green],
            ["Avg Loss", `-$${analytics.avgLoss.toFixed(2)}`, C.red],
            ["Total Trades", analytics.total, C.text],
          ].map(([l, v, c]) => (
            <Card key={l} style={{ padding: 16 }}>
              <div style={{ fontSize: 10, color: C.muted }}>{l}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: c, fontFamily: "monospace", marginTop: 8 }}>{v}</div>
            </Card>
          ))}
        </div>
      )}

      {/* PSYCHOLOGY TAB - DISTINCT FROM CONFLUENCE */}
      {tab === "psychology" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 1. Psychology Trend Over Time */}
          <Card>
            <SectionTitle>Psychology Trend Over Time (Last 90 Days)</SectionTitle>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={accountTrades.slice(-30).reverse().map((t, i) => ({
                date: t.trade_date?.slice(5) || "",
                confidence: t.conviction_level || 5,
                focus: t.focus_level || 5,
                ruleAdherence: t.rule_adherence || 5,
                impulsiveness: t.impulsiveness || 5,
              })).reverse()}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.muted }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: C.muted }} />
                <Tooltip />
                <Line type="monotone" dataKey="confidence" stroke="#60a5fa" strokeWidth={2} name="Confidence" />
                <Line type="monotone" dataKey="focus" stroke="#34d399" strokeWidth={2} name="Focus" />
                <Line type="monotone" dataKey="ruleAdherence" stroke="#a78bfa" strokeWidth={2} name="Rule Adherence" />
                <Line type="monotone" dataKey="impulsiveness" stroke="#f87171" strokeWidth={2} name="Impulsiveness" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* 2. Strengths vs Weaknesses Radar */}
          <Card>
            <SectionTitle>Strengths vs Weaknesses Radar</SectionTitle>
            <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
              {/* Simple visual bar version for now - radar chart would require recharts RadarChart */}
              <div style={{ width: "100%", maxWidth: 420 }}>
                {[
                  ["Confidence", psych.avgConfidence, C.blue],
                  ["Focus", psych.avgFocus, C.blue],
                  ["Rule Adherence", psych.avgRuleAdherence, C.green],
                  ["Energy", psych.avgEnergy, C.yellow],
                  ["Market Context", psych.avgMarketContext, C.blue],
                  ["Impulsiveness", psych.avgImpulsiveness, C.red],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span>{label}</span>
                      <span style={{ color }}>{value}/10</span>
                    </div>
                    <div style={{ height: 8, background: "#1a1d2e", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${(value / 10) * 100}%`, height: "100%", background: color, borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* 3. Mental State Impact - Improved */}
          <Card>
            <SectionTitle>Mental State Impact</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.entries(
                accountTrades.reduce((acc, t) => {
                  const state = t.mental_state || "Unknown";
                  if (!acc[state]) acc[state] = { pnl: 0, wins: 0, total: 0 };
                  acc[state].pnl += t.pnl || 0;
                  acc[state].total++;
                  if (t.result === "Win") acc[state].wins++;
                  return acc;
                }, {})
              )
                .sort((a, b) => b[1].total - a[1].total)
                .map(([state, data]) => {
                  const avgPnL = data.total > 0 ? data.pnl / data.total : 0;
                  const winRate = data.total > 0 ? Math.round((data.wins / data.total) * 100) : 0;
                  const isSmallSample = data.total < 5;
                  const isHighRisk = state.toLowerCase().includes("fomo") || state.toLowerCase().includes("anxious");

                  return (
                    <div key={state} style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center", 
                      padding: "14px 16px", 
                      background: "#1a1d2e", 
                      borderRadius: 10,
                      border: isHighRisk ? `1px solid ${C.red}40` : "none"
                    }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{state}</div>
                        <div style={{ fontSize: 12, color: C.muted }}>
                          {data.total} trades • {winRate}% win rate
                          {isSmallSample && " (small sample)"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ 
                          color: avgPnL >= 0 ? C.green : C.red, 
                          fontWeight: 700, 
                          fontSize: 15 
                        }}>
                          {avgPnL >= 0 ? "+" : ""}{fmt$(avgPnL)}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted }}>avg P&L</div>
                        {isHighRisk && <div style={{ color: C.red, fontSize: 11 }}>⚠️ High Risk State</div>}
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>




          {/* 4. Rule Adherence Deep Dive */}
          <Card>
            <SectionTitle>Rule Adherence Deep Dive</SectionTitle>
            <div style={{ padding: 20, background: "#1a1d2e", borderRadius: 12, textAlign: "center" }}>
              <div style={{ fontSize: 42, fontWeight: 700, color: C.green }}>
                {psych.avgRuleAdherence}/10
              </div>
              <p style={{ margin: "12px 0" }}>Average Rule Adherence Score</p>
              <p style={{ color: C.muted }}>
                {psych.avgRuleAdherence >= 7 ? "Strong discipline — this is one of your best traits." : 
                 psych.avgRuleAdherence >= 5 ? "Average — room to tighten rules." : 
                 "Needs major improvement — rule breaks are costing you."}
              </p>
            </div>
          </Card>

          {/* 5. Personal Growth Score */}
          <Card>
            <SectionTitle>Personal Growth Score</SectionTitle>
            <div style={{ padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: 48, fontWeight: 800, color: C.green }}>
                {((parseFloat(psych.avgConfidence) + parseFloat(psych.avgFocus) + parseFloat(psych.avgRuleAdherence)) / 3).toFixed(1)}
              </div>
              <p style={{ color: C.muted }}>Overall Psychology Quality (last 30 trades)</p>
              <div style={{ marginTop: 16, color: C.text }}>
                Keep tracking these metrics — consistent improvement here is the fastest way to long-term profitability.
              </div>
            </div>
          </Card>
        </div>
      )}





            {/* IMPROVED CHARTS SECTION */}
      {tab === "charts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 1. Equity Curve with Drawdown */}
          <Card>
            <SectionTitle>Equity Curve + Drawdown</SectionTitle>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={analytics.equityCurve}>
                <defs>
                  <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.green} stopOpacity={0.35}/>
                    <stop offset="95%" stopColor={C.green} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={C.green} strokeWidth={3} fill="url(#colorEquity)" />
                <Tooltip formatter={v => [fmt$(v), "Equity"]} />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 11, color: C.muted, textAlign: "center", marginTop: 8 }}>
              Green line = Equity • Shaded area = Drawdown from peak
            </div>
          </Card>

          {/* 2. Monthly P&L Bar Chart */}
          <Card>
            <SectionTitle>Monthly P&L</SectionTitle>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyData}>
                <XAxis dataKey="month" tick={{ fill: C.muted, fontSize: 11 }} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} />
                <Tooltip formatter={v => [fmt$(v), "P&L"]} />
                <Bar dataKey="pnl" fill={C.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

        
         
        </div>
      )}

      {/* HEATMAP */}
      {tab === "heatmap" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* TIME-OF-DAY HEATMAP */}
          <Card>
            <SectionTitle>Time-of-Day Heatmap</SectionTitle>
            {analytics.heatmap.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 40 }}>Not enough trade time data yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {analytics.heatmap.map(h => (
                  <div key={h.slot} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 55, fontSize: 11, color: C.sub, fontFamily: "monospace", flexShrink: 0 }}>{h.slot}</div>
                    <div style={{ flex: 1, height: 28, borderRadius: 6, background: C.border, overflow: "hidden", position: "relative" }}>
                      <div style={{ height: "100%", width: `${h.wr * 100}%`, background: `linear-gradient(90deg, ${h.wr > 0.6 ? C.green : C.yellow}, ${h.wr > 0.6 ? C.green : C.yellow}88)`, borderRadius: 6 }} />
                    </div>
                    <div style={{ width: 45, fontSize: 12, fontWeight: 700, color: h.wr > 0.6 ? C.green : C.yellow, textAlign: "right" }}>{Math.round(h.wr * 100)}%</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* MONTHLY CALENDAR */}
          <MonthlyCalendar trades={accountTrades} getDailyNote={getDailyNote} saveDailyNote={saveDailyNote} currentAccountId={currentAccountId} />

          {/* BEHAVIOR ANALYTICS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            {/* Conviction vs Win Rate */}
            <Card>
              <SectionTitle>Conviction vs Win Rate</SectionTitle>
              <div style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <XAxis type="number" dataKey="confidence" name="Confidence Level" stroke={C.muted} />
                    <YAxis type="number" dataKey="result" name="Result (1=Win, 0=Loss)" stroke={C.muted} />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                    <Scatter name="Trades" data={accountTrades.map(t => ({ confidence: t.conviction_level || 5, result: t.result === "Win" ? 1 : 0, pnl: t.pnl }))} fill={C.blue} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Emotional State Distribution */}
            <Card>
              <SectionTitle>Emotional State Distribution</SectionTitle>
              <div style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={[
                    { emotional_state: "Calm", value: accountTrades.filter(t => t.emotional_state === "Calm").length },
                    { emotional_state: "Focused", value: accountTrades.filter(t => t.emotional_state === "Focused").length },
                    { emotional_state: "Excited", value: accountTrades.filter(t => t.emotional_state === "Excited").length },
                    { emotional_state: "Anxious", value: accountTrades.filter(t => t.emotional_state === "Anxious").length },
                    { emotional_state: "Frustrated", value: accountTrades.filter(t => t.emotional_state === "Frustrated").length },
                  ]}>
                    <PolarGrid stroke={C.border} />
                    <PolarAngleAxis dataKey="emotional_state" stroke={C.muted} />
                    <PolarRadiusAxis stroke={C.muted} />
                    <Radar name="Trades" dataKey="value" stroke={C.blue} fill={C.blue} fillOpacity={0.6} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* PSYCHOLOGY SUMMARY */}
          <Card>
            <SectionTitle>Weekly Psychology Summary</SectionTitle>
            {(() => {
              const calmTrades = accountTrades.filter(t => t.emotional_state === "Calm");
              const focusedTrades = accountTrades.filter(t => t.emotional_state === "Focused");
              const bestState = calmTrades.length > focusedTrades.length ? "Calm" : "Focused";
              const bestTrades = bestState === "Calm" ? calmTrades : focusedTrades;
              const bestWR = bestTrades.length > 0 ? (bestTrades.filter(t => t.result === "Win").length / bestTrades.length * 100).toFixed(1) : 0;
              const bestPnL = bestTrades.reduce((s, t) => s + (t.pnl || 0), 0);
              
              return (
                <div style={{ padding: 16, background: C.green + "10", border: `1px solid ${C.green}30`, borderRadius: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.green, marginBottom: 8 }}>
                    🎯 You traded best when {bestState} & Focused
                  </div>
                  <div style={{ fontSize: 13, color: C.text }}>
                    Win Rate: <strong>{bestWR}%</strong> • Avg P&L: <strong>{fmt$(bestPnL / (bestTrades.length || 1))}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: C.sub, marginTop: 8 }}>
                    {bestTrades.length} trades analyzed • Based on last 7 days
                  </div>
                </div>
              );
            })()}
          </Card>
        </div>
      )}

      {/* BY SETUP */}
      {tab === "setups" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            {analytics.setupData.length > 0 && analytics.setupData
              .sort((a, b) => b.winRate - a.winRate)
              .slice(0, 4)
              .map((d, i) => (
                <Card key={i} style={{ padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: C.muted }}>{d.setup}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: d.winRate >= 65 ? C.green : C.yellow, margin: "8px 0" }}>
                    {d.winRate}%
                  </div>
                  <div style={{ fontSize: 12, color: C.sub }}>{d.total} trades • {fmt$(d.pnl)}</div>
                </Card>
              ))}
          </div>

          <Card>
            <SectionTitle>Setup Performance Breakdown</SectionTitle>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                    <th style={{ padding: "12px 10px", textAlign: "left", color: C.muted }}>Setup</th>
                    <th style={{ padding: "12px 10px", textAlign: "center", color: C.muted }}>Win Rate</th>
                    <th style={{ padding: "12px 10px", textAlign: "center", color: C.muted }}>Expectancy</th>
                    <th style={{ padding: "12px 10px", textAlign: "center", color: C.muted }}>Avg R-Multiple</th>
                    <th style={{ padding: "12px 10px", textAlign: "center", color: C.muted }}>Total P&L</th>
                    <th style={{ padding: "12px 10px", textAlign: "center", color: C.muted }}>Avg Confidence</th>
                    <th style={{ padding: "12px 10px", textAlign: "center", color: C.muted }}>Avg Impulsiveness</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.setupData
                    .sort((a, b) => b.winRate - a.winRate)
                    .map((d, i) => {
                      const setupTrades = trades.filter(t => (t.setup_type || t.entry_signal) === d.setup);
                      const avgConfidence = setupTrades.reduce((s, t) => s + (t.conviction_level || 5), 0) / (setupTrades.length || 1);
                      const avgImpulsiveness = setupTrades.reduce((s, t) => s + (t.impulsiveness || 5), 0) / (setupTrades.length || 1);
                      const expectancy = d.total > 0 ? d.pnl / d.total : 0;

                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}20` }}>
                          <td style={{ padding: "12px 10px", fontWeight: 600 }}>{d.setup}</td>
                          <td style={{ padding: "12px 10px", textAlign: "center", color: d.winRate >= 65 ? C.green : C.yellow, fontWeight: 700 }}>
                            {d.winRate}%
                          </td>
                          <td style={{ padding: "12px 10px", textAlign: "center", fontFamily: "monospace" }}>{fmt$(expectancy)}</td>
                          <td style={{ padding: "12px 10px", textAlign: "center", fontFamily: "monospace" }}>{d.avgRMultiple ? d.avgRMultiple.toFixed(2) : "—"}</td>
                          <td style={{ padding: "12px 10px", textAlign: "center" }}><Pill value={d.pnl} /></td>
                          <td style={{ padding: "12px 10px", textAlign: "center", color: avgConfidence >= 7 ? C.green : C.yellow }}>{avgConfidence.toFixed(1)}</td>
                          <td style={{ padding: "12px 10px", textAlign: "center", color: avgImpulsiveness >= 7 ? C.red : C.yellow }}>{avgImpulsiveness.toFixed(1)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card glow={C.purple}>
            <SectionTitle>AI Setup Recommendation</SectionTitle>
            <p style={{ lineHeight: 1.6, color: C.text }}>
              Focus on setups with <strong>high confidence (≥8)</strong> and strong R-Multiples. 
              These show the best long-term edge and lowest impulsiveness.
            </p>
          </Card>
        </div>
      )}

      {/* AI INSIGHTS */}
            {/* IMPROVED AI INSIGHTS */}
      



      {/* HIGHLY DYNAMIC AI INSIGHTS */}
      {tab === "insights" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card glow={C.purple}>
            <SectionTitle>🧠 Your Personalized AI Coach</SectionTitle>

            {accountTrades.length < 15 ? (
              <p style={{ color: C.muted, padding: 40, textAlign: "center" }}>
                Log at least 15 trades for personalized insights and coaching.
              </p>
            ) : (
              <div style={{ lineHeight: 1.8, fontSize: 15 }}>
                <p>Your overall win rate is <strong>{Math.round(analytics.winRate * 100)}%</strong>. Here's what stands out from your data:</p>

                <ul style={{ paddingLeft: 20, margin: "16px 0" }}>
                  {psych.avgImpulsiveness > 6.5 && (
                    <li>
                      <strong>Impulsiveness Leak:</strong> Your win rate drops to <strong>{
                        Math.round(
                          accountTrades.filter(t => (t.impulsiveness || 5) >= 7 && t.result === "Win").length /
                          accountTrades.filter(t => (t.impulsiveness || 5) >= 7).length * 100 || 0
                        )
                      }%</strong> when impulsiveness is high. 
                      <strong> Rule to add:</strong> 90-second pause before every entry.
                    </li>
                  )}

                  {psych.avgConfidence >= 7 && (
                    <li>
                      <strong>Conviction Edge:</strong> High confidence trades (≥8) win at <strong>{
                        Math.round(
                          accountTrades.filter(t => (t.conviction_level || 0) >= 8 && t.result === "Win").length /
                          accountTrades.filter(t => (t.conviction_level || 0) >= 8).length * 100
                        )
                      }%</strong>. Keep prioritizing these.
                    </li>
                  )}

                  {psych.avgFocus < 6.5 && (
                    <li>
                      <strong>Focus is a major leak.</strong> Consider trading only during your peak mental hours.
                    </li>
                  )}

                  {(psych.avgFear || 5) > 6 && (
                    <li>
                      High fear trades are underperforming. Work on reducing emotional entries.
                    </li>
                  )}

                  {(psych.avgGreed || 5) > 6 && (
                    <li>
                      Greed is causing you to hold losers too long. Tighten your exit rules.
                    </li>
                  )}
                </ul>

                <div style={{ marginTop: 24, padding: 16, background: "#1a1d2e", borderRadius: 12, border: `1px solid ${C.purple}30` }}>
                  <strong>Top Recommendation This Week:</strong><br />
                  {psych.avgImpulsiveness > 6.5 
                    ? "Focus heavily on reducing impulsive entries. Use a mandatory pause rule."
                    : psych.avgFocus < 6.5 
                    ? "Only take trades when your Focus Level is 7 or higher."
                    : "Continue building on high-conviction, high-focus setups — this is your edge."}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}








      {/* BEHAVIOR */}
      {tab === "behavior" && <BehaviorAnalytics trades={accountTrades} accounts={accounts} currentAccountId={currentAccountId} setCurrentAccountId={setCurrentAccountId} />}

      {/* MONTHLY PERFORMANCE REVIEW */}
      {tab === "monthly" && (
        <Card>
          <SectionTitle>Monthly Performance Review</SectionTitle>
          {monthlyData.length === 0 ? (
            <p style={{ color: C.muted, textAlign: "center", padding: 40 }}>No monthly data yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                    <th style={{ padding: "12px 10px", textAlign: "left" }}>Month</th>
                    <th style={{ padding: "12px 10px", textAlign: "center" }}>Trades</th>
                    <th style={{ padding: "12px 10px", textAlign: "center" }}>Win Rate</th>
                    <th style={{ padding: "12px 10px", textAlign: "center" }}>P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((m, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}20` }}>
                      <td style={{ padding: "12px 10px", fontWeight: 600 }}>{m.month}</td>
                      <td style={{ padding: "12px 10px", textAlign: "center" }}>{m.trades}</td>
                      <td style={{ padding: "12px 10px", textAlign: "center", color: m.winRate >= 60 ? C.green : C.yellow }}>
                        {m.winRate}%
                      </td>
                      <td style={{ padding: "12px 10px", textAlign: "center" }}>
                        <Pill value={m.pnl} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}



{/* CONFLUENCE & CHECKLIST - REAL IMPLEMENTATION */}
      {tab === "confluence" && (
        <Card>
          <SectionTitle>Confluence & Checklist Analysis</SectionTitle>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
            {/* Psychology Summary */}
            <div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Psychology Summary</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  ["Confidence", psych.avgConfidence, C.blue],
                  ["Focus", psych.avgFocus, C.blue],
                  ["Rule Adherence", psych.avgRuleAdherence, C.green],
                  ["Impulsiveness", psych.avgImpulsiveness, C.red],
                  ["Energy", psych.avgEnergy, C.yellow],
                  ["Market Context", psych.avgMarketContext, C.blue],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ background: "#1a1d2e", padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: C.muted }}>{label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}/10</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Win Rate by Emotional State */}
            <div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Win Rate by Pre-Trade Emotion</div>
              {accountTrades.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {Object.entries(
                    accountTrades.reduce((acc, t) => {
                      const state = t.mental_state || "Unknown";
                      if (!acc[state]) acc[state] = { wins: 0, total: 0 };
                      acc[state].total++;
                      if (t.result === "Win") acc[state].wins++;
                      return acc;
                    }, {})
                  ).map(([state, data]) => (
                    <div key={state} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#1a1d2e", borderRadius: 8 }}>
                      <span>{state}</span>
                      <span style={{ color: (data.wins / data.total) >= 0.6 ? C.green : C.yellow }}>
                        {data.total > 0 ? Math.round((data.wins / data.total) * 100) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: C.muted }}>No data yet</p>
              )}
            </div>
          </div>

          {/* Fear & Greed */}
          <Card style={{ marginTop: 16 }}>
            <SectionTitle>Win Rate by Fear & Greed</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <div style={{ color: C.red, marginBottom: 8 }}>High Fear (≥7)</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: C.red }}>
                  {accountTrades.filter(t => (t.fear_level || 0) >= 7).length > 0
                    ? Math.round(
                        accountTrades.filter(t => (t.fear_level || 0) >= 7 && t.result === "Win").length /
                        accountTrades.filter(t => (t.fear_level || 0) >= 7).length * 100
                      )
                    : 0}%
                </div>
              </div>
              <div>
                <div style={{ color: C.green, marginBottom: 8 }}>High Greed (≥7)</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: C.green }}>
                  {accountTrades.filter(t => (t.greed_level || 0) >= 7).length > 0
                    ? Math.round(
                        accountTrades.filter(t => (t.greed_level || 0) >= 7 && t.result === "Win").length /
                        accountTrades.filter(t => (t.greed_level || 0) >= 7).length * 100
                      )
                    : 0}%
                </div>
              </div>
            </div>
          </Card>

          {/* Confidence & Focus Correlation */}
          <Card style={{ marginTop: 16 }}>
            <SectionTitle>Confidence & Focus Correlation</SectionTitle>
            <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center", gap: 20 }}>
              <div>
                <div style={{ fontSize: 13, color: C.muted }}>High Confidence (≥8)</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: C.green }}>
                  {accountTrades.filter(t => (t.conviction_level || 0) >= 8).length > 0
                    ? Math.round(
                        accountTrades.filter(t => (t.conviction_level || 0) >= 8 && t.result === "Win").length /
                        accountTrades.filter(t => (t.conviction_level || 0) >= 8).length * 100
                      )
                    : 0}%
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: C.muted }}>High Focus (≥8)</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: C.green }}>
                  {accountTrades.filter(t => (t.focus_level || 0) >= 8).length > 0
                    ? Math.round(
                        accountTrades.filter(t => (t.focus_level || 0) >= 8 && t.result === "Win").length /
                        accountTrades.filter(t => (t.focus_level || 0) >= 8).length * 100
                      )
                    : 0}%
                </div>
              </div>
            </div>
          </Card>

          {/* AI COACH BOX */}
          <Card glow={C.purple} style={{ marginTop: 24 }}>
            <SectionTitle>🧠 AI Coach Interpretation</SectionTitle>
            <div style={{ lineHeight: 1.7, color: C.text }}>
              {accountTrades.length > 0 ? (
                <>
                  Your best trades happen when <strong>Confidence and Focus are both high</strong>. 
                  Trading with high Fear or Greed significantly lowers your win rate.
                  <br /><br />
                  <strong>Recommendation:</strong> Only take trades when Confidence ≥ 8, Focus ≥ 8, and Fear ≤ 5. 
                  This combination has shown the strongest edge in your data.
                </>
              ) : (
                "Log more trades to get personalized coaching insights."
              )}
            </div>
          </Card>
        </Card>
      )}

      {/* DISCIPLINE */}
      {tab === "discipline" && (
        <DisciplineAnalytics trades={accountTrades} setView={() => {}} accounts={accounts} currentAccountId={currentAccountId} setCurrentAccountId={setCurrentAccountId} />
      )}
    </div>
  );
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
// ─────────────────────────────────────────────────────────────
// TRADE LOG WITH ACCOUNT FILTERING
// ─────────────────────────────────────────────────────────────
function TradeLog({ 
  trades, 
  deleteTrade, 
  updateTrade, 
  setView, 
  openTradeReview,
  accounts = [],
  currentAccountId,
  setCurrentAccountId
}) {
  const [filter, setFilter] = useState("all");

  // Filter by selected account
  const accountTrades = currentAccountId 
    ? trades.filter(t => t.account_id === currentAccountId) 
    : trades;

  // Sort by trade_date (actual execution date), newest first
  const sortedAccountTrades = [...accountTrades].sort((a, b) => {
    const dA = a.trade_date || a.created_at?.split("T")[0] || "";
    const dB = b.trade_date || b.created_at?.split("T")[0] || "";
    return dB.localeCompare(dA);
  });

  const filtered = filter === "all"
    ? sortedAccountTrades
    : sortedAccountTrades.filter(t =>
        (filter === "Win" || filter === "Loss") ? t.result === filter
        : (t.setup_type === filter || t.entry_signal === filter)
      );

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>Trade Journal</h2>
      <p style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>{filtered.length} trades logged</p>

      {/* ACCOUNT SELECTOR */}
      {accounts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: C.muted, marginBottom: 6, display: "block" }}>Viewing Account</label>
          <select 
            value={currentAccountId || ""} 
            onChange={e => setCurrentAccountId(e.target.value)}
            style={{ width: "100%", padding: 12, background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }}
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name} — {acc.account_type?.toUpperCase()} (${acc.starting_balance})
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", "Win", "Loss"].map(f => (
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
                  {/* Your existing table row content */}
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
                        if (window.confirm('Delete this trade permanently?')) deleteTrade(t.id); 
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
// PASSWORD RESET FORM (Forgot Password Flow)
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
        body: JSON.stringify({ email: email.trim() })
      });

      const data = await res.json();

      if (res.ok || data?.user) {
        setResetSent(true);
      } else {
        setLocalError(data?.error_description || data?.error || "Failed to send reset link");
      }
    } catch (err) {
      setLocalError("Connection error. Please try again.");
      console.error(err);
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
              <p style={{ color: C.sub, fontSize: 13, lineHeight: 1.6 }}>
                Click the link in your email to set a new password.<br />
                The link expires in 24 hours.
              </p>
              <p style={{ color: C.muted, fontSize: 12, marginTop: 20 }}>
                Not seeing it? Check your spam folder.
              </p>
            </div>

            <button 
              onClick={onBack}
              style={{
                width: "100%",
                padding: 14,
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                color: C.text,
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer"
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
        {/* Header matching your screenshot */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ 
            width: 64, 
            height: 64, 
            background: "linear-gradient(135deg, #22d3ee, #6366f1)", 
            borderRadius: 16, 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            margin: "0 auto 20px",
            boxShadow: "0 10px 30px rgba(34, 211, 238, 0.3)"
          }}>
            📊
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, marginBottom: 8 }}>Reset Password</h1>
          <p style={{ color: C.muted, fontSize: 15 }}>Enter your email to receive a reset link</p>
        </div>

        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleResetPassword()}
                placeholder="pitts_michael@hotmail.com"
                style={{ 
                  width: "100%", 
                  background: "#1a1d2e", 
                  border: `1px solid ${C.border}`, 
                  borderRadius: 10, 
                  padding: "14px 16px", 
                  color: C.text, 
                  fontSize: 16 
                }}
              />
            </div>

            {localError && (
              <div style={{ background: C.red + "15", border: `1px solid ${C.red}30`, borderRadius: 8, padding: "12px 16px", color: "#ff6b6b", fontSize: 14 }}>
                ⚠️ {localError}
              </div>
            )}

            <Btn 
              onClick={handleResetPassword} 
              disabled={authLoading || !email} 
              style={{ width: "100%", padding: "16px", fontSize: 16, background: "linear-gradient(90deg, #22d3ee, #4ade80)" }}
            >
              {authLoading ? "Sending..." : "Send Reset Link →"}
            </Btn>

            <button
              onClick={onBack}
              style={{
                width: "100%",
                padding: 14,
                background: "transparent",
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                color: C.muted,
                fontSize: 15,
                cursor: "pointer"
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

// ─────────────────────────────────────────────────────────────
// RESET PASSWORD PAGE (Handles email reset link click)
// ─────────────────────────────────────────────────────────────
function ResetPasswordPage({ onBack }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");

      if (!accessToken) {
        throw new Error("Invalid or expired reset link.");
      }

      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ password: newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error_description || data.error || "Failed to reset password");
      }

      setSuccess(true);
      setTimeout(() => window.location.href = "/", 1800);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <Card style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 60 }}>🎉</div>
          <h2>Password Reset Successful!</h2>
          <p style={{ color: C.muted }}>Redirecting to login...</p>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, background: `linear-gradient(135deg, ${C.green}, ${C.blue})`, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 32 }}>🔑</div>
          <h2 style={{ fontSize: 24, fontWeight: 800 }}>Set New Password</h2>
        </div>

        <Card>
          <form onSubmit={handleReset}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 8 }}>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: "100%", padding: 14, background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 10, color: C.text }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 8 }}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: "100%", padding: 14, background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 10, color: C.text }}
              />
            </div>

            {error && <div style={{ color: C.red, background: C.red+"15", padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

            <Btn type="submit" disabled={loading} style={{ width: "100%", padding: 14 }}>
              {loading ? "Updating..." : "Update Password →"}
            </Btn>
          </form>

          <button onClick={onBack} style={{ width: "100%", marginTop: 12, padding: 14, background: "none", border: `1px solid ${C.border}`, borderRadius: 10, color: C.muted }}>
            Back to Sign In
          </button>
        </Card>
      </div>
    </div>
  );
}





// ─────────────────────────────────────────────────────────────
// LEGAL DOCUMENT DISPLAY
// ─────────────────────────────────────────────────────────────
function LegalDocument({ title }) {
  const privacyContent = `# Privacy Policy

**Futures OS**
Last Updated: May 10, 2026

---

## 1. Introduction

Futures OS ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our trading journal and analytics platform ("Service").

By using the Service, you agree to the collection and use of information in accordance with this policy. If you do not agree, please discontinue use of the Service.

---

## 2. Information We Collect

### Information You Provide Directly
- **Account Information:** Email address, display name, and password used to create your account.
- **Trade Data:** Trade entries including symbols, entry/exit prices, position sizes, profit and loss figures, dates, and times.
- **Behavioral & Psychological Data:** Self-reported data including emotional state, discipline scores, focus levels, fear and greed ratings, rule adherence scores, and post-trade reflections.
- **Account Settings:** Trading account names, account types, starting balances, maximum drawdown limits, and risk preferences.
- **Custom Strategies:** Strategy names, descriptions, and preferences you create within the Service.
- **Imported Data:** Trade data imported via CSV from brokers such as TopStep, Tradovate, or other supported platforms.

### Information Collected Automatically
- **Usage Data:** Pages visited, features used, session duration, and interaction patterns within the Service.
- **Device Information:** Browser type, operating system, and IP address.
- **Authentication Tokens:** Session tokens used to maintain your logged-in state.

---

## 3. How We Use Your Information

We use the information we collect to:

- **Provide the Service:** Display your trade journal, analytics, discipline scores, and performance metrics.
- **Generate AI-Powered Analysis:** Create personalized daily briefings and coaching insights using anonymized versions of your trade and behavioral data (see Section 6 for details).
- **Persist Your Settings:** Save your preferences, risk limits, custom strategies, and account configurations across sessions.
- **Improve the Service:** Analyze aggregate, anonymized usage patterns to improve features and performance.
- **Communicate With You:** Send transactional emails related to your account (password resets, billing receipts). We do not send marketing emails without your explicit consent.
- **Ensure Security:** Detect and prevent fraudulent or unauthorized access.

---

## 4. Data Storage and Security

- Your data is stored in **Supabase**, a secure cloud database platform. Supabase uses industry-standard encryption (AES-256 at rest, TLS in transit) and is SOC 2 compliant.
- Row-Level Security (RLS) is enforced on all data tables, meaning your data is only accessible to your authenticated account.
- We do not store payment card information. Payment processing is handled by a PCI-compliant third-party processor.
- We retain your data for as long as your account is active. Upon account deletion, your data is permanently removed within 30 days.

---

## 5. Data Sharing and Disclosure

We do not sell your personal data. We do not share your data with advertisers.

We may share your data only in the following limited circumstances:

- **Service Providers:** Third-party vendors who assist us in operating the Service (listed in Section 6), bound by confidentiality agreements.
- **Legal Requirements:** If required by law, court order, or governmental authority.
- **Business Transfer:** If Futures OS is acquired or merges with another company, your data may be transferred as part of that transaction. You will be notified in advance.
- **With Your Consent:** Any other sharing will only occur with your explicit consent.

---

## 6. Third-Party AI Processing (Anthropic Claude)

Futures OS uses **Anthropic's Claude API** to generate personalized AI-powered trade analysis and daily briefings.

**What is sent to Anthropic:**
When you use AI-powered features, a subset of your trade and behavioral data is sent to Anthropic's API for processing. This includes:
- Aggregated trade statistics (win rates, P&L totals, discipline score trends)
- Behavioral pattern summaries (e.g., win rate by mental state, best-performing setups)
- Risk settings (max drawdown, max daily trades)
- Recent trade history (symbols, results, scores — no personally identifying information)

**What is NOT sent to Anthropic:**
- Your name or email address
- Raw account balances or broker credentials
- Payment information

**Anthropic's Data Practices:**
- Anthropic does **not** use API-submitted data to train its models by default.
- Data submitted via the API is subject to Anthropic's Privacy Policy and Usage Policy.
- Anthropic is listed as a **data sub-processor** under this policy.

**Your Control:**
- AI-powered analysis features can be disabled in your account settings.
- When disabled, no data is sent to Anthropic.

---

## 7. Third-Party Sub-Processors

We work with the following third-party sub-processors who may process your data on our behalf:

| Provider | Purpose | Data Processed |
|---|---|---|
| Supabase | Database & Authentication | All user and trade data |
| Anthropic | AI-powered analysis | Anonymized trade patterns |

---

## 8. Your Rights

Depending on your location, you may have the following rights regarding your personal data:

### All Users
- **Access:** Request a copy of the data we hold about you.
- **Correction:** Request correction of inaccurate data.
- **Deletion:** Request deletion of your account and all associated data.
- **Export:** Request an export of your trade data in a portable format (CSV).

### European Union / EEA Users (GDPR)
In addition to the above, you have the right to:
- **Restrict Processing:** Request that we limit how we use your data.
- **Object to Processing:** Object to processing based on legitimate interests.
- **Data Portability:** Receive your data in a structured, machine-readable format.
- **Lodge a Complaint:** With your local data protection authority.

Our legal basis for processing your data is:
- **Contract:** Processing necessary to provide the Service you subscribed to.
- **Legitimate Interest:** Security monitoring and Service improvement.
- **Consent:** AI-powered features and any optional data processing.

### California Users (CCPA)
You have the right to:
- Know what personal information is collected and how it is used.
- Request deletion of your personal information.
- Opt out of the sale of personal information (we do not sell personal information).
- Non-discrimination for exercising your privacy rights.

---

## 9. Cookies and Local Storage

The Service uses browser local storage to maintain your authentication session. We do not use third-party advertising cookies. We may use minimal analytics cookies to understand aggregate usage patterns.

---

## 10. Children's Privacy

The Service is not directed to individuals under the age of 18. We do not knowingly collect personal information from minors. If you believe a minor has provided us with personal information, please contact us and we will delete it promptly.

---

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of material changes by:
- Posting a notice within the Service
- Sending an email to your registered address
- Updating the "Last Updated" date at the top of this policy

Continued use of the Service after changes constitutes acceptance of the updated policy.

---

## 12. Contact Us

If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us at your support email.

For GDPR-related requests, please include "GDPR Request" in the subject line.
For CCPA-related requests, please include "CCPA Request" in the subject line.

We will respond to all requests within 30 days.`;

  const termsContent = `# Terms of Service

**Futures OS**
Last Updated: May 10, 2026

---

## 1. Agreement to Terms

By accessing or using Futures OS ("Service," "we," "our," or "us"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service.

These Terms constitute a legally binding agreement between you ("User," "you," or "your") and Futures OS. Please read them carefully.

---

## 2. Description of Service

Futures OS is a subscription-based trading journal and analytics platform designed to help traders track, analyze, and improve their trading performance. The Service includes:

- Trade journaling and logging tools
- Performance analytics and reporting
- Behavioral and discipline scoring
- AI-powered personalized trade analysis and daily briefings
- Strategy management tools
- Risk management settings and alerts
- CSV trade import from supported brokers

---

## 3. Eligibility

To use the Service, you must:

- Be at least 18 years of age
- Have the legal capacity to enter into a binding agreement
- Not be prohibited from using the Service under applicable law
- Provide accurate and complete registration information

By using the Service, you represent and warrant that you meet all eligibility requirements.

---

## 4. Account Registration and Security

### 4.1 Account Creation
You must create an account to use the Service. You agree to provide accurate, current, and complete information during registration and to keep this information updated.

### 4.2 Account Security
You are responsible for:
- Maintaining the confidentiality of your account credentials
- All activity that occurs under your account
- Notifying us immediately of any unauthorized access

We are not liable for any loss resulting from unauthorized use of your account.

### 4.3 One Account Per User
Each account is for a single individual user. You may not share your account credentials with others or allow others to access the Service through your account.

---

## 5. Subscription and Payment

### 5.1 Subscription Plans
Access to the Service requires a paid subscription.

### 5.2 Billing
- Subscriptions are billed in advance on a recurring basis (monthly or annually, depending on your selected plan)
- You authorize us to charge your payment method on each renewal date
- All fees are in US Dollars unless otherwise stated

### 5.3 Free Trial
If we offer a free trial, it will be described at sign-up. At the end of the trial period, your subscription will automatically convert to a paid plan unless you cancel before the trial ends.

### 5.4 Cancellation
- You may cancel your subscription at any time through your account settings
- Cancellation takes effect at the end of your current billing period
- You retain access to the Service until the end of the paid period
- We do not provide refunds for partial billing periods unless required by law

### 5.5 Refund Policy
- Annual subscriptions cancelled within 14 days of purchase may be eligible for a full refund
- Monthly subscriptions are non-refundable after the billing date
- Refund requests must be submitted to support

### 5.6 Price Changes
We reserve the right to change subscription prices. We will provide at least 30 days advance notice of any price increase. Continued use after the notice period constitutes acceptance of the new pricing.

---

## 6. Acceptable Use

### 6.1 Permitted Use
You may use the Service solely for your personal trading journal and analytics purposes in accordance with these Terms.

### 6.2 Prohibited Use
You agree not to:

- Use the Service for any unlawful purpose or in violation of any regulations
- Share, resell, sublicense, or redistribute access to the Service
- Attempt to reverse engineer, decompile, or extract source code from the Service
- Use automated tools, bots, or scripts to access or scrape the Service
- Introduce malware, viruses, or malicious code
- Attempt to gain unauthorized access to any part of the Service or its infrastructure
- Use the Service to transmit spam or unsolicited communications
- Impersonate any person or entity
- Use the Service in a manner that could damage, disable, or impair it
- Circumvent any access controls or security measures

### 6.3 Account Termination for Violations
We reserve the right to suspend or terminate your account immediately and without notice if you violate these Terms.

---

## 7. Important Disclaimer — Not Financial Advice

**THE SERVICE IS A TRADING JOURNAL AND ANALYTICS TOOL ONLY.**

- Futures OS does **not** provide financial advice, investment advice, trading recommendations, or any form of regulated financial services
- AI-generated analysis and daily briefings are for **informational and educational purposes only** and do not constitute trading recommendations
- Past performance data shown in the Service does not guarantee future results
- Trading futures, options, and other financial instruments involves **substantial risk of loss** and is not suitable for all investors
- You should consult a qualified financial advisor before making any trading or investment decisions
- We are not registered as an investment advisor, broker-dealer, or financial planner with any regulatory authority

**You are solely responsible for your trading decisions and any resulting profits or losses.**

---

## 8. AI-Powered Features

### 8.1 Nature of AI Analysis
The Service includes AI-powered features that generate personalized analysis using your trade data. These features:

- Are powered by Anthropic's Claude AI model
- Use anonymized versions of your trade history and behavioral data
- Generate informational insights, not financial advice
- May occasionally produce inaccurate or incomplete analysis

### 8.2 No Guarantee of Accuracy
AI-generated content is provided "as is." We make no warranty that AI analysis will be accurate, complete, or suitable for any particular purpose. You should independently verify any AI-generated insights before acting on them.

### 8.3 Opt-Out
You may disable AI-powered features at any time in your account settings. When disabled, your data will not be sent to third-party AI processors.

---

## 9. Intellectual Property

### 9.1 Our Property
The Service, including its design, code, features, logos, and content (excluding your data), is owned by Futures OS and protected by intellectual property laws. You may not copy, modify, distribute, or create derivative works without our express written consent.

### 9.2 Your Data
You retain full ownership of all trade data, journal entries, and other content you submit to the Service ("Your Data"). By using the Service, you grant us a limited, non-exclusive license to store, process, and display Your Data solely for the purpose of providing the Service to you.

### 9.3 Feedback
If you submit feedback, suggestions, or ideas about the Service, you grant us the right to use that feedback without compensation or attribution to you.

---

## 10. Privacy

Your use of the Service is governed by our Privacy Policy, which is incorporated into these Terms by reference. By using the Service, you consent to our collection and use of your data as described in the Privacy Policy.

---

## 11. Third-Party Services

The Service integrates with third-party services including Supabase (database) and Anthropic (AI). Your use of the Service is subject to the terms and privacy policies of these third-party providers. We are not responsible for the practices of third-party services.

---

## 12. Service Availability and Modifications

### 12.1 Availability
We strive to maintain high availability but do not guarantee uninterrupted access to the Service. We may experience downtime due to maintenance, updates, or circumstances beyond our control.

### 12.2 Modifications
We reserve the right to modify, suspend, or discontinue any feature of the Service at any time. We will provide reasonable notice of material changes where practicable.

### 12.3 Data Export
If we discontinue the Service, we will provide you with at least 30 days notice and the ability to export your trade data before shutdown.

---

## 13. Disclaimers and Limitation of Liability

### 13.1 Disclaimer of Warranties
THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

### 13.2 Limitation of Liability
TO THE MAXIMUM EXTENT PERMITTED BY LAW:

- WE WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES
- WE WILL NOT BE LIABLE FOR ANY TRADING LOSSES, LOST PROFITS, OR FINANCIAL LOSSES OF ANY KIND ARISING FROM YOUR USE OF THE SERVICE
- OUR TOTAL LIABILITY TO YOU FOR ANY CLAIM ARISING FROM THESE TERMS OR THE SERVICE WILL NOT EXCEED THE AMOUNT YOU PAID US IN THE 3 MONTHS PRECEDING THE CLAIM

### 13.3 Essential Basis
You acknowledge that the limitations of liability in this section are an essential element of the agreement between you and Futures OS, without which we would not provide the Service.

---

## 14. Indemnification

You agree to indemnify, defend, and hold harmless Futures OS and its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including reasonable legal fees) arising from:

- Your use of the Service
- Your violation of these Terms
- Your violation of any third-party rights
- Any trading decisions made based on information from the Service

---

## 15. Governing Law and Dispute Resolution

### 15.1 Governing Law
These Terms are governed by the laws of the United States, without regard to conflict of law principles.

### 15.2 Informal Resolution
Before filing any legal claim, you agree to contact us and attempt to resolve the dispute informally for at least 30 days.

### 15.3 Arbitration
If informal resolution fails, disputes will be resolved through binding arbitration under the rules of the American Arbitration Association (AAA). You waive the right to a jury trial and to participate in class action lawsuits.

### 15.4 Exception
Either party may seek injunctive or equitable relief in a court of competent jurisdiction for claims involving intellectual property or unauthorized access.

---

## 16. Changes to Terms

We may update these Terms from time to time. We will notify you of material changes by:

- Posting a notice within the Service
- Sending an email to your registered address at least 14 days before changes take effect
- Updating the "Last Updated" date at the top of this document

Continued use of the Service after the effective date constitutes acceptance of the updated Terms. If you do not agree to the changes, you must cancel your subscription before the effective date.

---

## 17. Termination

### 17.1 By You
You may terminate your account at any time by cancelling your subscription and requesting account deletion through the Service settings or by contacting us.

### 17.2 By Us
We may suspend or terminate your account immediately if you:
- Violate these Terms
- Fail to pay subscription fees
- Engage in fraudulent or harmful behavior

### 17.3 Effect of Termination
Upon termination, your right to use the Service ceases immediately. You may export your data within 30 days of termination. After 30 days, your data will be permanently deleted.

---

## 18. Miscellaneous

### 18.1 Entire Agreement
These Terms and our Privacy Policy constitute the entire agreement between you and Futures OS regarding the Service.

### 18.2 Severability
If any provision of these Terms is found unenforceable, the remaining provisions will continue in full force.

### 18.3 No Waiver
Our failure to enforce any provision of these Terms does not constitute a waiver of our right to enforce it in the future.

### 18.4 Assignment
You may not assign your rights under these Terms without our consent. We may assign our rights to a successor in connection with a merger or acquisition.

---

## 19. Contact Information

For questions about these Terms, please contact us.

For legal notices, please use "Legal Notice" in the subject line.`;

  const content = title === "Privacy Policy" ? privacyContent : termsContent;

  return (
    <div style={{ fontSize: 12, lineHeight: 1.6, color: C.text, padding: 16, whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
      {content}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LOGIN SCREEN
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// LOGIN SCREEN - WITH PASSWORD VISIBILITY TOGGLE
// ─────────────────────────────────────────────────────────────
function LoginScreen({ signIn, signUp, authLoading, authError }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [localError, setLocalError] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  
  // Legal documents state
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const handleSubmit = async () => {
    setLocalError("");
    if (!email || !password) { setLocalError("Please fill in all fields."); return; }
    if (mode === "signup") {
      if (!agreePrivacy || !agreeTerms) {
        setLocalError("Please accept both Privacy Policy and Terms of Service.");
        return;
      }
      const result = await signUp(email, password, displayName);
      if (result?.confirm) {
        setConfirmed(true);
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

  // Show Privacy Policy modal
  if (showPrivacy) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 600, maxHeight: "90vh", overflow: "auto", background: C.panel, borderRadius: 12, padding: 24, border: `1px solid ${C.border}` }}>
          <LegalDocument title="Privacy Policy" />
          <button onClick={() => setShowPrivacy(false)} style={{ width: "100%", padding: 12, marginTop: 16, background: C.green, color: "#000", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Back</button>
        </div>
      </div>
    );
  }

  // Show Terms of Service modal
  if (showTerms) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 600, maxHeight: "90vh", overflow: "auto", background: C.panel, borderRadius: 12, padding: 24, border: `1px solid ${C.border}` }}>
          <LegalDocument title="Terms of Service" />
          <button onClick={() => setShowTerms(false)} style={{ width: "100%", padding: 12, marginTop: 16, background: C.green, color: "#000", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Back</button>
        </div>
      </div>
    );
  }

  const inp = (label, value, onChange, type = "text", placeholder = "") => (
    <div>
      <label style={{ fontSize: 10, color: C.muted, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input 
          type={type} 
          value={value} 
          onChange={e => onChange(e.target.value)} 
          placeholder={placeholder}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          style={{ width: "100%", background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }} 
        />
        {label.toLowerCase().includes("password") && (
          <button 
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}
          >
            {showPassword ? "🙈" : "👁️"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } input:focus { border-color: #4f8ef7 !important; box-shadow: 0 0 0 2px rgba(79,142,247,0.15) !important; } button { font-family: inherit; }`}</style>
      <div style={{ width: "100%", maxWidth: 420 }}>
    {/* Logo / Header */}
<div style={{ textAlign: "center", marginBottom: 32 }}>
  <div style={{ 
    width: 56, 
    height: 56, 
    background: `linear-gradient(135deg, ${C.green}, ${C.blue})`, 
    borderRadius: 14, 
    display: "inline-flex", 
    alignItems: "center", 
    justifyContent: "center", 
    fontSize: 26, 
    marginBottom: 14 
  }}>📊</div>
  
  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.5px", color: C.text }}>
    SIGNAL AUTHORITY TRADING OS
  </div>
  
  <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
    Discipline today. Freedom tomorrow.
  </div>
</div>

        <Card>
          {/* Mode tabs */}
          <div style={{ display: "flex", gap: 4, background: "#0b0d19", border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, marginBottom: 24 }}>
            {[["login", "Sign In"], ["signup", "Create Account"]].map(([id, label]) => (
              <button key={id} onClick={() => { setMode(id); setLocalError(""); setShowPassword(false); }}
                style={{ flex: 1, padding: "9px", borderRadius: 7, border: "none", background: mode === id ? C.panel : "transparent", color: mode === id ? C.text : C.muted, cursor: "pointer", fontSize: 13, fontWeight: mode === id ? 700 : 400 }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {mode === "signup" && inp("Your Name", displayName, setDisplayName, "text", "e.g. Alex Trader")}
            {inp("Email", email, setEmail, "email", "your@email.com")}
            
            {/* Password field with visibility toggle */}
            {inp("Password", password, setPassword, showPassword ? "text" : "password", "••••••••")}

            {/* Legal checkboxes for signup */}
            {mode === "signup" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, background: C.border + "10", padding: 14, borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <input type="checkbox" checked={agreePrivacy} onChange={e => setAgreePrivacy(e.target.checked)} style={{ marginTop: 4, cursor: "pointer", width: 18, height: 18, accentColor: C.green }} />
                  <label style={{ fontSize: 12, color: C.text, cursor: "pointer" }}>
                    I accept the <button type="button" onClick={() => setShowPrivacy(true)} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 12, fontWeight: 600, textDecoration: "underline" }}>Privacy Policy</button>
                  </label>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} style={{ marginTop: 4, cursor: "pointer", width: 18, height: 18, accentColor: C.green }} />
                  <label style={{ fontSize: 12, color: C.text, cursor: "pointer" }}>
                    I accept the <button type="button" onClick={() => setShowTerms(true)} style={{ background: "none", border: "none", color: C.blue, cursor: "pointer", fontSize: 12, fontWeight: 600, textDecoration: "underline" }}>Terms of Service</button>
                  </label>
                </div>
              </div>
            )}

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
                <Btn onClick={handleSubmit} disabled={authLoading || (mode === "signup" && (!agreePrivacy || !agreeTerms))} style={{ width: "100%", padding: 14, fontSize: 14 }}>
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
function ProfileSettings({ profile, updateProfile, signOut, setView, supabase, userId, accounts, currentAccountId }) {
  const [name, setName] = useState(profile?.display_name || "");
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    await updateProfile({ display_name: name });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const forceLogout = () => {
    localStorage.clear();
    window.location.reload(true);
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 20 }}>
      <button 
        onClick={forceLogout}
        style={{
          width: "100%",
          padding: "12px",
          background: "#ff1744",
          color: "white",
          border: "none",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 20,
          cursor: "pointer"
        }}
      >
        FORCE LOGOUT & RELOAD APP
      </button>

      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: 0 }}>‹ Dashboard</button>
        <h2 style={{ margin: "8px 0 4px", fontSize: 20, fontWeight: 800 }}>Profile Settings</h2>
        <p style={{ color: C.muted, fontSize: 12, margin: 0 }}>Manage your account</p>
      </div>

      <Card style={{ marginBottom: 14 }}>
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

      {currentAccountId && supabase && userId && (
        <InstrumentsManager 
          currentAccountId={currentAccountId}
          supabase={supabase}
          userId={userId}
        />
      )}
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
  { id: "strategies", label: "Strategies", emoji: "🎯" },
     { id: "portfolio", label: "Portfolio", emoji: "💰" }
];

// ─────────────────────────────────────────────────────────────
// DISCIPLINE ANALYTICS
// ─────────────────────────────────────────────────────────────
function DisciplineAnalytics({ trades, setView, accounts = [], currentAccountId, setCurrentAccountId }) {
  const accountTrades = (currentAccountId
    ? trades.filter(t => t.account_id === currentAccountId)
    : trades
  ).sort((a, b) => new Date(b.created_at || b.trade_date) - new Date(a.created_at || a.trade_date));

  const hasEnough = accountTrades.length >= 3;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const avg = (arr, field) => {
    const vals = arr.map(x => x[field]).filter(v => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const wr = arr => arr.length ? arr.filter(x => x.result === "Win").length / arr.length : null;
  const pct = v => v != null ? `${(v * 100).toFixed(0)}%` : "—";
  const avgFmt = (arr, field) => { const v = avg(arr, field); return v != null ? v.toFixed(1) : "—"; };

  // ── Discipline trend (last 10) ────────────────────────────────────────────
  const last10 = accountTrades.slice(0, 10).map(t => t.discipline_score).filter(Boolean);
  const disciplineTrend = last10.length >= 3
    ? last10[0] > last10[last10.length - 1] ? "improving"
      : last10[0] < last10[last10.length - 1] ? "declining" : "stable"
    : null;
  const avgDiscipline = avg(accountTrades, "discipline_score");

  // ── Win rate by mental state ───────────────────────────────────────────────
  const stateMap = {};
  accountTrades.forEach(t => {
    const s = t.mental_state || "Unknown";
    if (!stateMap[s]) stateMap[s] = { wins: 0, total: 0 };
    stateMap[s].total++;
    if (t.result === "Win") stateMap[s].wins++;
  });
  const stateRows = Object.entries(stateMap)
    .filter(([, d]) => d.total >= 2)
    .map(([state, d]) => ({ state, wr: d.wins / d.total, total: d.total }))
    .sort((a, b) => b.wr - a.wr);

  // ── Fear/Greed vs calm ────────────────────────────────────────────────────
  const calm      = accountTrades.filter(t => (t.fear_level || 0) <= 4 && (t.greed_level || 0) <= 4);
  const highFear  = accountTrades.filter(t => (t.fear_level  || 0) >= 7);
  const highGreed = accountTrades.filter(t => (t.greed_level || 0) >= 7);
  const calmWR    = wr(calm);
  const fearWR    = wr(highFear);
  const greedWR   = wr(highGreed);

  // ── Conviction vs outcome ─────────────────────────────────────────────────
  const hiConv = accountTrades.filter(t => (t.conviction_level || 0) >= 7);
  const loConv = accountTrades.filter(t => (t.conviction_level || 0) <= 4);
  const hiConvWR = wr(hiConv);
  const loConvWR = wr(loConv);

  // ── Setup performance ─────────────────────────────────────────────────────
  const setupMap = {};
  accountTrades.forEach(t => {
    const s = t.setup_type || "Unknown";
    if (!setupMap[s]) setupMap[s] = { wins: 0, total: 0, pnl: 0 };
    setupMap[s].total++;
    if (t.result === "Win") setupMap[s].wins++;
    setupMap[s].pnl += t.pnl || 0;
  });
  const setupRows = Object.entries(setupMap)
    .filter(([, d]) => d.total >= 2)
    .map(([name, d]) => ({ name, wr: d.wins / d.total, total: d.total, pnl: d.pnl }))
    .sort((a, b) => b.wr - a.wr);

  // ── Time-of-day ───────────────────────────────────────────────────────────
  const timeMap = {};
  accountTrades.forEach(t => {
    if (!t.entry_time) return;
    const h = parseInt(t.entry_time.split(":")[0], 10);
    const slot = h < 10 ? "Pre-10am" : h < 12 ? "10am–12pm" : h < 14 ? "12–2pm" : "2pm+";
    if (!timeMap[slot]) timeMap[slot] = { wins: 0, total: 0 };
    timeMap[slot].total++;
    if (t.result === "Win") timeMap[slot].wins++;
  });
  const timeRows = Object.entries(timeMap)
    .filter(([, d]) => d.total >= 2)
    .map(([slot, d]) => ({ slot, wr: d.wins / d.total, total: d.total }))
    .sort((a, b) => b.wr - a.wr);

  // ── Streak ────────────────────────────────────────────────────────────────
  let streak = 0;
  const lastResult = accountTrades[0]?.result;
  for (const t of accountTrades) {
    if (t.result === lastResult) streak++;
    else break;
  }

  // ── Early exit rate ───────────────────────────────────────────────────────
  const earlyExitLosses = accountTrades.filter(t => t.exit_reason === "manual_exit" && t.result === "Loss").length;
  const earlyExitRate   = accountTrades.length ? earlyExitLosses / accountTrades.length : 0;

  // ── Key insights ─────────────────────────────────────────────────────────
  const insights = [];
  if (calmWR != null && fearWR != null && calm.length >= 2 && highFear.length >= 2 && (calmWR - fearWR) > 0.15)
    insights.push({ type: "warning", text: `Win rate drops ${((calmWR - fearWR) * 100).toFixed(0)}pp when fear is high (${pct(fearWR)} vs ${pct(calmWR)} calm). Fear is costing you edge.` });
  if (calmWR != null && greedWR != null && calm.length >= 2 && highGreed.length >= 2 && (calmWR - greedWR) > 0.15)
    insights.push({ type: "warning", text: `Win rate drops ${((calmWR - greedWR) * 100).toFixed(0)}pp when greed is high (${pct(greedWR)} vs ${pct(calmWR)} calm). Greed is your edge-killer.` });
  if (hiConvWR != null && loConvWR != null && hiConv.length >= 2 && loConv.length >= 2) {
    const diff = hiConvWR - loConvWR;
    if (Math.abs(diff) > 0.15)
      insights.push({ type: diff > 0 ? "positive" : "warning", text: `High-conviction trades win ${pct(hiConvWR)} vs ${pct(loConvWR)} for low-conviction. ${diff > 0 ? "Trust your conviction." : "High conviction may be overconfidence — review those entries."}` });
  }
  if (earlyExitRate > 0.2)
    insights.push({ type: "warning", text: `${(earlyExitRate * 100).toFixed(0)}% of trades are early manual exits that closed as losses. Let your stops do their job.` });
  if (streak >= 3)
    insights.push({ type: lastResult === "Win" ? "positive" : "warning", text: lastResult === "Win" ? `You're on a ${streak}-trade win streak. Stay disciplined — don't oversize.` : `${streak}-trade losing streak. Reduce size or step back and identify the pattern first.` });
  if (disciplineTrend === "improving")
    insights.push({ type: "positive", text: `Discipline trending up across last ${last10.length} trades (${last10.join(" → ")}). The process improvements are showing.` });
  else if (disciplineTrend === "declining")
    insights.push({ type: "warning", text: `Discipline trending down across last ${last10.length} trades (${last10.join(" → ")}). Review your pre-trade routine.` });

  // ── Shared sub-styles ─────────────────────────────────────────────────────
  const tblHead = { fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", padding: "6px 10px", borderBottom: `1px solid ${C.border}` };
  const tblCell = { fontSize: 13, padding: "8px 10px", borderBottom: `1px solid ${C.border}20` };
  const wrColor = v => v >= 0.6 ? C.green : v >= 0.4 ? C.yellow : C.red;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", marginBottom: 12, fontSize: 13 }}>← Dashboard</button>
      <h2 style={{ marginBottom: 4 }}>Discipline Analytics</h2>
      <p style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>Cross-trade behavioural patterns — {accountTrades.length} trades analysed</p>

      {accounts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: C.muted, marginBottom: 6, display: "block" }}>Account</label>
          <select value={currentAccountId || ""} onChange={e => setCurrentAccountId(e.target.value)}
            style={{ width: "100%", padding: 12, background: "#1a1d2e", border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }}>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name} — {acc.account_type?.toUpperCase()} (${acc.starting_balance})</option>
            ))}
          </select>
        </div>
      )}

      {!hasEnough && (
        <Card glow={C.yellow} style={{ marginBottom: 20 }}>
          <p style={{ color: C.yellow, fontSize: 13 }}>⚠ Log at least 3 trades to unlock cross-trade analysis. You have {accountTrades.length} so far.</p>
        </Card>
      )}

      {/* ── KPI row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Avg Discipline", value: avgDiscipline != null ? `${avgDiscipline.toFixed(1)}/10` : "—", color: avgDiscipline >= 7 ? C.green : avgDiscipline >= 5 ? C.yellow : C.red },
          { label: "Trend (last 10)", value: disciplineTrend ? disciplineTrend.charAt(0).toUpperCase() + disciplineTrend.slice(1) : "—", color: disciplineTrend === "improving" ? C.green : disciplineTrend === "declining" ? C.red : C.yellow },
          { label: "Calm Win Rate", value: pct(calmWR), color: calmWR >= 0.6 ? C.green : calmWR >= 0.4 ? C.yellow : C.red },
        ].map(k => (
          <Card key={k.label} glow={k.color} style={{ padding: 14 }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
          </Card>
        ))}
      </div>

      {/* ── Insights ── */}
      {insights.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>📊 Key Insights</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {insights.map((ins, i) => (
              <div key={i} style={{
                padding: "10px 14px", borderRadius: 8, fontSize: 13, lineHeight: 1.6,
                background: ins.type === "positive" ? C.green + "10" : C.red + "10",
                borderLeft: `3px solid ${ins.type === "positive" ? C.green : C.red}`,
                color: C.text,
              }}>
                {ins.type === "positive" ? "✓ " : "⚠ "}{ins.text}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Fear / Greed vs Calm ── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>😤 Emotional State Win Rates</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...tblHead, textAlign: "left" }}>State</th>
              <th style={{ ...tblHead, textAlign: "center" }}>Trades</th>
              <th style={{ ...tblHead, textAlign: "center" }}>Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Calm (fear ≤4, greed ≤4)", trades: calm.length,      wrVal: calmWR  },
              { label: "High Fear (≥7)",            trades: highFear.length,  wrVal: fearWR  },
              { label: "High Greed (≥7)",           trades: highGreed.length, wrVal: greedWR },
            ].map(row => (
              <tr key={row.label}>
                <td style={{ ...tblCell, color: C.text }}>{row.label}</td>
                <td style={{ ...tblCell, textAlign: "center", color: C.muted }}>{row.trades}</td>
                <td style={{ ...tblCell, textAlign: "center", color: row.wrVal != null ? wrColor(row.wrVal) : C.muted, fontWeight: 700 }}>
                  {row.trades >= 2 ? pct(row.wrVal) : <span style={{ color: C.muted }}>Need ≥2</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* ── Mental state breakdown ── */}
      {stateRows.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>🧠 Win Rate by Mental State</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...tblHead, textAlign: "left" }}>Mental State</th>
                <th style={{ ...tblHead, textAlign: "center" }}>Trades</th>
                <th style={{ ...tblHead, textAlign: "center" }}>Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {stateRows.map(row => (
                <tr key={row.state}>
                  <td style={{ ...tblCell, color: C.text }}>{row.state}</td>
                  <td style={{ ...tblCell, textAlign: "center", color: C.muted }}>{row.total}</td>
                  <td style={{ ...tblCell, textAlign: "center", color: wrColor(row.wr), fontWeight: 700 }}>{pct(row.wr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── Setup performance ── */}
      {setupRows.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>📐 Setup Performance</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...tblHead, textAlign: "left" }}>Setup</th>
                <th style={{ ...tblHead, textAlign: "center" }}>Trades</th>
                <th style={{ ...tblHead, textAlign: "center" }}>Win Rate</th>
                <th style={{ ...tblHead, textAlign: "right" }}>Net P&L</th>
              </tr>
            </thead>
            <tbody>
              {setupRows.map(row => (
                <tr key={row.name}>
                  <td style={{ ...tblCell, color: C.text }}>{row.name}</td>
                  <td style={{ ...tblCell, textAlign: "center", color: C.muted }}>{row.total}</td>
                  <td style={{ ...tblCell, textAlign: "center", color: wrColor(row.wr), fontWeight: 700 }}>{pct(row.wr)}</td>
                  <td style={{ ...tblCell, textAlign: "right", color: row.pnl >= 0 ? C.green : C.red, fontWeight: 700 }}>
                    {row.pnl >= 0 ? "+" : ""}${row.pnl.toFixed(0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── Time of day ── */}
      {timeRows.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>🕐 Win Rate by Time of Day</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...tblHead, textAlign: "left" }}>Window</th>
                <th style={{ ...tblHead, textAlign: "center" }}>Trades</th>
                <th style={{ ...tblHead, textAlign: "center" }}>Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {timeRows.map(row => (
                <tr key={row.slot}>
                  <td style={{ ...tblCell, color: C.text }}>{row.slot}</td>
                  <td style={{ ...tblCell, textAlign: "center", color: C.muted }}>{row.total}</td>
                  <td style={{ ...tblCell, textAlign: "center", color: wrColor(row.wr), fontWeight: 700 }}>{pct(row.wr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── Conviction ── */}
      {(hiConv.length >= 2 || loConv.length >= 2) && (
        <Card>
          <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>💡 Conviction vs Outcome</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...tblHead, textAlign: "left" }}>Conviction</th>
                <th style={{ ...tblHead, textAlign: "center" }}>Trades</th>
                <th style={{ ...tblHead, textAlign: "center" }}>Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "High (≥7)", trades: hiConv.length, wrVal: hiConvWR },
                { label: "Low  (≤4)", trades: loConv.length, wrVal: loConvWR },
              ].map(row => (
                <tr key={row.label}>
                  <td style={{ ...tblCell, color: C.text }}>{row.label}</td>
                  <td style={{ ...tblCell, textAlign: "center", color: C.muted }}>{row.trades}</td>
                  <td style={{ ...tblCell, textAlign: "center", color: row.wrVal != null ? wrColor(row.wrVal) : C.muted, fontWeight: 700 }}>
                    {row.trades >= 2 ? pct(row.wrVal) : <span style={{ color: C.muted }}>Need ≥2</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ACCOUNT MANAGER
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// ACCOUNT MANAGER
// ─────────────────────────────────────────────────────────────
function AccountManager({ userId, setView, accounts, setAccounts }) {
  const [newName, setNewName] = useState("");
  const [newBroker, setNewBroker] = useState("");
  const [newType, setNewType] = useState("live");
  const [newBalance, setNewBalance] = useState(10000);

  const fetchAccounts = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/accounts?user_id=eq.${userId}&is_active=eq.true`, {
        headers: authHeaders()
      });
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to fetch accounts", e);
      setAccounts([]);
    }
  }, [userId, setAccounts]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const addAccount = async () => {
    if (!newName.trim()) return alert("Account name is required");
    if (!userId) return alert("You must be logged in");

    try {
      const payload = {
        user_id: userId,
        name: newName.trim(),
        broker: newBroker.trim() || null,
        account_type: newType,
        starting_balance: parseFloat(newBalance) || 0
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/accounts`, {
        method: "POST",
        headers: { ...authHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setNewName("");
        setNewBroker("");
        setNewBalance(10000);
        fetchAccounts();
        alert("✅ Account added successfully!");
      } else {
        const err = await res.json();
        alert("Failed: " + (err.message || err.error));
      }
    } catch (e) {
      alert("Network error");
    }
  };

  const deleteAccount = async (id, name) => {
    const confirmDelete = window.confirm(`Delete account "${name}"?`);
    if (!confirmDelete) return;

    const deleteTradesToo = window.confirm("Also delete ALL trades linked to this account?");
    try {
      if (deleteTradesToo) {
        await fetch(`${SUPABASE_URL}/rest/v1/trades?account_id=eq.${id}`, {
          method: "DELETE",
          headers: authHeaders()
        });
      }
      await fetch(`${SUPABASE_URL}/rest/v1/accounts?id=eq.${id}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      fetchAccounts();
      alert("Account deleted successfully.");
    } catch (e) {
      alert("Failed to delete account");
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <button onClick={() => setView("dashboard")} style={{ color: C.muted }}>← Back to Dashboard</button>
      <h2>Manage Trading Accounts</h2>

      <Card style={{ marginBottom: 24 }}>
        <h3>Add New Account</h3>
        <input 
          placeholder="Account Name" 
          value={newName} 
          onChange={e => setNewName(e.target.value)} 
          style={{width:"100%", padding:12, marginBottom:8, background:"#1a1d2e", border:`1px solid ${C.border}`, borderRadius:8, color:C.text}} 
        />
        <input 
          placeholder="Broker (optional)" 
          value={newBroker} 
          onChange={e => setNewBroker(e.target.value)} 
          style={{width:"100%", padding:12, marginBottom:8, background:"#1a1d2e", border:`1px solid ${C.border}`, borderRadius:8, color:C.text}} 
        />
        <select 
          value={newType} 
          onChange={e => setNewType(e.target.value)} 
          style={{width:"100%", padding:12, marginBottom:8, background:"#1a1d2e", border:`1px solid ${C.border}`, borderRadius:8, color:C.text}}
        >
          <option value="live">Live Account</option>
          <option value="sim">Sim Account</option>
          <option value="prop">Prop Firm</option>
          <option value="funded">Funded Account</option>
        </select>
        <input 
          type="number" 
          placeholder="Starting Balance" 
          value={newBalance} 
          onChange={e => setNewBalance(e.target.value)} 
          style={{width:"100%", padding:12, marginBottom:12, background:"#1a1d2e", border:`1px solid ${C.border}`, borderRadius:8, color:C.text}} 
        />
        <Btn onClick={addAccount}>+ Add Account</Btn>
      </Card>

      <Card>
        <h3>Your Accounts ({accounts.length})</h3>
        {accounts.length === 0 && <p style={{color: C.muted}}>No accounts yet.</p>}
        {accounts.map(a => (
          <div key={a.id} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 0", borderBottom:"1px solid #1c1f30"}}>
            <div>
              <strong>{a.name}</strong><br />
              <span style={{fontSize:12, color:C.muted}}>{a.broker || "—"} • {a.account_type?.toUpperCase() || 'LIVE'} • ${a.starting_balance}</span>
            </div>
            <button onClick={() => deleteAccount(a.id, a.name)} style={{color: C.red, background:"none", border:"none", cursor:"pointer"}}>Delete</button>
          </div>
        ))}
      </Card>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────
// MAIN APP COMPONENT
// ─────────────────────────────────────────────────────────────

function App() {
  const { session, profile, authLoading, authError, signIn, signUp, signOut, updateProfile, getDailyNote, saveDailyNote, isLoggedIn } = useAuth();
  const userId = session?.user?.id || null;

  // Get trades and strategies from Supabase
 const { trades, addTrade, deleteTrade, updateTrade, customStrategies, addCustomStrategy, deleteCustomStrategy, isConfigured } = useSupabase(userId);

  // Create a Supabase client wrapper for instrument queries (user_id is enforced server-side)
  const supabase = {
    from: (table) => ({
      select: (columns = '*') => ({
        eq: (col, val) => ({
          single: async () => {
            try {
              await ensureValidToken();
              const res = await fetch(
                `${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${val}&select=${columns}&user_id=eq.${userId}`,
                { headers: authHeaders() }
              );
              const data = await res.json();
              return { data: data?.[0] || null, error: null };
            } catch (e) {
              return { data: null, error: e };
            }
          }
        })
      })
    })
  };

  // Navigation and UI state
  const [view, setView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSetup, setShowSetup] = useLocalStorage("fos_setup_banner", true);

  const [currentAccountId, setCurrentAccountId] = useState(null);

 
  const [strategyPreferences, setStrategyPreferences] = useLocalStorage('fos_strategy_preferences', { builtInEnabled: {} });

  // REVIEW MODAL STATE
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedTradeForReview, setSelectedTradeForReview] = useState(null);

  // ACCOUNTS STATE
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    const fetchAccounts = async () => {
      if (!userId) return;
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/accounts?user_id=eq.${userId}&is_active=eq.true`, {
          headers: authHeaders()
        });
        const data = await res.json();
        setAccounts(data || []);
      } catch (e) {
        console.error("Failed to fetch accounts", e);
      }
    };
    fetchAccounts();
  }, [userId]);

  // Trigger news poller every 15 minutes
  useEffect(() => {
    const pollNews = async () => {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/news-poller`, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
        });
      } catch (err) {
        console.warn("News poller trigger failed:", err);
      }
    };
    
    pollNews();
    const interval = setInterval(pollNews, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!isLoggedIn) {
    return <LoginScreen signIn={signIn} signUp={signUp} authLoading={authLoading} authError={authError} />;
  }

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

  const views = {
    dashboard: () => <Dashboard trades={trades} setView={setView} showSetup={showSetup && !isConfigured} setShowSetup={setShowSetup} displayName={displayName} accounts={accounts} currentAccountId={currentAccountId} setCurrentAccountId={setCurrentAccountId} profile={profile} getDailyNote={getDailyNote} saveDailyNote={saveDailyNote} openTradeReview={openTradeReview} updateTrade={updateTrade} key={Date.now()} />,
    entry: () => <TradeEntry addTrade={addTrade} updateTrade={updateTrade} setView={setView} trades={trades} customStrategies={customStrategies} strategyPreferences={strategyPreferences} accounts={accounts} currentAccountId={currentAccountId} setCurrentAccountId={setCurrentAccountId} userId={userId} supabase={supabase} />,
    review: () => <TradeReview trades={trades} setView={setView} accounts={accounts} currentAccountId={currentAccountId} setCurrentAccountId={setCurrentAccountId} />,
    checklist: () => <TradeChecklist setView={setView} userId={userId} />,
    analytics: () => <Analytics trades={trades} accounts={accounts} currentAccountId={currentAccountId} setCurrentAccountId={setCurrentAccountId} getDailyNote={getDailyNote} saveDailyNote={saveDailyNote} />,
    market: () => <Market />,
    journal: () => <TradeLog trades={trades} deleteTrade={deleteTrade} updateTrade={updateTrade} setView={setView} openTradeReview={openTradeReview} accounts={accounts} currentAccountId={currentAccountId} setCurrentAccountId={setCurrentAccountId} />,
    profile: () => <ProfileSettings profile={profile} updateProfile={updateProfile} signOut={signOut} setView={setView} supabase={supabase} userId={userId} accounts={accounts} currentAccountId={currentAccountId} />,
    strategies: () => <ManageStrategies customStrategies={customStrategies} addCustomStrategy={addCustomStrategy} deleteCustomStrategy={deleteCustomStrategy} strategyPreferences={strategyPreferences} setStrategyPreferences={setStrategyPreferences} profile={profile} updateProfile={updateProfile} setView={setView} />,
    portfolio: () => <AccountManager userId={userId} setView={setView} accounts={accounts} setAccounts={setAccounts} />,
    discipline: () => <DisciplineAnalytics trades={trades} setView={setView} accounts={accounts} currentAccountId={currentAccountId} setCurrentAccountId={setCurrentAccountId} />
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
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.4px", color: C.text }}>
              FUTURES.OS
            </div>
            <div style={{ fontSize: 9, color: C.blue, letterSpacing: "0.12em" }}>
              {isConfigured ? "LIVE" : "DEMO"}
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>
          {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} ET
        </div>
      </div>

      {/* Sidebar Overlay */}
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 60, backdropFilter: "blur(4px)" }} />}

      {/* Sidebar */}
      <aside style={{ position: "fixed", top: 0, left: 0, height: "100vh", width: 220, background: "#0b0d19", borderRight: `1px solid ${C.border}`, zIndex: 70, display: "flex", flexDirection: "column", padding: "20px 0", transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)", transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)" }}>
        <div style={{ padding: "0 16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, background: `linear-gradient(135deg, ${C.green}, ${C.blue})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📊</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.text }}>FUTURES.OS</div>
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
          isOpen={showReviewModal}
          trade={selectedTradeForReview}
          onClose={closeReviewModal}
          updateTrade={updateTrade}
          customStrategies={customStrategies}
          accounts={accounts}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FINAL CLEAN EXPORT
// ─────────────────────────────────────────────────────────────
export default App;