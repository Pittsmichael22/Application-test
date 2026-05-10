// =========================================================================
// TRADE HISTORY MODAL
// Read-only view exactly mirrors the 4-stage TradeEntry process:
//   0. Account  1. Pre-Trade  2. Execution  3. Post-Trade Reflection
// =========================================================================
import React, { useState, useEffect } from 'react';

// Mirrors the formula in App.js — single source of truth.
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

export function TradeHistoryModal({
  trade,
  isOpen,
  onClose,
  updateTrade,
  customStrategies = [],
  accounts = [],
}) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedForm, setEditedForm] = useState(null);
// eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (trade) {
      setEditedForm({ ...trade });
      setIsEditMode(false);
    }
  }, [trade]);

  // Auto-recalculate P&L whenever price, size, fees or commissions change in edit mode
  useEffect(() => {
    if (!editedForm || !isEditMode) return;
    const entry   = parseFloat(editedForm.entry_price);
    const exit    = parseFloat(editedForm.exit_price);
    const size    = parseFloat(editedForm.position_size) || 1;
    const fees    = parseFloat(editedForm.fees)          || 0;
    const comms   = parseFloat(editedForm.commissions)   || 0;

    // Only recalculate if we have both prices
    if (!entry || !exit) return;

    // Tick size and value by instrument family
    const getTickInfo = (symbol = "") => {
      const s = symbol.toUpperCase();
      if (s.includes("NQ") || s.includes("MNQ"))  return { tickSize: 0.25, tickValue: s.startsWith("M") ? 0.50 : 5.00 };
      if (s.includes("ES") || s.includes("MES"))  return { tickSize: 0.25, tickValue: s.startsWith("M") ? 1.25 : 12.50 };
      if (s.includes("YM") || s.includes("MYM"))  return { tickSize: 1.00, tickValue: s.startsWith("M") ? 0.50 : 5.00 };
      if (s.includes("RTY") || s.includes("M2K")) return { tickSize: 0.10, tickValue: s.startsWith("M") ? 0.50 : 5.00 };
      if (s.includes("CL"))  return { tickSize: 0.01, tickValue: 10.00 };
      if (s.includes("GC"))  return { tickSize: 0.10, tickValue: 10.00 };
      if (s.includes("SI"))  return { tickSize: 0.005, tickValue: 25.00 };
      return { tickSize: 0.01, tickValue: 1.00 };
    };
    const { tickSize, tickValue } = getTickInfo(editedForm.symbol);
    const dir   = editedForm.direction === "Long" ? 1 : editedForm.direction === "Short" ? -1 : 1;
    const ticks = (exit - entry) / tickSize;
    const gross = Math.round(dir * ticks * tickValue * size * 100) / 100;
    const net   = Math.round((gross - fees - comms) * 100) / 100;

    if (net !== editedForm.pnl) {
      setEditedForm(prev => ({
        ...prev,
        pnl: net,
        result: net > 0 ? "Win" : net < 0 ? "Loss" : "Breakeven",
      }));
    }
  }, [
    editedForm?.entry_price,
    editedForm?.exit_price,
    editedForm?.position_size,
    editedForm?.direction,
    editedForm?.fees,
    editedForm?.commissions,
    isEditMode,
  ]);

  if (!isOpen || !trade) return null;

  const handleSave = async () => {
    if (editedForm) {
      const pnl = parseFloat(editedForm.pnl) || 0;
      const updatedForm = {
        ...editedForm,
        pnl,
        result: pnl > 0 ? "Win" : pnl < 0 ? "Loss" : "Breakeven",
        discipline_score: calcDisciplineScore(editedForm),
      };
      await updateTrade(trade.id, updatedForm);
    }
    setIsEditMode(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {trade.symbol} —{' '}
            {trade.direction === 'Long' ? '↑ Long' : trade.direction === 'Short' ? '↓ Short' : trade.direction}
            {trade.import_source === 'csv' && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: '#ffd74020', border: '1px solid #ffd74050', color: '#ffd740',
              }}>CSV Import</span>
            )}
          </h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {!isEditMode ? (
            <TradeInfoReadOnly
              trade={trade}
              accounts={accounts}
              onEdit={() => setIsEditMode(true)}
            />
          ) : (
            <TradeEditForm
              editedForm={editedForm}
              setEditedForm={setEditedForm}
              onSave={handleSave}
              onCancel={() => setIsEditMode(false)}
              customStrategies={customStrategies}
              accounts={accounts}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fv  = v => (v === null || v === undefined || v === '') ? '—' : v;
const fvN = (v, suffix = '/10') => (v === null || v === undefined || v === '') ? '—' : `${v}${suffix}`;
const fvB = v => v === true ? '✅ Yes' : v === false ? '❌ No' : '—';
const fvC = v => (v !== null && v !== undefined && v !== '') ? `$${Number(v).toFixed(2)}` : '—';

const BUILT_IN_STRATEGIES = [
  { value: 'Breakout_NewHigh',       label: 'Breakout - New High/Low' },
  { value: 'Pullback_Support',       label: 'Pullback to Support/Resistance' },
  { value: 'Reversal_Candle',        label: 'Reversal Candle (Pinbar, Engulfing)' },
  { value: 'InsideBar_Breakout',     label: 'Inside Bar Breakout' },
  { value: 'Flag_Pennant',           label: 'Bull/Bear Flag or Pennant' },
  { value: 'Trend_Continuation',     label: 'Trend Continuation' },
  { value: 'MA_Crossover',           label: 'Moving Average Crossover' },
  { value: 'EMA_Ribbon',             label: 'EMA Ribbon Alignment' },
  { value: 'Volume_Spike',           label: 'Volume Spike + Price Action' },
  { value: 'RSI_Divergence',         label: 'RSI Divergence' },
  { value: 'Bollinger_Squeeze',      label: 'Bollinger Band Squeeze' },
  { value: 'VWAP_Reclaim',           label: 'VWAP Reclaim' },
  { value: 'Scalp_Momentum',         label: 'Scalp - Momentum Ignition' },
  { value: 'Opening_Range_Breakout', label: 'Opening Range Breakout (ORB)' },
  { value: 'News_Catalyst',          label: 'News / Economic Catalyst' },
  { value: 'Confluence_Multiple',    label: 'Multiple Indicator Confluence' },
  { value: 'OrderFlow_Delta',        label: 'Order Flow / Delta Divergence' },
  { value: 'Mean_Reversion',         label: 'Mean Reversion Setup' },
];

const EXIT_REASONS = {
  target_hit: 'Target Hit', stop_hit: 'Stop Hit', manual_exit: 'Manual Exit',
  time_exit: 'Time Exit', breakeven: 'Breakeven', other: 'Other',
};

const POST_EMOTIONS = {
  Proud: 'Proud / Satisfied', Relieved: 'Relieved',
  Regretful: 'Regretful / Disappointed', Angry: 'Angry at myself',
  Euphoric: 'Euphoric (dangerous)', Numb: 'Numb / Indifferent',
};

function strategyLabel(value, customStrategies = []) {
  if (!value) return '—';
  const b = BUILT_IN_STRATEGIES.find(s => s.value === value);
  if (b) return b.label;
  const c = customStrategies.find(s => s.name === value);
  if (c) return c.name;
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// READ-ONLY VIEW — mirrors the 4-stage TradeEntry exactly
// ─────────────────────────────────────────────────────────────────────────────
function TradeInfoReadOnly({ trade, accounts, onEdit }) {
  const account        = accounts.find(a => a.id === trade.account_id);
  const disciplineScore = trade.discipline_score ?? calcDisciplineScore(trade);
  const scoreColor     = disciplineScore >= 8 ? '#00e676' : disciplineScore >= 6 ? '#ffd740' : '#ff1744';
  const pnlColor       = (trade.pnl ?? 0) >= 0 ? '#00e676' : '#ff1744';
  const rrDisplay      = trade.risk_reward ? `1 : ${Number(trade.risk_reward).toFixed(2)}` : '—';

  const secHead = (
    <style>{`
      .th-section { margin-bottom: 26px; }
      .th-section-head {
        font-size: 11px; font-weight: 700; color: #8a9ba8;
        text-transform: uppercase; letter-spacing: 0.1em;
        margin-bottom: 12px; padding-bottom: 6px;
        border-bottom: 1px solid #1c1f30;
      }
      .th-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; }
      .th-field-label { font-size: 11px; color: #8a9ba8; margin-bottom: 2px; }
      .th-field-value { font-size: 13px; color: #e0e8ff; font-weight: 600; }
    `}</style>
  );

  const Field = ({ label, value }) => (
    <div>
      <div className="th-field-label">{label}</div>
      <div className="th-field-value">{value}</div>
    </div>
  );

  return (
    <div>
      {secHead}
      {trade.import_source === 'csv' && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: '#ffd74015', border: '1px solid #ffd74040',
          fontSize: 12, color: '#ffd740',
        }}>
          📥 This trade was imported from CSV. Post-Trade Reflection fields are empty — tap <strong>Edit Trade</strong> to fill them in.
        </div>
      )}

      {/* Result banner */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 18px', background: '#1a1d2e', borderRadius: 10, marginBottom: 22,
      }}>
        <div>
          <div style={{ fontSize: 12, color: '#8a9ba8' }}>{fv(trade.trade_date)} • {fv(trade.symbol)}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: pnlColor, marginTop: 2 }}>{fvC(trade.pnl)}</div>
          <div style={{ fontSize: 11, color: '#8a9ba8', marginTop: 2 }}>
            {fv(trade.result)} • {trade.duration_minutes ? `${trade.duration_minutes} min` : '—'}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#8a9ba8', marginBottom: 2 }}>DISCIPLINE</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{disciplineScore}</div>
          <div style={{ fontSize: 10, color: '#8a9ba8' }}>/ 10</div>
        </div>
      </div>

      {/* 0. Account */}
      {account && (
        <div className="th-section">
          <div className="th-section-head">0. Account</div>
          <div className="th-field-value">
            {account.name} — {account.account_type?.toUpperCase()} (${account.starting_balance})
          </div>
        </div>
      )}

      {/* 1. Pre-Trade */}
      <div className="th-section">
        <div className="th-section-head">1. Pre-Trade</div>
        <div className="th-grid">
          <Field label="Market Condition"      value={fv(trade.market_condition)} />
          <Field label="Entry Signal / Strategy" value={strategyLabel(trade.entry_signal)} />
          <Field label="Conviction Level"      value={fvN(trade.conviction_level)} />
          <Field label="News Event"            value={fvB(trade.is_news_event)} />
        </div>
      </div>

      {/* 2. Execution */}
      <div className="th-section">
        <div className="th-section-head">2. Execution</div>
        <div className="th-grid">
          <Field label="Symbol"        value={fv(trade.symbol)} />
          <Field label="Trade Date"    value={fv(trade.trade_date)} />
          <Field label="Position Size" value={fv(trade.position_size)} />
          <Field label="Direction"     value={
            <span style={{
              display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              background: trade.direction === 'Long' ? '#00e67620' : '#ff174420',
              border: `1px solid ${trade.direction === 'Long' ? '#00e67650' : '#ff174450'}`,
              color: trade.direction === 'Long' ? '#00e676' : '#ff1744',
            }}>
              {trade.direction === 'Long' ? '↑ Long' : trade.direction === 'Short' ? '↓ Short' : fv(trade.direction)}
            </span>
          } />
          <Field label="Entry Time"    value={<span style={{ fontFamily: 'monospace' }}>{fv(trade.entry_time)}</span>} />
          <Field label="Exit Time"     value={<span style={{ fontFamily: 'monospace' }}>{fv(trade.exit_time)}</span>} />
          <Field label="Entry Price"   value={fv(trade.entry_price)} />
          <Field label="Exit Price"    value={fv(trade.exit_price)} />
          <Field label="Stop Loss"     value={fv(trade.stop_loss)} />
          <Field label="Take Profit"   value={fv(trade.take_profit)} />
          <Field label="Risk : Reward" value={rrDisplay} />
          <Field label="Commissions"   value={trade.commissions ? fvC(trade.commissions) : '—'} />
          <Field label="Fees"          value={trade.fees ? fvC(trade.fees) : '—'} />
          <Field label="P&L"           value={
            <span style={{ color: pnlColor }}>{fvC(trade.pnl)}</span>
          } />
        </div>
      </div>

      {/* 3. Post-Trade Reflection */}
      <div className="th-section">
        <div className="th-section-head">3. Post-Trade Reflection</div>
        <div className="th-grid">
          <Field label="Pre-Trade Confidence"       value={fvN(trade.confidence_level ?? trade.conviction_level)} />
          <Field label="Focus Level"                value={fvN(trade.focus_level)} />
          <Field label="Rule Adherence"             value={fvN(trade.rule_adherence)} />
          <Field label="Impulsiveness"              value={fvN(trade.impulsiveness)} />
          <Field label="Energy Level"               value={fvN(trade.energy_level)} />
          <Field label="Market Context Awareness"   value={fvN(trade.market_context)} />
          <Field label="Trade Outcome Satisfaction" value={fvN(trade.outcome_satisfaction)} />
          <Field label="Fear Level"                 value={fvN(trade.fear_level)} />
          <Field label="Greed Level"                value={fvN(trade.greed_level)} />
          <Field label="Pre-Trade Emotional State"  value={fv(trade.mental_state)} />
          <Field label="Exit Reason"                value={EXIT_REASONS[trade.exit_reason] ?? fv(trade.exit_reason)} />
          <Field label="Post-Trade Emotion"         value={POST_EMOTIONS[trade.post_trade_emotion] ?? fv(trade.post_trade_emotion)} />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: '#8a9ba8', marginBottom: 4 }}>What did I learn from this trade?</div>
          <p style={{ fontSize: 13, color: '#e0e8ff', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>
            {fv(trade.post_trade_reflection)}
          </p>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: '#8a9ba8', marginBottom: 4 }}>What would I do differently next time?</div>
          <p style={{ fontSize: 13, color: '#e0e8ff', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>
            {fv(trade.what_to_improve)}
          </p>
        </div>
      </div>

      <button onClick={onEdit} style={{
        width: '100%', padding: 16, background: '#4f8ef7', color: 'white',
        border: 'none', borderRadius: 8, marginTop: 8, fontWeight: 600,
        cursor: 'pointer', fontSize: 14,
      }}>
        ✎ Edit Trade
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EDIT FORM — same stage/field order as TradeEntry
// ─────────────────────────────────────────────────────────────────────────────
function TradeEditForm({ editedForm, setEditedForm, onSave, onCancel, customStrategies = [], accounts = [] }) {
  if (!editedForm) return null;

  const set    = (field, value) => setEditedForm(prev => ({ ...prev, [field]: value }));
  const setFlt = (field, value) => set(field, value === '' ? null : parseFloat(value));

  const inp = {
    width: '100%', padding: '10px 12px', background: '#1a1d2e',
    border: '1px solid #1c1f30', borderRadius: 8, color: '#fff', fontSize: 13,
  };
  const lbl  = { display: 'block', marginBottom: 5, fontSize: 11, color: '#8a9ba8', fontWeight: 600 };
  const grid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 };
  const sec  = { marginBottom: 26 };
  const secH = {
    fontSize: 11, fontWeight: 700, color: '#8a9ba8', textTransform: 'uppercase',
    letterSpacing: '0.1em', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #1c1f30',
  };

  const SliderField = ({ label, field, color = '#4f8ef7' }) => (
    <div>
      <label style={lbl}>
        {label}: <span style={{ color }}>{editedForm[field] ?? 5}/10</span>
      </label>
      <input type="range" min="1" max="10"
        value={editedForm[field] ?? 5}
        onChange={e => set(field, +e.target.value)}
        style={{ width: '100%', accentColor: color }}
      />
    </div>
  );

  return (
    <div>
      <h3 style={{ marginBottom: 20 }}>Edit Trade</h3>

      {/* 0. Account */}
      {accounts.length > 0 && (
        <div style={sec}>
          <div style={secH}>0. Account</div>
          <select value={editedForm.account_id || ''} onChange={e => set('account_id', e.target.value)} style={inp}>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name} — {acc.account_type?.toUpperCase()} (${acc.starting_balance})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 1. Pre-Trade */}
      <div style={sec}>
        <div style={secH}>1. Pre-Trade</div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Market Condition</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {['Trending Up', 'Trending Down', 'Ranging', 'Volatile'].map(cond => (
              <button key={cond} onClick={() => set('market_condition', cond)} style={{
                padding: '11px 8px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12,
                border: editedForm.market_condition === cond ? '2px solid #00e676' : '1px solid #1c1f30',
                background: editedForm.market_condition === cond ? '#00e67620' : '#1a1d2e',
                color: editedForm.market_condition === cond ? '#00e676' : '#fff',
              }}>
                {cond.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Entry Signal / Strategy</label>
          <select value={editedForm.entry_signal || ''} onChange={e => set('entry_signal', e.target.value)} style={inp}>
            <option value="">Select Strategy / Pattern...</option>
            {BUILT_IN_STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            {customStrategies.length > 0 && (
              <optgroup label="My Custom Strategies">
                {customStrategies.filter(s => s.enabled !== false).map(s => (
                  <option key={s.id || s.name} value={s.name}>{s.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <SliderField label="Conviction Level" field="conviction_level" color="#4f8ef7" />

        <div style={{ marginTop: 14, padding: '10px 14px', background: '#1a1d2e', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#c0c8e0' }}>Trade during or around a significant news event</span>
          <button onClick={() => set('is_news_event', !editedForm.is_news_event)} style={{
            padding: '4px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
            background: editedForm.is_news_event ? '#ffd740' : '#333',
            color: editedForm.is_news_event ? '#000' : '#aaa',
            fontSize: 12, fontWeight: 700,
          }}>
            {editedForm.is_news_event ? 'Yes' : 'No'}
          </button>
        </div>
      </div>

      {/* 2. Execution */}
      <div style={sec}>
        <div style={secH}>2. Execution</div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Symbol</label>
          <input style={inp} type="text" value={editedForm.symbol || ''}
            onChange={e => set('symbol', e.target.value.toUpperCase())} />
        </div>

        {/* Live P&L preview */}
        {editedForm.entry_price && editedForm.exit_price && (
          <div style={{
            padding: '12px 16px', borderRadius: 8, marginBottom: 14,
            background: (editedForm.pnl || 0) >= 0 ? '#00e67615' : '#ff174415',
            border: `1px solid ${(editedForm.pnl || 0) >= 0 ? '#00e67640' : '#ff174440'}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: '#8a9ba8' }}>Calculated P&L (after fees)</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: (editedForm.pnl || 0) >= 0 ? '#00e676' : '#ff1744' }}>
              {(editedForm.pnl || 0) >= 0 ? '+' : ''}${(editedForm.pnl || 0).toFixed(2)}
              <span style={{ fontSize: 11, color: '#8a9ba8', fontWeight: 400, marginLeft: 6 }}>
                {editedForm.result || ''}
              </span>
            </span>
          </div>
        )}

        <div style={{ ...grid, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Trade Date</label>
            <input style={inp} type="date" value={editedForm.trade_date || ''} onChange={e => set('trade_date', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Position Size</label>
            <input style={inp} type="number" value={editedForm.position_size ?? ''} onChange={e => setFlt('position_size', e.target.value)} />
          </div>
        </div>

        <div style={{ ...grid, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Entry Time (HH:MM:SS.mmm)</label>
            <input style={{ ...inp, fontFamily: 'monospace' }} type="text" placeholder="HH:MM:SS.mmm"
              value={editedForm.entry_time || ''} onChange={e => set('entry_time', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Exit Time (HH:MM:SS.mmm)</label>
            <input style={{ ...inp, fontFamily: 'monospace' }} type="text" placeholder="HH:MM:SS.mmm"
              value={editedForm.exit_time || ''} onChange={e => set('exit_time', e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Trade Direction</label>
          <div style={{ display: 'flex', gap: 12 }}>
            {['Long', 'Short'].map(dir => (
              <button key={dir} onClick={() => set('direction', dir)} style={{
                flex: 1, padding: 12, borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700,
                background: editedForm.direction === dir ? (dir === 'Long' ? '#00e676' : '#ff1744') : '#1a1d2e',
                color: editedForm.direction === dir ? (dir === 'Long' ? '#000' : '#fff') : (dir === 'Long' ? '#00e676' : '#ff1744'),
                border: `2px solid ${editedForm.direction === dir ? (dir === 'Long' ? '#00e676' : '#ff1744') : (dir === 'Long' ? '#00e67640' : '#ff174440')}`,
              }}>
                {dir === 'Long' ? '↑ Long' : '↓ Short'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ ...grid, marginBottom: 14 }}>
          <div><label style={lbl}>Entry Price</label><input style={inp} type="number" step="0.01" value={editedForm.entry_price ?? ''} onChange={e => setFlt('entry_price', e.target.value)} /></div>
          <div><label style={lbl}>Exit Price</label><input style={inp} type="number" step="0.01" value={editedForm.exit_price ?? ''} onChange={e => setFlt('exit_price', e.target.value)} /></div>
          <div><label style={lbl}>Stop Loss</label><input style={inp} type="number" step="0.01" value={editedForm.stop_loss ?? ''} onChange={e => setFlt('stop_loss', e.target.value)} /></div>
          <div><label style={lbl}>Take Profit</label><input style={inp} type="number" step="0.01" value={editedForm.take_profit ?? ''} onChange={e => setFlt('take_profit', e.target.value)} /></div>
          <div><label style={lbl}>Commissions</label><input style={inp} type="number" step="0.01" value={editedForm.commissions ?? ''} onChange={e => setFlt('commissions', e.target.value)} /></div>
          <div><label style={lbl}>Fees</label><input style={inp} type="number" step="0.01" value={editedForm.fees ?? ''} onChange={e => setFlt('fees', e.target.value)} /></div>
        </div>
      </div>

      {/* 3. Post-Trade Reflection */}
      <div style={sec}>
        <div style={secH}>3. Post-Trade Reflection</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
          <SliderField label="Pre-Trade Confidence"       field="confidence_level"     color="#4f8ef7" />
          <SliderField label="Focus Level"                field="focus_level"          color="#4f8ef7" />
          <SliderField label="Rule Adherence"             field="rule_adherence"       color="#4f8ef7" />
          <SliderField label="Impulsiveness"              field="impulsiveness"        color="#ff1744" />
          <SliderField label="Energy Level"               field="energy_level"         color="#ffd740" />
          <SliderField label="Market Context Awareness"   field="market_context"       color="#4f8ef7" />
          <SliderField label="Trade Outcome Satisfaction" field="outcome_satisfaction" color="#00e676" />
          <SliderField label="Fear Level"                 field="fear_level"           color="#ff1744" />
          <SliderField label="Greed Level"                field="greed_level"          color="#00e676" />
        </div>

        <div style={{ ...grid, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Pre-Trade Emotional State</label>
            <select value={editedForm.mental_state || ''} onChange={e => set('mental_state', e.target.value)} style={inp}>
              <option value="">Select...</option>
              <option value="Calm">Calm &amp; Focused</option>
              <option value="Anxious">Anxious / Hesitant</option>
              <option value="Excited">Excited / Eager</option>
              <option value="Frustrated">Frustrated / Tilted</option>
              <option value="Overconfident">Overconfident</option>
              <option value="Tired">Tired / Low Energy</option>
              <option value="FOMO">FOMO</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Exit Reason</label>
            <select value={editedForm.exit_reason || ''} onChange={e => set('exit_reason', e.target.value)} style={inp}>
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
            <label style={lbl}>Post-Trade Emotion</label>
            <select value={editedForm.post_trade_emotion || ''} onChange={e => set('post_trade_emotion', e.target.value)} style={inp}>
              <option value="">Select...</option>
              <option value="Proud">Proud / Satisfied</option>
              <option value="Relieved">Relieved</option>
              <option value="Regretful">Regretful / Disappointed</option>
              <option value="Angry">Angry at myself</option>
              <option value="Euphoric">Euphoric (dangerous)</option>
              <option value="Numb">Numb / Indifferent</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>What did I learn from this trade?</label>
          <textarea rows="4" value={editedForm.post_trade_reflection || ''}
            onChange={e => set('post_trade_reflection', e.target.value)}
            placeholder="Key takeaway..."
            style={{ ...inp, resize: 'vertical' }} />
        </div>

        <div>
          <label style={lbl}>What would I do differently next time?</label>
          <textarea rows="4" value={editedForm.what_to_improve || ''}
            onChange={e => set('what_to_improve', e.target.value)}
            placeholder="Be specific..."
            style={{ ...inp, resize: 'vertical' }} />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button onClick={onCancel} style={{
          flex: 1, padding: 14, background: '#1a1d2e', color: '#ccc',
          border: '1px solid #333', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
        }}>Cancel</button>
        <button onClick={onSave} style={{
          flex: 1, padding: 14, background: '#4f8ef7', color: 'white',
          border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
        }}>Save Changes</button>
      </div>
    </div>
  );
}

export default TradeHistoryModal;
