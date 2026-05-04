// ═════════════════════════════════════════════════════════════════════════════
// BEHAVIOR ANALYTICS ENGINE (Phase 2)
// ═════════════════════════════════════════════════════════════════════════════
// Insert this component into your App.js Analytics view

import { LineChart, Line, BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const C = {
  bg: "#0a0c15",
  text: "#e4e6eb",
  muted: "#717579",
  border: "#2a2f3f",
  panel: "#0f1217",
  green: "#10b981",
  red: "#ef4444",
  blue: "#3b82f6",
  purple: "#a855f7",
  yellow: "#f59e0b",
};

export function BehaviorAnalytics({ trades }) {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. CONVICTION LEVEL ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────
  
  const convictionAnalysis = () => {
    const buckets = {};
    trades.forEach(t => {
      const conviction = t.conviction_level || 5;
      const bucket = Math.round(conviction / 2) * 2;
      if (!buckets[bucket]) buckets[bucket] = { wins: 0, losses: 0, total: 0 };
      buckets[bucket].total++;
      if (t.result === "Win") buckets[bucket].wins++;
      else if (t.result === "Loss") buckets[bucket].losses++;
    });
    
    return Object.entries(buckets)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([level, data]) => ({
        conviction: `${level}+`,
        winRate: data.total > 0 ? Math.round((data.wins / data.total) * 100) : 0,
        total: data.total,
        wins: data.wins,
        losses: data.losses
      }));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 2. DECISION SPEED IMPACT
  // ─────────────────────────────────────────────────────────────────────────
  
  const decisionSpeedAnalysis = () => {
    const speeds = { fast: [], moderate: [], overthink: [] };
    trades.forEach(t => {
      const speed = t.decision_speed || "moderate";
      speeds[speed].push(t);
    });

    return Object.entries(speeds).map(([speed, trades]) => {
      const wins = trades.filter(t => t.result === "Win").length;
      const losses = trades.filter(t => t.result === "Loss").length;
      const total = trades.length;
      
      return {
        speed: speed.charAt(0).toUpperCase() + speed.slice(1),
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
        total,
        avgPnL: total > 0 ? Math.round(trades.reduce((s, t) => s + (t.pnl || 0), 0) / total) : 0,
      };
    });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 3. EMOTIONAL STATE IMPACT (Fear + Greed)
  // ─────────────────────────────────────────────────────────────────────────
  
  const emotionalStateAnalysis = () => {
    const states = {
      lowFearLowGreed: [],
      highFearHighGreed: [],
      highFear: [],
      highGreed: [],
    };

    trades.forEach(t => {
      const fear = t.fear_level || 5;
      const greed = t.greed_level || 5;

      if (fear >= 7 && greed >= 7) {
        states.highFearHighGreed.push(t);
      } else if (fear >= 7) {
        states.highFear.push(t);
      } else if (greed >= 7) {
        states.highGreed.push(t);
      } else {
        states.lowFearLowGreed.push(t);
      }
    });

    return Object.entries(states).map(([state, trades]) => {
      const wins = trades.filter(t => t.result === "Win").length;
      const total = trades.length;
      return {
        state: state
          .replace(/([A-Z])/g, ' $1')
          .replace(/Low /, "Low ")
          .replace(/High /, "High ")
          .trim(),
        total,
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
        avgPnL: total > 0 ? Math.round(trades.reduce((s, t) => s + (t.pnl || 0), 0) / total) : 0,
      };
    }).filter(x => x.total > 0);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 4. RULE VIOLATION COST
  // ─────────────────────────────────────────────────────────────────────────
  
  const ruleViolationAnalysis = () => {
    const violations = {};
    const withoutViolations = [];

    trades.forEach(t => {
      if (!t.rule_violations || t.rule_violations.length === 0) {
        withoutViolations.push(t);
      } else {
        t.rule_violations.forEach(violation => {
          if (!violations[violation]) {
            violations[violation] = [];
          }
          violations[violation].push(t);
        });
      }
    });

    const results = [];
    
    // Clean trades (no violations)
    const cleanWins = withoutViolations.filter(t => t.result === "Win").length;
    const cleanTotal = withoutViolations.length;
    results.push({
      violation: "✓ No Violations",
      total: cleanTotal,
      winRate: cleanTotal > 0 ? Math.round((cleanWins / cleanTotal) * 100) : 0,
      avgPnL: cleanTotal > 0 ? Math.round(withoutViolations.reduce((s, t) => s + (t.pnl || 0), 0) / cleanTotal) : 0,
      color: C.green,
    });

    // Violation breakdown
    Object.entries(violations).forEach(([violation, trades]) => {
      const wins = trades.filter(t => t.result === "Win").length;
      const total = trades.length;
      results.push({
        violation: violation,
        total,
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
        avgPnL: total > 0 ? Math.round(trades.reduce((s, t) => s + (t.pnl || 0), 0) / total) : 0,
        color: C.red,
      });
    });

    return results;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 5. TIME OF DAY EDGE
  // ─────────────────────────────────────────────────────────────────────────
  
  const timeOfDayAnalysis = () => {
    const periods = { morning: [], afternoon: [], evening: [] };

    trades.forEach(t => {
      if (!t.trade_time) return;
      const hour = parseInt(t.trade_time.split(":")[0]);
      let period = "afternoon";
      if (hour < 12) period = "morning";
      else if (hour >= 16) period = "evening";
      
      periods[period].push(t);
    });

    return Object.entries(periods)
      .map(([period, trades]) => {
        const wins = trades.filter(t => t.result === "Win").length;
        const total = trades.length;
        return {
          period: period.charAt(0).toUpperCase() + period.slice(1),
          total,
          winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
          avgPnL: total > 0 ? Math.round(trades.reduce((s, t) => s + (t.pnl || 0), 0) / total) : 0,
        };
      })
      .filter(x => x.total > 0);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 6. NEWS EVENT IMPACT
  // ─────────────────────────────────────────────────────────────────────────
  
  const newsEventAnalysis = () => {
    const withNews = trades.filter(t => t.is_news_event);
    const withoutNews = trades.filter(t => !t.is_news_event);

    const analyze = (tradeSet, label) => {
      const wins = tradeSet.filter(t => t.result === "Win").length;
      const total = tradeSet.length;
      return {
        scenario: label,
        total,
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
        avgPnL: total > 0 ? Math.round(tradeSet.reduce((s, t) => s + (t.pnl || 0), 0) / total) : 0,
      };
    };

    return [
      analyze(withNews, "During News Events"),
      analyze(withoutNews, "No News Events"),
    ].filter(x => x.total > 0);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 7. MARKET CONDITION PERFORMANCE
  // ─────────────────────────────────────────────────────────────────────────
  
  const marketConditionAnalysis = () => {
    const conditions = {};

    trades.forEach(t => {
      const condition = t.market_condition || "unknown";
      if (!conditions[condition]) {
        conditions[condition] = [];
      }
      conditions[condition].push(t);
    });

    return Object.entries(conditions)
      .map(([condition, trades]) => {
        const wins = trades.filter(t => t.result === "Win").length;
        const total = trades.length;
        return {
          condition: condition
            .replace(/_/g, " ")
            .split(" ")
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
          total,
          winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
          avgPnL: total > 0 ? Math.round(trades.reduce((s, t) => s + (t.pnl || 0), 0) / total) : 0,
        };
      })
      .filter(x => x.total > 0)
      .sort((a, b) => b.winRate - a.winRate);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 8. BEHAVIORAL ALERTS (Red Flags)
  // ─────────────────────────────────────────────────────────────────────────
  
  const generateAlerts = () => {
    const alerts = [];

    // Alert 1: Revenge Trading Pattern
    const recentLosses = trades.slice(0, 5).filter(t => t.result === "Loss");
    if (recentLosses.length >= 2) {
      const nextTrades = trades.slice(0, 2);
      const sizeIncreased = nextTrades.some(t => 
        t.position_size > (recentLosses[0]?.position_size || 1)
      );
      if (sizeIncreased) {
        alerts.push({
          severity: "HIGH",
          emoji: "🔥",
          title: "Revenge Trading Pattern",
          message: `${recentLosses.length} losses followed by increased position size`,
          action: "Take a break before next trade",
        });
      }
    }

    // Alert 2: High Fear + High Greed (Worst Combo)
    const badEmotionalTrades = trades.filter(t => 
      (t.fear_level || 5) >= 7 && (t.greed_level || 5) >= 7
    );
    if (badEmotionalTrades.length >= 2) {
      const badWinRate = badEmotionalTrades.filter(t => t.result === "Win").length / badEmotionalTrades.length;
      if (badWinRate < 0.4) {
        alerts.push({
          severity: "CRITICAL",
          emoji: "⚠️",
          title: "Emotional Spiral Pattern",
          message: `High fear + high greed = ${Math.round(badWinRate * 100)}% win rate`,
          action: "This combo costs you money. Identify the trigger and stop it.",
        });
      }
    }

    // Alert 3: Discipline Breakdown
    const recentViolations = trades.slice(0, 10).filter(t => 
      t.rule_violations && t.rule_violations.length > 0
    );
    if (recentViolations.length >= 5) {
      alerts.push({
        severity: "HIGH",
        emoji: "📋",
        title: "Discipline Breakdown",
        message: `${recentViolations.length} of last 10 trades had rule violations`,
        action: "Audit your rules. Are they realistic or do you need system changes?",
      });
    }

    // Alert 4: Time-Based Bias
    const afternoonTrades = trades.filter(t => {
      if (!t.trade_time) return false;
      const hour = parseInt(t.trade_time.split(":")[0]);
      return hour >= 13 && hour < 16;
    });
    if (afternoonTrades.length >= 5) {
      const afternoonWinRate = afternoonTrades.filter(t => t.result === "Win").length / afternoonTrades.length;
      const morningTrades = trades.filter(t => {
        if (!t.trade_time) return false;
        const hour = parseInt(t.trade_time.split(":")[0]);
        return hour < 12;
      });
      if (morningTrades.length >= 5) {
        const morningWinRate = morningTrades.filter(t => t.result === "Win").length / morningTrades.length;
        if (afternoonWinRate < morningWinRate - 0.2) {
          alerts.push({
            severity: "MEDIUM",
            emoji: "🕐",
            title: "Time-Based Performance Bias",
            message: `Afternoon: ${Math.round(afternoonWinRate * 100)}% | Morning: ${Math.round(morningWinRate * 100)}%`,
            action: "Consider stopping after 1pm until you fix afternoon performance",
          });
        }
      }
    }

    return alerts;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (trades.length < 10) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <h3 style={{ color: C.text, marginBottom: 8 }}>Behavior Analytics Requires 10+ Trades</h3>
        <p style={{ color: C.muted, marginBottom: 20 }}>You have {trades.length}. Keep logging trades to unlock patterns.</p>
      </div>
    );
  }

  const convictionData = convictionAnalysis();
  const decisionSpeedData = decisionSpeedAnalysis();
  const emotionalData = emotionalStateAnalysis();
  const ruleViolationData = ruleViolationAnalysis();
  const timeData = timeOfDayAnalysis();
  const newsData = newsEventAnalysis();
  const marketData = marketConditionAnalysis();
  const alerts = generateAlerts();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ALERTS SECTION */}
      {alerts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: C.text }}>🚨 Behavioral Alerts</h3>
          {alerts.map((alert, i) => (
            <div key={i} style={{
              background: alert.severity === "CRITICAL" ? C.red + "15" : alert.severity === "HIGH" ? C.yellow + "15" : C.blue + "15",
              border: `1px solid ${alert.severity === "CRITICAL" ? C.red : alert.severity === "HIGH" ? C.yellow : C.blue}40`,
              borderRadius: 10,
              padding: "14px",
            }}>
              <div style={{ display: "flex", alignItems: "start", gap: 12 }}>
                <div style={{ fontSize: 20 }}>{alert.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                    {alert.title}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                    {alert.message}
                  </div>
                  <div style={{ 
                    fontSize: 11, 
                    color: alert.severity === "CRITICAL" ? C.red : C.yellow,
                    fontWeight: 600 
                  }}>
                    → {alert.action}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 1. CONVICTION LEVEL */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 16 }}>📊 Conviction Level Impact</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={convictionData}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="conviction" stroke={C.muted} />
            <YAxis stroke={C.muted} />
            <Tooltip contentStyle={{ background: C.bg, border: `1px solid ${C.border}` }} />
            <Bar dataKey="winRate" fill={C.green} />
          </BarChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 12, textAlign: "center" }}>
          Higher conviction levels show {convictionData[convictionData.length - 1]?.winRate}% win rate vs {convictionData[0]?.winRate}% at lower levels
        </div>
      </div>

      {/* 2. DECISION SPEED */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 16 }}>⚡ Decision Speed Impact</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {decisionSpeedData.map((d, i) => (
            <div key={i} style={{
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: 12,
              textAlign: "center"
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 6 }}>{d.speed}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.green, marginBottom: 4 }}>{d.winRate}%</div>
              <div style={{ fontSize: 10, color: C.muted }}>{d.total} trades | Avg ${d.avgPnL}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. EMOTIONAL STATE */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 16 }}>😟 Emotional State Analysis</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {emotionalData.map((d, i) => (
            <div key={i} style={{
              background: C.bg,
              border: `1px solid ${d.winRate > 55 ? C.green : C.red}40`,
              borderRadius: 8,
              padding: 12,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 6 }}>{d.state}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: d.winRate > 55 ? C.green : C.red, marginBottom: 4 }}>{d.winRate}%</div>
              <div style={{ fontSize: 10, color: C.muted }}>{d.total} trades</div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. RULE VIOLATIONS */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 16 }}>📋 Rule Violation Cost</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ruleViolationData.map((d, i) => (
            <div key={i} style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              background: C.bg,
              border: `1px solid ${d.color}40`,
              borderRadius: 8,
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{d.violation}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{d.total} trades</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: d.color }}>{d.winRate}%</div>
                <div style={{ fontSize: 10, color: C.muted }}>${d.avgPnL}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. TIME OF DAY */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 16 }}>🕐 Time of Day Performance</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {timeData.map((d, i) => (
            <div key={i} style={{
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: 12,
              textAlign: "center"
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 6 }}>{d.period}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.green, marginBottom: 4 }}>{d.winRate}%</div>
              <div style={{ fontSize: 10, color: C.muted }}>{d.total} trades</div>
            </div>
          ))}
        </div>
      </div>

      {/* 6. NEWS EVENTS */}
      {newsData.length > 0 && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 16 }}>📰 News Event Impact</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {newsData.map((d, i) => (
              <div key={i} style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: 12,
                textAlign: "center"
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 6 }}>{d.scenario}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.green, marginBottom: 4 }}>{d.winRate}%</div>
                <div style={{ fontSize: 10, color: C.muted }}>{d.total} trades</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. MARKET CONDITIONS */}
      {marketData.length > 0 && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 16 }}>📈 Best Market Conditions</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {marketData.map((d, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{d.condition}</div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.green }}>{d.winRate}%</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{d.total} trades</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default BehaviorAnalytics;
