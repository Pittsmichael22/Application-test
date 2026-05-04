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
  return (
    <div className="trade-full-view">
      {/* PRE-TRADE */}
      <section className="stage-section">
        <h3>1. Pre-Trade</h3>
        <div className="grid-2">
          <div><strong>Market Condition:</strong> {trade.market_condition || '—'}</div>
          <div><strong>Entry Signal:</strong> {trade.entry_signal || '—'}</div>
          <div><strong>Conviction:</strong> {trade.conviction_level || '—'}/10</div>
          <div><strong>News Event:</strong> {trade.is_news_event ? 'Yes' : 'No'}</div>
          <div><strong>Mental State:</strong> {trade.mental_state || '—'}</div>
          <div><strong>Emotional Intensity:</strong> {trade.emotional_intensity || '—'}/10</div>
        </div>
      </section>

      {/* EXECUTION */}
      <section className="stage-section">
        <h3>2. Execution</h3>
        <div className="grid-2">
          <div><strong>Entry Time:</strong> {trade.entry_time || '—'}</div>
          <div><strong>Exit Time:</strong> {trade.exit_time || '—'}</div>
          <div><strong>Entry Price:</strong> {trade.entry_price}</div>
          <div><strong>Exit Price:</strong> {trade.exit_price}</div>
          <div><strong>Stop Loss:</strong> {trade.stop_loss || '—'}</div>
          <div><strong>Take Profit:</strong> {trade.take_profit || '—'}</div>
          <div><strong>Risk:Reward:</strong> {trade.risk_reward || '—'}</div>
          <div><strong>Position Size:</strong> {trade.position_size || 1}</div>
          <div><strong>Commissions:</strong> ${trade.commissions || 0}</div>
          <div><strong>Fees:</strong> ${trade.fees || 0}</div>
        </div>
      </section>

      {/* POST-TRADE */}
      <section className="stage-section">
        <h3>3. Post-Trade Reflection</h3>
        <div className="grid-2">
          <div><strong>Exit Reason:</strong> {trade.exit_reason || '—'}</div>
          <div><strong>Fear Level:</strong> {trade.fear_level || '—'}/10</div>
          <div><strong>Greed Level:</strong> {trade.greed_level || '—'}/10</div>
        </div>
        <div className="notes-section">
          <strong>What did I learn from this trade?</strong>
          <p>{trade.post_trade_reflection || "No reflection entered."}</p>
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
// EDIT FORM - FULL VERSION
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

  return (
    <div>
      <h3>Edit Trade</h3>

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
            <select 
              value={editedForm.entry_signal || ''} 
              onChange={e => setEditedForm({...editedForm, entry_signal: e.target.value})}
            >
              <option value="">Select Strategy / Pattern...</option>
              
              <optgroup label="Price Action Patterns">
                {builtInList
                  .filter(s => ["Breakout_NewHigh", "Pullback_Support", "Reversal_Candle", "InsideBar_Breakout", "Flag_Pennant"].includes(s.value))
                  .map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </optgroup>

              <optgroup label="Trend Following">
                {builtInList
                  .filter(s => ["Trend_Continuation", "MA_Crossover", "EMA_Ribbon"].includes(s.value))
                  .map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </optgroup>

              <optgroup label="Momentum / Volatility">
                {builtInList
                  .filter(s => ["Volume_Spike", "RSI_Divergence", "Bollinger_Squeeze", "VWAP_Reclaim"].includes(s.value))
                  .map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </optgroup>

              <optgroup label="Scalping / Intraday">
                {builtInList
                  .filter(s => ["Scalp_Momentum", "Opening_Range_Breakout", "News_Catalyst"].includes(s.value))
                  .map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </optgroup>

              <optgroup label="Advanced">
                {builtInList
                  .filter(s => ["Confluence_Multiple", "OrderFlow_Delta", "Mean_Reversion"].includes(s.value))
                  .map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </optgroup>

              {customStrategies && customStrategies.length > 0 && (
                <optgroup label="My Custom Strategies">
                  {customStrategies.filter(s => s.enabled !== false).map(s => (
                    <option key={s.id || s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* 2. EXECUTION */}
      <div style={{marginBottom: 28}}>
        <h4 style={{color: "#8a9ba8", marginBottom: 12}}>2. Execution</h4>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16}}>
          <div>
            <label>Entry Time (HH:MM:SS.mmm)</label>
            <input 
              type="text" 
              value={editedForm.entry_time || ''} 
              placeholder="18:05:25.676" 
              onChange={e => setEditedForm({...editedForm, entry_time: formatTime(e.target.value)})} 
            />
          </div>
          <div>
            <label>Exit Time (HH:MM:SS.mmm)</label>
            <input 
              type="text" 
              value={editedForm.exit_time || ''} 
              placeholder="18:12:47.332" 
              onChange={e => setEditedForm({...editedForm, exit_time: formatTime(e.target.value)})} 
            />
          </div>

          <div>
            <label>Entry Price</label>
            <input type="number" step="0.01" value={editedForm.entry_price || ''} onChange={e => setEditedForm({...editedForm, entry_price: parseFloat(e.target.value)})} />
          </div>
          <div>
            <label>Exit Price</label>
            <input type="number" step="0.01" value={editedForm.exit_price || ''} onChange={e => setEditedForm({...editedForm, exit_price: parseFloat(e.target.value)})} />
          </div>

          <div>
            <label>Stop Loss</label>
            <input type="number" step="0.01" value={editedForm.stop_loss || ''} onChange={e => setEditedForm({...editedForm, stop_loss: parseFloat(e.target.value)})} />
          </div>
          <div>
            <label>Take Profit</label>
            <input type="number" step="0.01" value={editedForm.take_profit || ''} onChange={e => setEditedForm({...editedForm, take_profit: parseFloat(e.target.value)})} />
          </div>

          <div>
            <label>Risk:Reward</label>
            <div style={{padding: "12px", background: "#1a1d2e", borderRadius: 8, fontWeight: 600}}>
              {editedForm.risk_reward || '—'}
            </div>
          </div>
          <div>
            <label>Position Size</label>
            <input type="number" value={editedForm.position_size || ''} onChange={e => setEditedForm({...editedForm, position_size: parseFloat(e.target.value)})} />
          </div>
        </div>
      </div>

      {/* 3. POST-TRADE */}
      <div>
        <h4 style={{color: "#8a9ba8", marginBottom: 12}}>3. Post-Trade</h4>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16}}>
          <div>
            <label>Exit Reason</label>
            <select value={editedForm.exit_reason || ''} onChange={e => setEditedForm({...editedForm, exit_reason: e.target.value})}>
              <option value="">Select...</option>
              <option value="Target Hit">Target Hit</option>
              <option value="Stop Hit">Stop Hit</option>
              <option value="Manual Exit">Manual Exit</option>
              <option value="Time Exit">Time Exit</option>
              <option value="Breakeven">Breakeven</option>
              <option value="Other">Other</option>
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
        </div>

        <div style={{marginTop: 16}}>
          <label>What did I learn from this trade?</label>
          <textarea
            rows="5"
            value={editedForm.post_trade_reflection || ''}
            onChange={e => setEditedForm({...editedForm, post_trade_reflection: e.target.value})}
            style={{width: "100%", padding: 12, background: "#1a1d2e", color: "#fff", borderRadius: 8}}
          />
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