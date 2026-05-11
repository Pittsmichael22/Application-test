import React, { useState } from 'react';

const C = {
  border: "#404856",
  muted: "#8a9ba8",
  blue: "#4f8ef7",
  green: "#10b981",
  red: "#ef4444",
  yellow: "#f59e0b",
  orange: "#f97316"
};

function TradeHistoryModal({ trade, onClose, updateTrade, accounts = [], customStrategies = [], supabase }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedForm, setEditedForm] = useState(trade);

  const handleSave = async () => {
    try {
      // Recalculate P&L based on direction
      const entry = parseFloat(editedForm.entry_price) || 0;
      const exit = parseFloat(editedForm.exit_price) || 0;
      const position = parseFloat(editedForm.position_size) || 1;
      const comms = parseFloat(editedForm.commissions) || 0;
      const fees = parseFloat(editedForm.fees) || 0;
      
      let newPnl = 0;
      if (editedForm.direction === 'Long') {
        newPnl = (exit - entry) * position - comms - fees;
      } else if (editedForm.direction === 'Short') {
        newPnl = (entry - exit) * position - comms - fees;
      }
      
      // Determine result based on new P&L
      const newResult = newPnl > 0 ? 'Win' : newPnl < 0 ? 'Loss' : 'Breakeven';
      
      const updatedForm = {
        ...editedForm,
        pnl: newPnl,
        result: newResult
      };

      await updateTrade(trade.id, updatedForm);
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating trade:', error);
      alert('Failed to update trade');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: '#0f1419',
        borderRadius: 12,
        width: '90%',
        maxWidth: 800,
        maxHeight: '90vh',
        overflow: 'auto',
        padding: 32,
        border: `1px solid ${C.border}`
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <h2 style={{ margin: 0 }}>
            {trade.symbol} — {trade.direction} Trade
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: 24, cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        {!isEditing ? (
          <TradeInfoReadOnly trade={trade} onEdit={() => setIsEditing(true)} />
        ) : (
          <TradeEditForm 
            editedForm={editedForm} 
            setEditedForm={setEditedForm} 
            onSave={handleSave}
            onCancel={() => setIsEditing(false)}
            accounts={accounts}
            customStrategies={customStrategies}
          />
        )}
      </div>
    </div>
  );
}

function TradeInfoReadOnly({ trade, onEdit }) {
  const formatValue = (value) => value === null || value === undefined || value === '' ? '—' : value;

  return (
    <div>
      {/* 1. PRE-TRADE */}
      <section style={{ marginBottom: 24 }}>
        <h3>1. Pre-Trade</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
          <div><strong>Market Condition:</strong> {formatValue(trade.market_condition)}</div>
          <div><strong>Entry Signal:</strong> {formatValue(trade.entry_signal)}</div>
          <div><strong>Conviction Level:</strong> {formatValue(trade.conviction_level)}/10</div>
          <div><strong>News Event:</strong> {formatValue(trade.is_news_event ? 'Yes' : 'No')}</div>
        </div>
      </section>

      {/* 2. EXECUTION */}
      <section style={{ marginBottom: 24 }}>
        <h3>2. Execution</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
          <div><strong>Symbol:</strong> {formatValue(trade.symbol)}</div>
          <div><strong>Direction:</strong> {formatValue(trade.direction)}</div>
          <div><strong>Date:</strong> {formatValue(trade.trade_date)}</div>
          <div><strong>Position Size:</strong> {formatValue(trade.position_size)}</div>
          <div><strong>Entry Time:</strong> {formatValue(trade.entry_time)}</div>
          <div><strong>Exit Time:</strong> {formatValue(trade.exit_time)}</div>
          <div><strong>Entry Price:</strong> {formatValue(trade.entry_price)}</div>
          <div><strong>Exit Price:</strong> {formatValue(trade.exit_price)}</div>
          <div><strong>Stop Loss:</strong> {formatValue(trade.stop_loss)}</div>
          <div><strong>Take Profit:</strong> {formatValue(trade.take_profit)}</div>
          <div><strong>Commissions:</strong> {formatValue(trade.commissions)}</div>
          <div><strong>Fees:</strong> {formatValue(trade.fees)}</div>
        </div>
      </section>

      {/* 3. POST-TRADE REFLECTION */}
      <section>
        <h3>3. Post-Trade Reflection</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13, marginBottom: 16 }}>
          <div><strong>Pre-Trade Confidence:</strong> {formatValue(trade.confidence_level)}/10</div>
          <div><strong>Focus Level:</strong> {formatValue(trade.focus_level)}/10</div>
          <div><strong>Rule Adherence:</strong> {formatValue(trade.rule_adherence)}/10</div>
          <div><strong>Impulsiveness:</strong> {formatValue(trade.impulsiveness)}/10</div>
          <div><strong>Energy Level:</strong> {formatValue(trade.energy_level)}/10</div>
          <div><strong>Market Context Awareness:</strong> {formatValue(trade.market_context)}/10</div>
          <div><strong>Trade Outcome Satisfaction:</strong> {formatValue(trade.outcome_satisfaction)}/10</div>
          <div><strong>Fear Level:</strong> {formatValue(trade.fear_level)}/10</div>
          <div><strong>Greed Level:</strong> {formatValue(trade.greed_level)}/10</div>
          <div><strong>Pre-Trade Emotional State:</strong> {formatValue(trade.mental_state)}</div>
          <div><strong>Exit Reason:</strong> {formatValue(trade.exit_reason)}</div>
          <div><strong>Post-Trade Emotion:</strong> {formatValue(trade.post_trade_emotion)}</div>
        </div>

        <div style={{ marginTop: 16 }}>
          <strong>What did I learn from this trade?</strong>
          <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{formatValue(trade.post_trade_reflection)}</p>
        </div>

        <div style={{ marginTop: 16 }}>
          <strong>What would I do differently next time?</strong>
          <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{formatValue(trade.what_to_improve)}</p>
        </div>
      </section>

      <button 
        onClick={onEdit} 
        style={{width: "100%", padding: 16, background: "#4f8ef7", color: "white", border: "none", borderRadius: 8, marginTop: 28, fontWeight: 600, cursor: "pointer"}}
      >
        ✎ Edit Trade
      </button>
    </div>
  );
}

