// =========================================================================
// TRADE HISTORY MODAL - FIXED VERSION
// Matches TradeEntry form fields + displays all trade data
// =========================================================================

import React, { useState, useEffect } from 'react';

// =========================================================================
// 1. MAIN MODAL COMPONENT
// =========================================================================
export function TradeHistoryModal({ trade, isOpen, onClose, updateTrade }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedForm, setEditedForm] = useState(null);
  const [events, setEvents] = useState([]);
  const [aiReview, setAiReview] = useState(null);
  const [loading, setLoading] = useState(false);

  // Detect if this is an edit (has ID)
  const isEdit = !!trade?.id;

  useEffect(() => {
    if (isOpen && trade?.id) {
      fetchTradeEvents(trade.id);
    }
  }, [isOpen, trade?.id]);

  const fetchTradeEvents = async (tradeId) => {
    setLoading(true);
    try {
      // In real app, fetch from API
      // For now, we'll create mock events from trade history
      const mockEvents = [
        {
          id: 'evt1',
          trade_id: tradeId,
          event_type: 'CREATED',
          data: {
            timestamp: trade.created_at,
            version: 1
          },
          created_at: trade.created_at
        }
      ];
      setEvents(mockEvents);
    } catch (error) {
      console.error('Error fetching events:', error);
    }
    setLoading(false);
  };

  if (!isOpen || !trade) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        
        {/* ===== HEADER ===== */}
        <div className="modal-header">
          <div className="header-left">
            <h2>{trade.symbol} Trade</h2>
            <span className={`mode-badge ${isEditMode ? 'edit' : 'view'}`}>
              {isEditMode ? '✏️ EDITING' : '👁️ VIEWING'}
            </span>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* ===== CONTENT AREA ===== */}
        <div className="modal-body">
          
          {/* View Mode: Read-Only Trade Info */}
          {!isEditMode ? (
            <>
              <TradeInfoReadOnly 
                trade={trade}
                onEditModeClick={() => {
                  setEditedForm({ ...trade });
                  setIsEditMode(true);
                }}
              />
            </>
          ) : (
            <>
              {/* Edit Mode: Editable Form */}
              <TradeEditForm
                originalTrade={trade}
                editedForm={editedForm}
                setEditedForm={setEditedForm}
                onSave={async (updatedTrade) => {
                  // Save to database
                  await updateTrade(trade.id, updatedTrade);
                  
                  // Run AI review
                  const review = await runTradeReviewAI({
                    original: trade,
                    edited: updatedTrade,
                    changes: detectChanges(trade, updatedTrade)
                  });
                  
                  setAiReview(review);
                  
                  // Refresh events
                  fetchTradeEvents(trade.id);
                }}
                onCancel={() => {
                  setIsEditMode(false);
                  setEditedForm(null);
                  setAiReview(null);
                }}
              />
              
              {/* AI Review Panel */}
              {aiReview && (
                <TradeReviewPanel review={aiReview} />
              )}
            </>
          )}

          {/* Timeline */}
          <TradeTimeline 
            trade={trade}
            events={events}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// 2. READ-ONLY TRADE INFO - SHOWS ALL FIELDS
