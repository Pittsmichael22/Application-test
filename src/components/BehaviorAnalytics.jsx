// =========================================================================
// BEHAVIOR ANALYTICS COMPONENT
// =========================================================================
import React, { useMemo } from 'react';

// If you have a shared components folder, use this:
// import { Card, SectionTitle } from '../components/UI'; // adjust path if needed

// Or use inline styles (quick fix):
const Card = ({ children, style = {} }) => (
  <div style={{ 
    background: "#0f111a", 
    borderRadius: 12, 
    padding: 20, 
    marginBottom: 20, 
    border: "1px solid #1c1f30",
    ...style 
  }}>
    {children}
  </div>
);

const SectionTitle = ({ children }) => (
  <h3 style={{ marginBottom: 16, color: "#a0b0ff", fontSize: 18, fontWeight: 700 }}>
    {children}
  </h3>
);

export function BehaviorAnalytics({ trades = [] }) {
  const accountTrades = trades; // already filtered by parent if needed

  const psychStats = useMemo(() => {
    if (accountTrades.length === 0) return {};

    const total = accountTrades.length;
    const wins = accountTrades.filter(t => t.result === "Win").length;

    return {
      avgConfidence: (accountTrades.reduce((sum, t) => sum + (t.conviction_level || 5), 0) / total).toFixed(1),
      avgFocus: (accountTrades.reduce((sum, t) => sum + (t.focus_level || 5), 0) / total).toFixed(1),
      avgRuleAdherence: (accountTrades.reduce((sum, t) => sum + (t.rule_adherence || 5), 0) / total).toFixed(1),
      avgImpulsiveness: (accountTrades.reduce((sum, t) => sum + (t.impulsiveness || 5), 0) / total).toFixed(1),
      avgEnergy: (accountTrades.reduce((sum, t) => sum + (t.energy_level || 5), 0) / total).toFixed(1),
      winRate: ((wins / total) * 100).toFixed(1),
      totalTrades: total,
    };
  }, [accountTrades]);

  const emotionalImpact = useMemo(() => {
    const groups = {};
    accountTrades.forEach(t => {
      const state = t.mental_state || 'Unknown';
      if (!groups[state]) groups[state] = { wins: 0, total: 0, pnl: 0 };
      groups[state].total++;
      if (t.result === "Win") groups[state].wins++;
      groups[state].pnl += (t.pnl || 0);
    });

    return Object.entries(groups).map(([state, data]) => ({
      state,
      winRate: data.total > 0 ? ((data.wins / data.total) * 100).toFixed(1) : 0,
      avgPnL: (data.pnl / data.total).toFixed(0),
      count: data.total
    })).sort((a, b) => b.count - a.count);
  }, [accountTrades]);

  if (accountTrades.length === 0) {
    return <Card><p>No trades yet for behavior analysis.</p></Card>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card>
        <SectionTitle>Psychology Averages</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
          {[
            ["Confidence", psychStats.avgConfidence, "#4f8ef7"],
            ["Focus", psychStats.avgFocus, "#4f8ef7"],
            ["Rule Adherence", psychStats.avgRuleAdherence, "#00e676"],
            ["Impulsiveness", psychStats.avgImpulsiveness, "#ff1744"],
            ["Energy", psychStats.avgEnergy, "#ffd600"],
          ].map(([label, value, color]) => (
            <div key={label} style={{ background: "#1a1d2e", padding: 16, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#a0a8c0" }}>{label}</div>
              <div style={{ fontSize: 32, fontWeight: 700, color }}>{value}/10</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Emotional State Impact</SectionTitle>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1c1f30" }}>
              <th style={{ textAlign: "left", padding: "12px 8px" }}>Mental State</th>
              <th style={{ textAlign: "center", padding: "12px 8px" }}>Win Rate</th>
              <th style={{ textAlign: "center", padding: "12px 8px" }}>Avg P&L</th>
              <th style={{ textAlign: "center", padding: "12px 8px" }}>Trades</th>
            </tr>
          </thead>
          <tbody>
            {emotionalImpact.map(item => (
              <tr key={item.state} style={{ borderBottom: "1px solid #1c1f30" }}>
                <td style={{ padding: "12px 8px", fontWeight: 500 }}>{item.state}</td>
                <td style={{ textAlign: "center", padding: "12px 8px", color: item.winRate > 60 ? "#00e676" : item.winRate > 45 ? "#ffd600" : "#ff1744" }}>
                  {item.winRate}%
                </td>
                <td style={{ textAlign: "center", padding: "12px 8px" }}>${item.avgPnL}</td>
                <td style={{ textAlign: "center", padding: "12px 8px" }}>{item.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}