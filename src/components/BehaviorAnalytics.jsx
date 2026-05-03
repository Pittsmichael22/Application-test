import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

const C = {
  green: "#00e676", red: "#ff1744", blue: "#4f8ef7", yellow: "#ffd600",
  panel: "#0f111a", border: "#1c1f30", text: "#f0f2ff", muted: "#8892b0"
};

function Card({ children }) {
  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: 20,
      marginBottom: 20
    }}>
      {children}
    </div>
  );
}

function fmt$(n) {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
}

export function BehaviorAnalytics({ trades = [], accounts = [], currentAccountId, setCurrentAccountId }) {
  // Filter by selected account
  const accountTrades = currentAccountId 
    ? trades.filter(t => t.account_id === currentAccountId) 
    : trades;

  const stats = useMemo(() => {
    if (accountTrades.length === 0) {
      return { total: 0 };
    }

    const wins = accountTrades.filter(t => (t.exit_price || 0) > (t.entry_price || 0));
    const total = accountTrades.length;
    const winRate = Math.round((wins.length / total) * 100);
    const avgPnL = accountTrades.reduce((sum, t) => sum + (t.pnl || (t.exit_price - t.entry_price) || 0), 0) / total;

    // Conviction
    const convictionData = [1,2,3,4,5,6,7,8,9,10].map(level => {
      const filtered = accountTrades.filter(t => t.conviction_level === level);
      const winsInLevel = filtered.filter(t => (t.exit_price || 0) > (t.entry_price || 0));
      return {
        level: `C${level}`,
        trades: filtered.length,
        winRate: filtered.length ? Math.round((winsInLevel.length / filtered.length) * 100) : 0
      };
    }).filter(d => d.trades > 0);

    // Fear
    const fearData = [1,2,3,4,5,6,7,8,9,10].map(level => ({
      level,
      count: accountTrades.filter(t => t.fear_level === level).length
    }));

    // Violations
    const violations = {};
    accountTrades.forEach(t => (t.rule_violations || []).forEach(v => {
      violations[v] = (violations[v] || 0) + 1;
    }));
    const violationData = Object.entries(violations).map(([name, count]) => ({ name, count }));

    // Market Condition
    const marketGroups = {};
    accountTrades.forEach(t => {
      const m = t.market_condition || "unknown";
      marketGroups[m] = (marketGroups[m] || 0) + 1;
    });
    const marketData = Object.entries(marketGroups).map(([name, count]) => ({ name, count }));

    return {
      total, winRate, avgPnL,
      convictionData, fearData, violationData, marketData
    };
  }, [accountTrades]);

  if (stats.total === 0) {
    return <Card><p>No trades yet for this account. Log some to see powerful behavioral insights.</p></Card>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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

      <Card>
        <h3>Overall Performance</h3>
        <p style={{ fontSize: 52, fontWeight: 700, margin: "8px 0", color: stats.winRate > 55 ? C.green : C.red }}>
          {stats.winRate}% Win Rate
        </p>
        <p>{stats.total} trades • Avg P&L: {fmt$(stats.avgPnL)}</p>
      </Card>

      <Card>
        <h3>Win Rate by Conviction Level</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={stats.convictionData}>
            <XAxis dataKey="level" stroke={C.muted} />
            <YAxis stroke={C.muted} />
            <Tooltip />
            <Bar dataKey="winRate" fill={C.green} radius={8} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <h3>Fear Level Distribution</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={stats.fearData}>
            <XAxis dataKey="level" stroke={C.muted} />
            <YAxis stroke={C.muted} />
            <Tooltip />
            <Bar dataKey="count" fill={C.red} radius={8} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {stats.violationData.length > 0 && (
        <Card>
          <h3>Rule Violations</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.violationData}>
              <XAxis dataKey="name" stroke={C.muted} />
              <YAxis stroke={C.muted} />
              <Tooltip />
              <Bar dataKey="count" fill={C.yellow} radius={8} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {stats.marketData.length > 0 && (
        <Card>
          <h3>Performance by Market Condition</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={stats.marketData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100}>
                {stats.marketData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={[C.green, C.blue, C.yellow, C.red][index % 4]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card>
        <h3>AI Behavioral Insight</h3>
        <p style={{ fontSize: 18, lineHeight: 1.7 }}>
          {stats.winRate > 60 
            ? "Strong edge on high-conviction setups. Keep protecting winners."
            : stats.winRate < 40 
            ? "Focus heavily on reducing fear-driven exits and rule violations."
            : "You're in the building phase. Prioritize conviction > 7 and cut fear trades."}
        </p>
      </Card>
    </div>
  );
}