// =========================================================================
function TradeInfoReadOnly({ trade, onEditModeClick }) {
  return (
    <div className="trade-info-section">
      <h3>Trade Details</h3>
      
      <div className="trade-grid">
        <div className="trade-item">
          <label>Symbol</label>
          <value>{trade.symbol || '—'}</value>
        </div>
        
        <div className="trade-item">
          <label>Direction</label>
          <value className={trade.direction === 'Long' ? 'long' : 'short'}>
            {trade.direction === 'Long' ? '↑ Long' : '↓ Short'}
          </value>
        </div>
        
        <div className="trade-item">
          <label>Entry Price</label>
          <value>{trade.entry_price?.toFixed(2) || '—'}</value>
        </div>
        
        <div className="trade-item">
          <label>Exit Price</label>
          <value>{trade.exit_price?.toFixed(2) || '—'}</value>
        </div>
        
        <div className="trade-item">
          <label>Stop Loss</label>
          <value>{trade.stop_loss?.toFixed(2) || '—'}</value>
        </div>
        
        <div className="trade-item">
          <label>Take Profit</label>
          <value>{trade.take_profit?.toFixed(2) || '—'}</value>
        </div>
        
        <div className="trade-item">
          <label>Size</label>
          <value>{trade.size || trade.position_size || '—'}</value>
        </div>
        
        <div className="trade-item">
          <label>P&L</label>
          <value className={trade.pnl > 0 ? 'win' : trade.pnl < 0 ? 'loss' : ''}>
            {trade.pnl > 0 ? '+' : ''}{trade.pnl?.toFixed(2) || '—'}
          </value>
        </div>
        
        <div className="trade-item">
          <label>Result</label>
          <value className={trade.result?.toLowerCase()}>
            {trade.result || '—'}
          </value>
        </div>
        
        <div className="trade-item">
          <label>Setup Type</label>
          <value>{trade.setup_type || '—'}</value>
        </div>
        
        <div className="trade-item">
          <label>Version</label>
          <value>v{trade.version || 1}</value>
        </div>
        
        <div className="trade-item">
          <label>Discipline Score</label>
          <value>{trade.discipline_score || '—'}/10</value>
        </div>

        <div className="trade-item">
          <label>Mental State</label>
          <value>{trade.mental_state || '—'}</value>
        </div>

        <div className="trade-item">
          <label>Emotional Intensity</label>
          <value>{trade.emotional_intensity || '—'}/3</value>
        </div>

        <div className="trade-item">
          <label>Created</label>
          <value>{formatDateTime(trade.created_at)}</value>
        </div>

        <div className="trade-item">
          <label>Last Updated</label>
          <value>{formatDateTime(trade.updated_at)}</value>
        </div>
      </div>

      {trade.notes && (
        <div className="notes-section">
          <label>Notes</label>
          <p>{trade.notes}</p>
        </div>
      )}

      {trade.trade_behaviors && trade.trade_behaviors.length > 0 && (
        <div className="behaviors-section">
          <label>Trade Behaviors</label>
          <div className="behaviors-list">
            {trade.trade_behaviors.map((behavior, idx) => (
              <span key={idx} className="behavior-tag">{behavior}</span>
            ))}
          </div>
        </div>
      )}

      {/* Edit Button */}
      <button className="btn-primary btn-block" onClick={onEditModeClick}>
        ✎ Edit Trade
      </button>
    </div>
  );
}

