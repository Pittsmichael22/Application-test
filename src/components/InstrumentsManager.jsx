import React, { useState, useEffect } from 'react';

const C = {
  border: "#404856",
  muted: "#8a9ba8",
  text: "#e8eaed",
  blue: "#4f8ef7",
  green: "#10b981",
  red: "#ef4444",
  yellow: "#f59e0b",
  sub: "#a8b3ba"
};

function InstrumentsManager({ currentAccountId, supabase, userId }) {
  const [instruments, setInstruments] = useState([]);
  const [accountSettings, setAccountSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [tempSettings, setTempSettings] = useState({});
  const [newInstrument, setNewInstrument] = useState({ symbol: '', display_name: '', category: 'futures', exchange: '', default_tick_size: 0.25, default_tick_value: 5.00 });
  const [showAddForm, setShowAddForm] = useState(false);

// eslint-disable-next-line react-hooks/exhaustive-deps
  // Fetch instruments and current account settings
  useEffect(() => {
    if (!currentAccountId || !userId) return;
    fetchInstruments();
  }, [currentAccountId, userId]);

  const fetchInstruments = async () => {
    setLoading(true);
    try {
      // Fetch all instruments for this user
      const { data: instData, error: instError } = await supabase
        .from('instruments')
        .select('*')
        .eq('user_id', userId);

      if (instError) throw instError;
      setInstruments(instData || []);

      // Fetch account-specific settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('account_instrument_settings')
        .select('*')
        .eq('account_id', currentAccountId);

      if (settingsError) throw settingsError;

      // Create a map of instrument_id -> settings
      const settingsMap = {};
      (settingsData || []).forEach(setting => {
        settingsMap[setting.instrument_id] = setting;
      });
      setAccountSettings(settingsMap);
    } catch (error) {
      console.error('Error fetching instruments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNewInstrument = async () => {
    if (!newInstrument.symbol || !newInstrument.display_name) {
      alert('Symbol and Display Name are required');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('instruments')
        .insert({
          user_id: userId,
          symbol: newInstrument.symbol.toUpperCase(),
          display_name: newInstrument.display_name,
          category: newInstrument.category,
          exchange: newInstrument.exchange,
          default_tick_size: parseFloat(newInstrument.default_tick_size),
          default_tick_value: parseFloat(newInstrument.default_tick_value)
        })
        .select();

      if (error) throw error;

      setInstruments([...instruments, data[0]]);
      setNewInstrument({ symbol: '', display_name: '', category: 'futures', exchange: '', default_tick_size: 0.25, default_tick_value: 5.00 });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding instrument:', error);
      alert('Failed to add instrument');
    }
  };

  const getEffectiveValue = (instrumentId, field) => {
    const setting = accountSettings[instrumentId];
    if (setting && setting[field] !== null) {
      return setting[field];
    }
    const instrument = instruments.find(i => i.id === instrumentId);
    return instrument ? instrument[field === 'tick_size' ? 'default_tick_size' : 'default_tick_value'] : 0;
  };

  const handleEditStart = (instrumentId) => {
    setEditingId(instrumentId);
    const setting = accountSettings[instrumentId] || {};
    setTempSettings({
      tick_size: setting.tick_size !== null && setting.tick_size !== undefined 
        ? setting.tick_size 
        : getEffectiveValue(instrumentId, 'tick_size'),
      tick_value: setting.tick_value !== null && setting.tick_value !== undefined 
        ? setting.tick_value 
        : getEffectiveValue(instrumentId, 'tick_value')
    });
  };

  const handleSaveSettings = async (instrumentId) => {
    try {
      const existingSetting = accountSettings[instrumentId];
      
      if (existingSetting) {
        // Update existing
        await supabase
          .from('account_instrument_settings')
          .update(tempSettings)
          .eq('id', existingSetting.id);
      } else {
        // Insert new
        await supabase
          .from('account_instrument_settings')
          .insert({
            user_id: userId,
            account_id: currentAccountId,
            instrument_id: instrumentId,
            ...tempSettings
          });
      }

      // Update local state
      setAccountSettings(prev => ({
        ...prev,
        [instrumentId]: { ...tempSettings, instrument_id: instrumentId, id: existingSetting?.id }
      }));

      setEditingId(null);
    } catch (error) {
      console.error('Error saving instrument settings:', error);
      alert('Failed to save settings');
    }
  };

  if (loading) return <div style={{ color: C.muted }}>Loading instruments...</div>;

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Instrument Settings for This Account</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '8px 16px',
            background: C.blue,
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          {showAddForm ? '✕ Cancel' : '+ Add Instrument'}
        </button>
      </div>

      {/* Add New Instrument Form */}
      {showAddForm && (
        <div style={{
          padding: 14,
          background: '#1a1d2e',
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          marginBottom: 16
        }}>
          <h4 style={{ marginTop: 0, color: C.text }}>Add New Instrument</h4>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Symbol (e.g., MNQ)</label>
              <input
                type="text"
                placeholder="MNQ"
                value={newInstrument.symbol}
                onChange={e => setNewInstrument({ ...newInstrument, symbol: e.target.value.toUpperCase() })}
                style={{
                  width: '100%',
                  padding: 8,
                  background: '#0a0d14',
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  color: C.text,
                  fontSize: 12
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Display Name</label>
              <input
                type="text"
                placeholder="Micro Nasdaq 100"
                value={newInstrument.display_name}
                onChange={e => setNewInstrument({ ...newInstrument, display_name: e.target.value })}
                style={{
                  width: '100%',
                  padding: 8,
                  background: '#0a0d14',
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  color: C.text,
                  fontSize: 12
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Category</label>
              <select
                value={newInstrument.category}
                onChange={e => setNewInstrument({ ...newInstrument, category: e.target.value })}
                style={{
                  width: '100%',
                  padding: 8,
                  background: '#0a0d14',
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  color: C.text,
                  fontSize: 12
                }}
              >
                <option value="futures">Futures</option>
                <option value="forex">Forex</option>
                <option value="crypto">Crypto</option>
                <option value="stocks">Stocks</option>
                <option value="options">Options</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Exchange</label>
              <input
                type="text"
                placeholder="CME"
                value={newInstrument.exchange}
                onChange={e => setNewInstrument({ ...newInstrument, exchange: e.target.value })}
                style={{
                  width: '100%',
                  padding: 8,
                  background: '#0a0d14',
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  color: C.text,
                  fontSize: 12
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Tick Size</label>
              <input
                type="number"
                step="0.0001"
                value={newInstrument.default_tick_size}
                onChange={e => setNewInstrument({ ...newInstrument, default_tick_size: parseFloat(e.target.value) })}
                style={{
                  width: '100%',
                  padding: 8,
                  background: '#0a0d14',
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  color: C.text,
                  fontSize: 12
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Tick Value ($)</label>
              <input
                type="number"
                step="0.01"
                value={newInstrument.default_tick_value}
                onChange={e => setNewInstrument({ ...newInstrument, default_tick_value: parseFloat(e.target.value) })}
                style={{
                  width: '100%',
                  padding: 8,
                  background: '#0a0d14',
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  color: C.text,
                  fontSize: 12
                }}
              />
            </div>
          </div>

          <button
            onClick={handleAddNewInstrument}
            style={{
              width: '100%',
              padding: 10,
              background: C.green,
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Create Instrument
          </button>
        </div>
      )}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 12
      }}>
        {instruments.map(inst => {
          const isEditing = editingId === inst.id;
          const tickSize = getEffectiveValue(inst.id, 'tick_size');
          const tickValue = getEffectiveValue(inst.id, 'tick_value');
          const isCustomized = accountSettings[inst.id] && 
            (accountSettings[inst.id].tick_size !== null || accountSettings[inst.id].tick_value !== null);

          return (
            <div 
              key={inst.id}
              style={{
                padding: 14,
                background: isCustomized ? '#0f4f2a' : '#1a1d2e',
                border: `1px solid ${isCustomized ? C.green : C.border}`,
                borderRadius: 8
              }}
            >
              <div style={{ marginBottom: 8 }}>
                <strong style={{ fontSize: 14 }}>{inst.symbol}</strong>
                <div style={{ fontSize: 11, color: C.sub }}>{inst.display_name}</div>
              </div>

              {!isEditing ? (
                <>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: C.muted }}>Tick Size:</span> <span>{tickSize}</span>
                  </div>
                  <div style={{ fontSize: 12, marginBottom: 12 }}>
                    <span style={{ color: C.muted }}>Tick Value:</span> <span>${tickValue.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={() => handleEditStart(inst.id)}
                    style={{
                      width: '100%',
                      padding: 8,
                      background: C.blue,
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {isCustomized ? 'Edit' : 'Customize'}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Tick Size</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={tempSettings.tick_size}
                      onChange={e => setTempSettings(prev => ({ ...prev, tick_size: parseFloat(e.target.value) }))}
                      style={{
                        width: '100%',
                        padding: 6,
                        background: '#0a0d14',
                        border: `1px solid ${C.border}`,
                        borderRadius: 4,
                        color: C.text,
                        fontSize: 12
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Tick Value ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempSettings.tick_value}
                      onChange={e => setTempSettings(prev => ({ ...prev, tick_value: parseFloat(e.target.value) }))}
                      style={{
                        width: '100%',
                        padding: 6,
                        background: '#0a0d14',
                        border: `1px solid ${C.border}`,
                        borderRadius: 4,
                        color: C.text,
                        fontSize: 12
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button
                      onClick={() => handleSaveSettings(inst.id)}
                      style={{
                        padding: 8,
                        background: C.green,
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{
                        padding: 8,
                        background: '#1a1d2e',
                        color: C.text,
                        border: `1px solid ${C.border}`,
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: C.sub, padding: 12, background: '#1a1d2e', borderRadius: 8 }}>
        <strong>💡 How it works:</strong>
        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
          <li>Green cards = Custom settings for this account</li>
          <li>Gray cards = Using default settings</li>
          <li>Each account can have different tick sizes/values</li>
          <li>Used to calculate P&L: (exit - entry) / tick_size * tick_value * position_size</li>
        </ul>
      </div>
    </div>
  );
}

export { InstrumentsManager };
