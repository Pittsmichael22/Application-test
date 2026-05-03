// =========================================================================
// TRADE HISTORY MODAL - FULL 3-STAGE VIEW + IMPROVED EDIT
// =========================================================================
import React, { useState } from 'react';

export function TradeHistoryModal({ 
  trade, 
  isOpen, 
  onClose, 
  updateTrade, 
  customStrategies = [] 
}) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedForm, setEditedForm] = useState(null);

  if (!isOpen || !trade) return null;

  const handleSave = async () => {
    if (editedForm) {
      await updateTrade(trade.id, editedForm);
    }
    setIsEditMode(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{trade.symbol} — {trade.direction} Trade</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {!isEditMode ? (
            <TradeInfoReadOnly 
              trade={trade} 
              onEdit={() => {
                setEditedForm({ ...trade });
                setIsEditMode(true);
              }} 
            />
          ) : (
            <TradeEditForm 
              editedForm={editedForm} 
              setEditedForm={setEditedForm} 
              onSave={handleSave} 
              onCancel={() => setIsEditMode(false)}
              customStrategies={customStrategies}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// READ-ONLY VIEW
// =========================================================================
function TradeInfoReadOnly({ trade, onEdit }) {
  const formatValue = (value) => value === null || value === undefined || value === '' ? '—' : value;

  return (
    <div className="trade-full-view">
      {/* PRE-TRADE */}
      <section className="stage-section">
        <h3>1. Pre-Trade</h3>
        <div className="grid-2">
          <div><strong>Market Condition:</strong> {formatValue(trade.market_condition)}</div>
          <div><strong>Entry Signal:</strong> {formatValue(trade.entry_signal)}</div>
          <div><strong>Conviction:</strong> {formatValue(trade.conviction_level)}/10</div>
          <div><strong>Focus Level:</strong> {formatValue(trade.focus_level)}/10</div>
          <div><strong>Rule Adherence:</strong> {formatValue(trade.rule_adherence)}/10</div>
          <div><strong>Impulsiveness:</strong> {formatValue(trade.impulsiveness)}/10</div>
          <div><strong>Energy Level:</strong> {formatValue(trade.energy_level)}/10</div>
          <div><strong>Market Context:</strong> {formatValue(trade.market_context)}/10</div>
          <div><strong>Outcome Satisfaction:</strong> {formatValue(trade.outcome_satisfaction)}/10</div>
          <div><strong>Mental State:</strong> {formatValue(trade.mental_state)}</div>
        </div>
      </section>

      {/* EXECUTION */}
      <section className="stage-section">
        <h3>2. Execution</h3>
        <div className="grid-2">
          <div><strong>Trade Date:</strong> {formatValue(trade.trade_date)}</div>
          <div><strong>Entry Time:</strong> {formatValue(trade.entry_time)}</div>
          <div><strong>Exit Time:</strong> {formatValue(trade.exit_time)}</div>
          <div><strong>Entry Price:</strong> {formatValue(trade.entry_price)}</div>
          <div><strong>Exit Price:</strong> {formatValue(trade.exit_price)}</div>
          <div><strong>Stop Loss:</strong> {formatValue(trade.stop_loss)}</div>
          <div><strong>Take Profit:</strong> {formatValue(trade.take_profit)}</div>
          <div><strong>Risk:Reward:</strong> {formatValue(trade.risk_reward)}</div>
          <div><strong>Position Size:</strong> {formatValue(trade.position_size)}</div>
          <div><strong>Setup Type:</strong> {formatValue(trade.setup_type)}</div>
          <div><strong>Duration (min):</strong> {formatValue(trade.duration_minutes)}</div>
        </div>
      </section>

      {/* POST-TRADE REFLECTION */}
      <section className="stage-section">
        <h3>3. Post-Trade Reflection</h3>
        <div className="grid-2">
          <div><strong>Exit Reason:</strong> {formatValue(trade.exit_reason)}</div>
          <div><strong>Fear Level:</strong> {formatValue(trade.fear_level)}/10</div>
          <div><strong>Greed Level:</strong> {formatValue(trade.greed_level)}/10</div>
          <div><strong>Post-Trade Emotion:</strong> {formatValue(trade.post_trade_emotion)}</div>
          <div><strong>Outcome Satisfaction:</strong> {formatValue(trade.outcome_satisfaction)}/10</div>
        </div>

        <div className="notes-section" style={{ marginTop: 20 }}>
          <strong>What did I learn from this trade?</strong>
          <p>{formatValue(trade.post_trade_reflection)}</p>
        </div>

        <div className="notes-section">
          <strong>What would I do differently next time?</strong>
          <p>{formatValue(trade.what_to_improve)}</p>
        </div>
      </section>

      <button 
        onClick={onEdit} 
        style={{width: "100%", padding: 16, background: "#4f8ef7", color: "white", border: "none", borderRadius: 8, marginTop: 28, fontWeight: 600}}
      >
        ✎ Edit Trade
      </button>
    </div>
  );
}

// =========================================================================
// EDIT FORM - FULL VERSION (Matches Stage 3)
// =========================================================================
function TradeEditForm({ editedForm, setEditedForm, onSave, onCancel, customStrategies = [] }) {
  if (!editedForm) return null;

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

  return (
    <div>
      <h3>Edit Trade</h3>

      {/* PRE-TRADE */}
      <div style={{marginBottom: 28}}>
        <h4 style={{color: "#8a9ba8", marginBottom: 12}}>1. Pre-Trade</h4>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16}}>
          <div>
            <label>Conviction Level</label>
            <input type="number" min="1" max="10" value={editedForm.conviction_level || ''} onChange={e => setEditedForm({...editedForm, conviction_level: parseInt(e.target.value)})} />
          </div>
          <div>
            <label>Focus Level</label>
            <input type="number" min="1" max="10" value={editedForm.focus_level || ''} onChange={e => setEditedForm({...editedForm, focus_level: parseInt(e.target.value)})} />
          </div>
          <div>
            <label>Rule Adherence</label>
            <input type="number" min="1" max="10" value={editedForm.rule_adherence || ''} onChange={e => setEditedForm({...editedForm, rule_adherence: parseInt(e.target.value)})} />
          </div>
          <div>
            <label>Impulsiveness</label>
            <input type="number" min="1" max="10" value={editedForm.impulsiveness || ''} onChange={e => setEditedForm({...editedForm, impulsiveness: parseInt(e.target.value)})} />
          </div>
          <div>
            <label>Energy Level</label>
            <input type="number" min="1" max="10" value={editedForm.energy_level || ''} onChange={e => setEditedForm({...editedForm, energy_level: parseInt(e.target.value)})} />
          </div>
          <div>
            <label>Market Context</label>
            <input type="number" min="1" max="10" value={editedForm.market_context || ''} onChange={e => setEditedForm({...editedForm, market_context: parseInt(e.target.value)})} />
          </div>
          <div>
            <label>Outcome Satisfaction</label>
            <input type="number" min="1" max="10" value={editedForm.outcome_satisfaction || ''} onChange={e => setEditedForm({...editedForm, outcome_satisfaction: parseInt(e.target.value)})} />
          </div>
          <div>
            <label>Mental State</label>
            <select value={editedForm.mental_state || ''} onChange={e => setEditedForm({...editedForm, mental_state: e.target.value})}>
              <option value="">Select...</option>
              <option value="Calm">Calm & Focused</option>
              <option value="Anxious">Anxious</option>
              <option value="Excited">Excited</option>
              <option value="Frustrated">Frustrated</option>
              <option value="Overconfident">Overconfident</option>
              <option value="Tired">Tired</option>
              <option value="FOMO">FOMO</option>
            </select>
          </div>
        </div>
      </div>

      {/* EXECUTION - Add your execution fields here if needed */}

      {/* POST-TRADE */}
      <div>
        <h4 style={{color: "#8a9ba8", marginBottom: 12}}>3. Post-Trade Reflection</h4>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16}}>
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
            <label>Fear Level</label>
            <input type="number" min="1" max="10" value={editedForm.fear_level || ''} onChange={e => setEditedForm({...editedForm, fear_level: parseInt(e.target.value)})} />
          </div>
          <div>
            <label>Greed Level</label>
            <input type="number" min="1" max="10" value={editedForm.greed_level || ''} onChange={e => setEditedForm({...editedForm, greed_level: parseInt(e.target.value)})} />
          </div>
          <div>
            <label>Post-Trade Emotion</label>
            <select value={editedForm.post_trade_emotion || ''} onChange={e => setEditedForm({...editedForm, post_trade_emotion: e.target.value})}>
              <option value="">Select...</option>
              <option value="Proud">Proud</option>
              <option value="Relieved">Relieved</option>
              <option value="Regretful">Regretful</option>
              <option value="Angry">Angry</option>
              <option value="Euphoric">Euphoric</option>
              <option value="Numb">Numb</option>
            </select>
          </div>
        </div>

        <div style={{marginTop: 16}}>
          <label>What did I learn from this trade?</label>
          <textarea rows="4" value={editedForm.post_trade_reflection || ''} onChange={e => setEditedForm({...editedForm, post_trade_reflection: e.target.value})} style={{width: "100%", padding: 12, background: "#1a1d2e", color: "#fff", borderRadius: 8}} />
        </div>

        <div style={{marginTop: 16}}>
          <label>What would I do differently next time?</label>
          <textarea rows="4" value={editedForm.what_to_improve || ''} onChange={e => setEditedForm({...editedForm, what_to_improve: e.target.value})} style={{width: "100%", padding: 12, background: "#1a1d2e", color: "#fff", borderRadius: 8}} />
        </div>
      </div>

      <div style={{marginTop: 32, display: "flex", gap: 12}}>
        <button onClick={onCancel} style={{flex: 1, padding: 14, background: "#333", color: "#ccc", border: "none", borderRadius: 8}}>Cancel</button>
        <button onClick={onSave} style={{flex: 1, padding: 14, background: "#4f8ef7", color: "white", border: "none", borderRadius: 8, fontWeight: 600}}>Save Changes</button>
      </div>
    </div>
  );
}

export default TradeHistoryModal;