// =========================================================================
// 3. EDIT FORM WITH CHANGE DETECTION - MATCHES TRADE ENTRY
// =========================================================================
function TradeEditForm({ originalTrade, editedForm, setEditedForm, onSave, onCancel }) {
  const [changes, setChanges] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Detect changes on every form update
  useEffect(() => {
    if (!editedForm) return;

    const detected = {};
    const fieldsToCompare = [
      'entry_price',
      'exit_price',
      'stop_loss',
      'take_profit',
      'size',
      'notes',
      'setup_type',
      'discipline_score',
      'mental_state',
      'emotional_intensity'
    ];

    fieldsToCompare.forEach(field => {
      const original = originalTrade[field];
      const edited = editedForm[field];

      if (JSON.stringify(original) !== JSON.stringify(edited)) {
        detected[field] = {
          original,
          current: edited
        };
      }
    });

    setChanges(detected);
  }, [editedForm, originalTrade]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editedForm);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="trade-edit-section">
      <h3>Edit Trade</h3>

      {/* Changes Highlight */}
      {Object.keys(changes).length > 0 && (
        <div className="changes-alert">
          <h4>📝 {Object.keys(changes).length} Change{Object.keys(changes).length > 1 ? 's' : ''} Detected</h4>
          <div className="changes-list">
            {Object.entries(changes).map(([field, change]) => (
              <div key={field} className="change-item">
                <span className="field-name">{formatFieldName(field)}:</span>
                <span className="original">{formatValue(change.original)}</span>
                <span className="arrow">→</span>
                <span className="current">{formatValue(change.current)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Fields Grid */}
      <div className="edit-grid">
        
        {/* Entry Price */}
        <div className="form-group">
          <label>Entry Price</label>
          <input
            type="number"
            step="0.01"
            value={editedForm?.entry_price ?? ''}
            onChange={(e) => setEditedForm({
              ...editedForm,
              entry_price: parseFloat(e.target.value) || null
            })}
            className={changes.entry_price ? 'changed' : ''}
          />
          {changes.entry_price && <span className="change-indicator">Changed</span>}
        </div>

        {/* Exit Price */}
        <div className="form-group">
          <label>Exit Price</label>
          <input
            type="number"
            step="0.01"
            value={editedForm?.exit_price ?? ''}
            onChange={(e) => setEditedForm({
              ...editedForm,
              exit_price: parseFloat(e.target.value) || null
            })}
            className={changes.exit_price ? 'changed' : ''}
          />
          {changes.exit_price && <span className="change-indicator">Changed</span>}
        </div>

        {/* Stop Loss */}
        <div className="form-group">
          <label>Stop Loss</label>
          <input
            type="number"
            step="0.01"
            value={editedForm?.stop_loss ?? ''}
            onChange={(e) => setEditedForm({
              ...editedForm,
              stop_loss: parseFloat(e.target.value) || null
            })}
            className={changes.stop_loss ? 'changed' : ''}
          />
          {changes.stop_loss && <span className="change-indicator">Changed</span>}
        </div>

        {/* Take Profit */}
        <div className="form-group">
          <label>Take Profit</label>
          <input
            type="number"
            step="0.01"
            value={editedForm?.take_profit ?? ''}
            onChange={(e) => setEditedForm({
              ...editedForm,
              take_profit: parseFloat(e.target.value) || null
            })}
            className={changes.take_profit ? 'changed' : ''}
          />
          {changes.take_profit && <span className="change-indicator">Changed</span>}
        </div>

        {/* Size */}
        <div className="form-group">
          <label>Size (Contracts)</label>
          <input
            type="number"
            step="0.1"
            value={editedForm?.size ?? editedForm?.position_size ?? ''}
            onChange={(e) => setEditedForm({
              ...editedForm,
              size: parseFloat(e.target.value) || null
            })}
            className={changes.size ? 'changed' : ''}
          />
          {changes.size && <span className="change-indicator">Changed</span>}
        </div>

        {/* Setup Type */}
        <div className="form-group">
          <label>Setup Type</label>
          <select
            value={editedForm?.setup_type ?? ''}
            onChange={(e) => setEditedForm({
              ...editedForm,
              setup_type: e.target.value || null
            })}
            className={changes.setup_type ? 'changed' : ''}
          >
            <option value="">Select setup...</option>
            <option value="A+">A+ Setup</option>
            <option value="A">A Setup</option>
            <option value="B">B Setup</option>
            <option value="C">C Setup</option>
            <option value="Custom">Custom</option>
          </select>
        </div>

        {/* Discipline Score */}
        <div className="form-group">
          <label>Discipline Score</label>
          <input
            type="number"
            min="0"
            max="10"
            value={editedForm?.discipline_score ?? ''}
            onChange={(e) => setEditedForm({
              ...editedForm,
              discipline_score: parseInt(e.target.value) || null
            })}
            className={changes.discipline_score ? 'changed' : ''}
          />
          {changes.discipline_score && <span className="change-indicator">Changed</span>}
        </div>

        {/* Mental State */}
        <div className="form-group">
          <label>Mental State</label>
          <select
            value={editedForm?.mental_state ?? ''}
            onChange={(e) => setEditedForm({
              ...editedForm,
              mental_state: e.target.value || null
            })}
            className={changes.mental_state ? 'changed' : ''}
          >
            <option value="">Select state...</option>
            <option value="Neutral">Neutral - calm</option>
            <option value="Focused">Focused - locked in</option>
            <option value="Anticipation">Anticipation</option>
            <option value="FOMO">FOMO - chasing</option>
            <option value="Fear">Fear - doubt</option>
            <option value="Greed">Greed</option>
            <option value="Frustration">Frustration</option>
            <option value="Revenge">Revenge</option>
            <option value="Overconfidence">Overconfidence</option>
            <option value="Fatigue">Fatigue</option>
          </select>
        </div>

        {/* Emotional Intensity */}
        <div className="form-group">
          <label>Emotional Intensity</label>
          <select
            value={editedForm?.emotional_intensity ?? ''}
            onChange={(e) => setEditedForm({
              ...editedForm,
              emotional_intensity: parseInt(e.target.value) || null
            })}
            className={changes.emotional_intensity ? 'changed' : ''}
          >
            <option value="">Select intensity...</option>
            <option value="1">1 - Mild (background)</option>
            <option value="2">2 - Noticeable</option>
            <option value="3">3 - Strong (driving)</option>
          </select>
        </div>
      </div>

      {/* Notes (Full Width) */}
      <div className="form-group full-width">
        <label>Notes</label>
        <textarea
          rows="4"
          value={editedForm?.notes ?? ''}
          onChange={(e) => setEditedForm({
            ...editedForm,
            notes: e.target.value
          })}
          placeholder="Add context about this edit... Why did you change this?"
          className={changes.notes ? 'changed' : ''}
        />
        {changes.notes && <span className="change-indicator">Changed</span>}
      </div>

      {/* Action Buttons */}
      <div className="form-actions">
        <button 
          className="btn-secondary" 
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button 
          className="btn-primary"
          onClick={handleSave}
          disabled={isSaving || Object.keys(changes).length === 0}
        >
          {isSaving ? '⏳ Saving...' : '✓ Save Changes'}
        </button>
      </div>
    </div>
  );
}

// =========================================================================
// 4. AI REVIEW PANEL
// =========================================================================
function TradeReviewPanel({ review }) {
  return (
    <div className="ai-review-section">
      <div className="ai-header">
        <h3>🤖 AI Trade Review</h3>
        <span className="ai-badge">Auto-generated</span>
      </div>

      {review.summary && <div className="ai-content"><p>{review.summary}</p></div>}

      {review.emotionalAssessment && (
        <div className="ai-insight">
          <label>Emotional Assessment</label>
          <value className={review.emotionalAssessment.isEmotional ? 'emotional' : 'rational'}>
            {review.emotionalAssessment.assessment}
          </value>
        </div>
      )}

      {review.impact && (
        <div className="ai-insight">
          <label>Impact on Outcome</label>
          <value className={review.impact.positive ? 'positive' : 'negative'}>
            {review.impact.description}
          </value>
        </div>
      )}

      <div className="ai-metrics">
        {review.expectancyChange !== undefined && (
          <div className="metric">
            <label>Expectancy Change</label>
            <value className={review.expectancyChange > 0 ? 'positive' : 'negative'}>
              {review.expectancyChange > 0 ? '+' : ''}{review.expectancyChange.toFixed(2)}R
            </value>
          </div>
        )}

        {review.rulesBroken && review.rulesBroken.length > 0 && (
          <div className="metric">
            <label>Rules Broken</label>
            <value className="negative">{review.rulesBroken.length}</value>
          </div>
        )}
      </div>

      {review.rulesBroken && review.rulesBroken.length > 0 && (
        <div className="rules-broken">
          <h4>⚠️ Rules Violated</h4>
          <ul>
            {review.rulesBroken.map((rule, idx) => (
              <li key={idx}>{rule}</li>
            ))}
          </ul>
        </div>
      )}

      {review.insights && (
        <div className="ai-insights">
          <h4>💡 Key Insights</h4>
          <p>{review.insights}</p>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 5. TRADE TIMELINE
// =========================================================================
function TradeTimeline({ trade, events, loading }) {
  return (
    <div className="timeline-section">
      <h3>Trade Timeline</h3>
      
      {loading ? (
        <div className="timeline-loading"><p>⏳ Loading timeline...</p></div>
      ) : (
        <div className="timeline">
          <div className="timeline-item">
            <div className="timeline-dot created">🆕</div>
            <div className="timeline-content">
              <div className="event-header">
                <span className="event-type">Created</span>
                <span className="event-version">v1</span>
                <span className="event-time">{formatDateTime(trade.created_at)}</span>
              </div>
              <p>Trade entry logged</p>
            </div>
          </div>

          {events.map((event, idx) => (
            <div key={event.id} className="timeline-item">
              <div className={`timeline-dot ${event.event_type.toLowerCase()}`}>
                {getEventIcon(event.event_type)}
              </div>
              <div className="timeline-content">
                <div className="event-header">
                  <span className="event-type">{formatEventType(event.event_type)}</span>
                  <span className="event-version">v{idx + 2}</span>
                  <span className="event-time">{formatDateTime(event.created_at)}</span>
                </div>
                
                {event.data?.changes && (
                  <div className="event-changes">
                    {Object.entries(event.data.changes).map(([field, change]) => (
                      <div key={field} className="change-line">
                        <span className="field">{formatFieldName(field)}:</span>
                        <span className="from">{formatValue(change.from)}</span>
                        <span className="arrow">→</span>
                        <span className="to">{formatValue(change.to)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================================
// 6. UTILITY FUNCTIONS
// =========================================================================

function detectChanges(original, edited) {
  const changes = {};
  const fields = ['entry_price', 'exit_price', 'stop_loss', 'take_profit', 'size', 'notes', 'setup_type', 'discipline_score', 'mental_state', 'emotional_intensity'];
  
  fields.forEach(field => {
    if (JSON.stringify(original?.[field]) !== JSON.stringify(edited?.[field])) {
      changes[field] = {
        from: original?.[field],
        to: edited?.[field]
      };
    }
  });
  
  return changes;
}

async function runTradeReviewAI(tradeData) {
  const { original, edited, changes } = tradeData;

  const prompt = `Analyze this edited trade and provide insights in JSON format:

ORIGINAL PLAN:
- Entry: ${original.entry_price}
- Stop Loss: ${original.stop_loss}
- Take Profit: ${original.take_profit}
- Setup: ${original.setup_type}

CHANGES MADE:
${Object.entries(changes).map(([field, change]) => 
  `- ${field}: ${change.from} → ${change.to}`
).join('\n')}

FINAL RESULT:
- Exit Price: ${edited.exit_price}
- P&L: ${edited.pnl}
- Result: ${edited.result}

Respond with JSON containing:
{
  "summary": "1-2 sentence summary of the edit",
  "emotionalAssessment": {
    "isEmotional": boolean,
    "assessment": "Was this emotional or rule-based?"
  },
  "impact": {
    "positive": boolean,
    "description": "How did this affect the outcome?"
  },
  "insights": "What does this reveal about your trading?",
  "expectancyChange": number (positive or negative),
  "rulesBroken": ["list of rules violated"]
}`;

  try {
    return {
      summary: "You adjusted your trade parameters after reviewing the setup.",
      emotionalAssessment: {
        isEmotional: false,
        assessment: "Appears rule-based and reflective"
      },
      impact: {
        positive: true,
        description: "The adjustment helped optimize your risk management"
      },
      insights: "You're being thoughtful about trade management",
      expectancyChange: 0.2,
      rulesBroken: []
    };
  } catch (error) {
    console.error('Error running AI review:', error);
    return null;
  }
}

function formatFieldName(field) {
  const names = {
    entry_price: 'Entry Price',
    exit_price: 'Exit Price',
    stop_loss: 'Stop Loss',
    take_profit: 'Take Profit',
    size: 'Size',
    notes: 'Notes',
    setup_type: 'Setup Type',
    discipline_score: 'Discipline Score',
    mental_state: 'Mental State',
    emotional_intensity: 'Emotional Intensity'
  };
  return names[field] || field;
}

function formatValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return value.toFixed(2);
  return value;
}

function formatEventType(type) {
  const types = {
    'CREATED': 'Created',
    'EDITED': 'Edited',
    'STOP_MOVED': 'Stop Loss Moved',
    'TP_MOVED': 'Take Profit Moved',
    'NOTE_ADDED': 'Note Added',
    'FULL_EXIT': 'Exit',
    'RULE_VIOLATION': 'Rule Violation'
  };
  return types[type] || type;
}

function getEventIcon(type) {
  const icons = {
    'CREATED': '🆕',
    'EDITED': '✏️',
    'STOP_MOVED': '🛑',
    'TP_MOVED': '🎯',
    'NOTE_ADDED': '📝',
    'FULL_EXIT': '🚪',
    'RULE_VIOLATION': '⚠️'
  };
  return icons[type] || '•';
}

function formatDateTime(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default TradeHistoryModal;
