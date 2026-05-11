import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from "recharts";
import { Card, SectionTitle, Tag } from "../App"; // adjust import as needed

const COLORS = ["#00e676", "#ff1744", "#ffd600", "#4f8ef7", "#a78bfa"];

export function BehaviorAnalytics({ trades }) {
  const behaviorData = useMemo(() => {
    if (!trades?.length) return null;

    // 1. Conviction Level vs Performance
    const convictionGroups = trades.reduce((acc, t) => {
      const conv = Math.floor((t.conviction_level || 5) / 3); // 1-3, 4-6, 7-10 → low/med/high
      const key = conv === 0 ? "Low (1-3)" : conv === 1 ? "Medium (4-6)" : "High (7-10)";
      if (!acc[key]) acc[key] = { count: 0, wins: 0, pnl: 0 };
      acc[key].count++;
      if (t.result === "Win") acc[key].wins++;
      acc[key].pnl += t.pnl || 0;
      return acc;
    }, {});

    const convictionChart = Object.entries(convictionGroups).map(([name, d]) => ({
      name,
      winRate: Math.round((d.wins / d.count) * 100),
      avgPnL: Math.round(d.pnl / d.count),
      count: d.count
    }));

    // 2. Decision Speed
    const decisionSpeed = trades.reduce((acc, t) => {
      const speed = t.decision_speed || "moderate";
      if (!acc[speed]) acc[speed] = { count: 0, wins: 0, pnl: 0 };
      acc[speed].count++;
      if (t.result === "Win") acc[speed].wins++;
      acc[speed].pnl += t.pnl || 0;
      return acc;
    }, {});

    const speedChart = Object.entries(decisionSpeed).map(([name, d]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      winRate: d.count ? Math.round((d.wins / d.count) * 100) : 0,
      avgPnL: d.count ? Math.round(d.pnl / d.count) : 0,
      count: d.count
    }));

    // 3. Fear & Greed Impact
    const emotionImpact = trades.reduce((acc, t) => {
      const fear = t.fear_level || 5;
      const greed = t.greed_level || 5;
      const emoKey = fear > 7 || greed > 7 ? "High Emotion" : "Calm";
      if (!acc[emoKey]) acc[emoKey] = { count: 0, wins: 0, pnl: 0 };
      acc[emoKey].count++;
      if (t.result === "Win") acc[emoKey].wins++;
      acc[emoKey].pnl += t.pnl || 0;
      return acc;
    }, {});

    // 4. Rule Violations Count
    const violationStats = trades.reduce((acc, t) => {
      const count = (t.rule_violations || []).length;
      const key = count === 0 ? "No Violations" : count === 1 ? "1 Violation" : "2+ Violations";
      if (!acc[key]) acc[key] = { count: 0, wins: 0, pnl: 0 };
      acc[key].count++;
      if (t.result === "Win") acc[key].wins++;
      acc[key].pnl += t.pnl || 0;
      return acc;
    }, {});

    const overall = {
      avgConviction: (trades.reduce((s, t) => s + (t.conviction_level || 5), 0) / trades.length).toFixed(1),
      highEmotionRate: Math.round((trades.filter(t => (t.fear_level || 5) > 7 || (t.greed_level || 5) > 7).length / trades.length) * 100),
      checklistPassRate: Math.round((trades.filter(t => t.pre_trade_checklist_passed).length / trades.length) * 100),
      ruleViolationRate: Math.round((trades.filter(t => (t.rule_violations || []).length > 0).length / trades.length) * 100)
    };

    return { convictionChart, speedChart, emotionImpact, violationStats, overall };
  }, [trades]);

  if (!behaviorData) return <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Log more trades with behavior data to unlock insights.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <SectionTitle>Behavioral Scorecard</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {[
            { label: "Avg Conviction", value: behaviorData.overall.avgConviction + "/10", color: C.blue },
            { label: "Checklist Pass Rate", value: behaviorData.overall.checklistPassRate + "%", color: C.green },
            { label: "High Emotion Trades", value: behaviorData.overall.highEmotionRate + "%", color: C.red },
            { label: "Rule Violation Rate", value: behaviorData.overall.ruleViolationRate + "%", color: C.yellow },
          ].map((stat, i) => (
            <div key={i} style={{ background: "#0b0d19", padding: 14, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, color: C.muted }}>{stat.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: stat.color, fontFamily: "monospace" }}>{stat.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Conviction vs Performance */}
      <Card>
        <SectionTitle>Conviction Level → Performance</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={behaviorData.convictionChart}>
            <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fill: C.muted }} />
            <Tooltip />
            <Bar yAxisId="left" dataKey="winRate" fill={C.green} name="Win Rate %" />
            <Bar yAxisId="left" dataKey="avgPnL" fill={C.blue} name="Avg PnL" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Decision Speed */}
      <Card>
        <SectionTitle>Decision Speed Impact</SectionTitle>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={behaviorData.speedChart}>
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="winRate" fill={C.purple} />
          </BarChart>
        </ResponsiveContainer>
        <div style={{ marginTop: 12, fontSize: 12, color: C.muted }}>
          Overthinking usually hurts performance — aim for "Fast" or "Moderate" on A+ setups.
        </div>
      </Card>

      {/* Emotional Control */}
      <Card>
        <SectionTitle>Emotional Control (Fear/Greed)</SectionTitle>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {Object.entries(behaviorData.emotionImpact).map(([key, data], i) => (
            <div key={i} style={{ flex: 1, minWidth: 180 }}>
              <Tag label={key} color={key === "High Emotion" ? C.red : C.green} />
              <div style={{ fontSize: 28, fontWeight: 800, margin: "8px 0" }}>
                {data.count ? Math.round((data.wins / data.count) * 100) : 0}%
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>Win Rate • {data.count} trades</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Rule Violations */}
      <Card>
        <SectionTitle>Rule Violations Impact</SectionTitle>
        {Object.entries(behaviorData.violationStats).map(([key, d]) => (
          <div key={key} style={{ marginBottom: 12, padding: 12, background: "#0b0d19", borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{key}</span>
              <span style={{ color: d.wins / d.count > 0.6 ? C.green : C.red }}>
                {Math.round((d.wins / d.count) * 100)}% WR
              </span>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}