function TradeEditForm({ editedForm, setEditedForm, onSave, onCancel, accounts, customStrategies }) {
  const builtInList = [
    { label: "Reversal Candle", value: "Reversal_Candle" },
    { label: "Bull Flag or Pennant", value: "Bull_Flag_or_Pennant" },
    { label: "Bear Flag or Pennant", value: "Bear_Flag_or_Pennant" },
    { label: "Support/Resistance Break", value: "Support_Resistance_Break" },
    { label: "Moving Average Cross", value: "Moving_Average_Cross" },
    { label: "Breakout with Volume", value: "Breakout_with_Volume" },
    { label: "Gap Fill", value: "Gap_Fill" },
  ];

  const fmt$ = (num) => {
    const n = parseFloat(num) || 0;
    return n >= 0 ? `$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
  };

  const estPnl = editedForm.entry_price && editedForm.exit_price && editedForm.position_size
    ? editedForm.direction === "Long"
      ? (editedForm.exit_price - editedForm.entry_price) * editedForm.position_size - (parseFloat(editedForm.commissions) || 0) - (parseFloat(editedForm.fees) || 0)
      : (editedForm.entry_price - editedForm.exit_price) * editedForm.position_size - (parseFloat(editedForm.commissions) || 0) - (parseFloat(editedForm.fees) || 0)
    : 0;

  return (
    <div style={{ fontSize: 13 }}>
      {/* ACCOUNT SELECTOR */}
      <div style={{marginBottom: 28}}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Account</label>
        <select value={editedForm.account_id || ''} onChange={e => setEditedForm({...editedForm, account_id: e.target.value})}>
          <option value="">Select...</option>
          {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
        </select>
      </div>

      {/* 1. PRE-TRADE */}
      <div style={{marginBottom: 28}}>
        <h4 style={{color: "#8a9ba8", marginBottom: 12}}>1. Pre-Trade</h4>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16}}>
          <div>
            <label>Market Condition</label>
            <select value={editedForm.market_condition || ''} onChange={e => setEditedForm({...editedForm, market_condition: e.target.value})}>
              <option value="">Select...</option>
              <option value="Trending Up">Trending Up</option>
              <option value="Trending Down">Trending Down</option>
              <option value="Ranging">Ranging</option>
              <option value="Volatile">Volatile</option>
            </select>
          </div>
          <div>
            <label>Entry Signal</label>
            <select value={editedForm.entry_signal || ''} onChange={e => setEditedForm({...editedForm, entry_signal: e.target.value})}>
              <option value="">Select...</option>
              {builtInList.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              {customStrategies.map(strat => <option key={strat.id} value={strat.name}>{strat.name}</option>)}
            </select>
          </div>
          <div>
            <label>Conviction Level</label>
            <input type="number" min="1" max="10" value={editedForm.conviction_level || ''} onChange={e => setEditedForm({...editedForm, conviction_level: parseInt(e.target.value)})} />
          </div>
          <div>
            <label>News Event</label>
            <select value={editedForm.is_news_event ? 'Yes' : 'No'} onChange={e => setEditedForm({...editedForm, is_news_event: e.target.value === 'Yes'})}>
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. EXECUTION */}
      <div style={{marginBottom: 28}}>
        <h4 style={{color: "#8a9ba8", marginBottom: 12}}>2. Execution</h4>
        
        <div style={{marginBottom: 16}}>
          <label>Symbol</label>
          <input type="text" value={editedForm.symbol || ''} onChange={e => setEditedForm({...editedForm, symbol: e.target.value.toUpperCase()})} />
        </div>

        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16}}>
          <div>
            <label>Direction</label>
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8}}>
              <button 
                onClick={() => setEditedForm({...editedForm, direction: "Long"})}
                style={{padding: 12, background: editedForm.direction === "Long" ? C.green + "30" : "#1a1d2e", border: `1px solid ${editedForm.direction === "Long" ? C.green : C.border}`, color: editedForm.direction === "Long" ? C.green : "#ffffff", borderRadius: 8, cursor: "pointer", fontWeight: 600}}>
                ↑ Long
              </button>
              <button 
                onClick={() => setEditedForm({...editedForm, direction: "Short"})}
                style={{padding: 12, background: editedForm.direction === "Short" ? C.red + "30" : "#1a1d2e", border: `1px solid ${editedForm.direction === "Short" ? C.red : C.border}`, color: editedForm.direction === "Short" ? C.red : "#ffffff", borderRadius: 8, cursor: "pointer", fontWeight: 600}}>
                ↓ Short
              </button>
            </div>
          </div>
          <div>
            <label>Trade Date</label>
            <input type="date" value={editedForm.trade_date || ''} onChange={e => setEditedForm({...editedForm, trade_date: e.target.value})} />
          </div>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16}}>
          <div>
            <label>Position Size</label>
            <input type="number" value={editedForm.position_size || ''} onChange={e => setEditedForm({...editedForm, position_size: e.target.value})} />
          </div>
          <div>
            <label>Entry Time (HH:MM:SS.mmm)</label>
            <input type="text" placeholder="HH:MM:SS.mmm" value={editedForm.entry_time || ''} maxLength="12" onChange={e => setEditedForm({...editedForm, entry_time: e.target.value})} />
          </div>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16}}>
          <div>
            <label>Exit Time (HH:MM:SS.mmm)</label>
            <input type="text" placeholder="HH:MM:SS.mmm" value={editedForm.exit_time || ''} maxLength="12" onChange={e => setEditedForm({...editedForm, exit_time: e.target.value})} />
          </div>
          <div>
            <label>Entry Price</label>
            <input type="number" step="0.01" value={editedForm.entry_price || ''} onChange={e => setEditedForm({...editedForm, entry_price: e.target.value})} />
          </div>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16}}>
          <div>
            <label>Exit Price</label>
            <input type="number" step="0.01" value={editedForm.exit_price || ''} onChange={e => setEditedForm({...editedForm, exit_price: e.target.value})} />
          </div>
          <div>
            <label>Stop Loss</label>
            <input type="number" step="0.01" value={editedForm.stop_loss || ''} onChange={e => setEditedForm({...editedForm, stop_loss: e.target.value})} />
          </div>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16}}>
          <div>
            <label>Take Profit</label>
            <input type="number" step="0.01" value={editedForm.take_profit || ''} onChange={e => setEditedForm({...editedForm, take_profit: e.target.value})} />
          </div>
          <div>
            <label>Commissions</label>
            <input type="number" step="0.01" value={editedForm.commissions || ''} onChange={e => setEditedForm({...editedForm, commissions: e.target.value})} />
          </div>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16}}>
          <div>
            <label>Fees</label>
            <input type="number" step="0.01" value={editedForm.fees || ''} onChange={e => setEditedForm({...editedForm, fees: e.target.value})} />
          </div>
        </div>

        {estPnl !== 0 && (
          <div style={{ margin: "16px 0", padding: 12, background: estPnl > 0 ? C.green + "20" : C.red + "20", color: estPnl > 0 ? C.green : C.red, borderRadius: 8, textAlign: "center", fontWeight: 700 }}>
            Estimated P&L: {fmt$(estPnl)}
          </div>
        )}
      </div>

      {/* 3. POST-TRADE REFLECTION */}
      <div style={{marginBottom: 28}}>
        <h4 style={{color: "#8a9ba8", marginBottom: 12}}>3. Post-Trade Reflection</h4>
        
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16}}>
          <div>
            <label>Pre-Trade Confidence (1-10)</label>
            <input type="number" min="1" max="10" value={editedForm.confidence_level || ''} onChange={e => setEditedForm({...editedForm, confidence_level: parseInt(e.target.value)})} />
          </div>
          <div>
            <label>Focus Level (1-10)</label>
            <input type="number" min="1" max="10" value={editedForm.focus_level || ''} onChange={e => setEditedForm({...editedForm, focus_level: parseInt(e.target.value)})} />
          </div>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16}}>
          <div>
            <label>Rule Adherence (1-10)</label>
            <input type="number" min="1" max="10" value={editedForm.rule_adherence || ''} onChange={e => setEditedForm({...editedForm, rule_adherence: parseInt(e.target.value)})} />
          </div>
          <div>
            <label>Impulsiveness (1-10)</label>
            <input type="number" min="1" max="10" value={editedForm.impulsiveness || ''} onChange={e => setEditedForm({...editedForm, impulsiveness: parseInt(e.target.value)})} />
          </div>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16}}>
          <div>
            <label>Energy Level (1-10)</label>
            <input type="number" min="1" max="10" value={editedForm.energy_level || ''} onChange={e => setEditedForm({...editedForm, energy_level: parseInt(e.target.value)})} />
          </div>
          <div>
            <label>Market Context Awareness (1-10)</label>
            <input type="number" min="1" max="10" value={editedForm.market_context || ''} onChange={e => setEditedForm({...editedForm, market_context: parseInt(e.target.value)})} />
          </div>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16}}>
          <div>
            <label>Trade Outcome Satisfaction (1-10)</label>
            <input type="number" min="1" max="10" value={editedForm.outcome_satisfaction || ''} onChange={e => setEditedForm({...editedForm, outcome_satisfaction: parseInt(e.target.value)})} />
          </div>
          <div>
            <label>Fear Level (1-10)</label>
            <input type="number" min="1" max="10" value={editedForm.fear_level || ''} onChange={e => setEditedForm({...editedForm, fear_level: parseInt(e.target.value)})} />
          </div>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16}}>
          <div>
            <label>Greed Level (1-10)</label>
            <input type="number" min="1" max="10" value={editedForm.greed_level || ''} onChange={e => setEditedForm({...editedForm, greed_level: parseInt(e.target.value)})} />
          </div>
          <div>
            <label>Pre-Trade Emotional State</label>
            <select value={editedForm.mental_state || ''} onChange={e => setEditedForm({...editedForm, mental_state: e.target.value})}>
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
        </div>

        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16}}>
          <div>
            <label>Exit Reason</label>
            <select value={editedForm.exit_reason || ''} onChange={e => setEditedForm({...editedForm, exit_reason: e.target.value})}>
              <option value="">Select...</option>
              <option value="target_hit">Target Hit</option>
              <option value="stop_hit">Stop Hit</option>
              <option value="manual_exit">Manual Exit</option>
              <option value="time_exit">Time Exit</option>
              <option value="breakeven">Breakeven</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label>Post-Trade Emotion</label>
            <select value={editedForm.post_trade_emotion || ''} onChange={e => setEditedForm({...editedForm, post_trade_emotion: e.target.value})}>
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

        <div style={{marginBottom: 16}}>
          <label>What did I learn from this trade?</label>
          <textarea value={editedForm.post_trade_reflection || ''} onChange={e => setEditedForm({...editedForm, post_trade_reflection: e.target.value})} placeholder="Key takeaway..." style={{ width: "100%", minHeight: 80, padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, background: "#1a1d2e", color: "#ffffff" }} />
        </div>

        <div style={{marginBottom: 16}}>
          <label>What would I do differently next time?</label>
          <textarea value={editedForm.what_to_improve || ''} onChange={e => setEditedForm({...editedForm, what_to_improve: e.target.value})} placeholder="Be specific..." style={{ width: "100%", minHeight: 80, padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, background: "#1a1d2e", color: "#ffffff" }} />
        </div>
      </div>

      {/* BUTTONS */}
      <div style={{display: "flex", gap: 12}}>
        <button onClick={onSave} style={{flex: 1, padding: 16, background: C.green, color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer"}}>
          ✓ Save Changes
        </button>
        <button onClick={onCancel} style={{flex: 1, padding: 16, background: "#1a1d2e", color: "#ffffff", border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 600, cursor: "pointer"}}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export { TradeHistoryModal };
