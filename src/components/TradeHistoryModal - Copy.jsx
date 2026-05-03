// =========================================================================
// TRADE HISTORY MODAL - FULL 3-STAGE VIEW
// Shows ALL fields from TradeEntry (Pre / Execution / Post)
// =========================================================================

import React, { useState, useEffect } from 'react';

export function TradeHistoryModal({ trade, isOpen, onClose, updateTrade }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedForm, setEditedForm] = useState(null);

  if (!isOpen || !trade) return null;

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
                setEditedForm({...trade});
                setIsEditMode(true);
              }} 
            />
          ) : (
            <TradeEditForm 
              trade={trade} 
              editedForm={editedForm} 
              setEditedForm={setEditedForm} 
              onSave={updateTrade}
              onCancel={() => setIsEditMode(false)} 
            />
          )}
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// FULL READ-ONLY VIEW (ALL 3 STAGES)
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
          <div><strong>Symbol:</strong> {trade.symbol}</div>
          <div><strong>Trade Date:</strong> {trade.trade_date}</div>
          <div><strong>Entry Time:</strong> {trade.entry_time || trade.trade_time || '—'}</div>
          <div><strong>Exit Time:</strong> {trade.exit_time || '—'}</div>
          <div><strong>Entry Price:</strong> {trade.entry_price}</div>
          <div><strong>Exit Price:</strong> {trade.exit_price}</div>
          <div><strong>Position Size:</strong> {trade.position_size || 1}</div>
          <div><strong>Commissions:</strong> ${trade.commissions || 0}</div>
          <div><strong>Fees:</strong> ${trade.fees || 0}</div>
          <div><strong>P&L:</strong> <span style={{color: (trade.pnl || 0) >= 0 ? 'green' : 'red'}}>${(trade.pnl || 0).toFixed(2)}</span></div>
        </div>
      </section>

      {/* POST-TRADE */}
      <section className="stage-section">
        <h3>3. Post-Trade Reflection</h3>
        <div className="grid-2">
          <div><strong>Exit Reason:</strong> {trade.exit_reason || '—'}</div>
          <div><strong>Fear Level:</strong> {trade.fear_level || '—'}/10</div>
          <div><strong>Greed Level:</strong> {trade.greed_level || '—'}/10</div>
          <div><strong>Rule Violations:</strong> {trade.rule_violations?.length ? trade.rule_violations.join(', ') : 'None'}</div>
        </div>
        {trade.post_trade_reflection && (
          <div style={{marginTop: 16}}>
            <strong>Reflection:</strong>
            <p style={{marginTop: 8, whiteSpace: "pre-wrap"}}>{trade.post_trade_reflection}</p>
          </div>
        )}
      </section>

      <button onClick={onEdit} style={{width: "100%", padding: 14, background: "#4f8ef7", color: "white", border: "none", borderRadius: 8, marginTop: 20}}>
        Edit Trade
      </button>
    </div>
  );
}

// =========================================================================
// EDIT FORM (optional - you can expand later)
// =========================================================================
function TradeEditForm({ trade, editedForm, setEditedForm, onSave, onCancel }) {
  const handleSave = () => {
    onSave(trade.id, editedForm);
    onCancel();
  };

  return (
    <div>
      <h3>Edit Trade</h3>
      <p>Full edit form coming soon — for now you can expand this.</p>
      <button onClick={handleSave}>Save Changes</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  );
}

export default TradeHistoryModal;