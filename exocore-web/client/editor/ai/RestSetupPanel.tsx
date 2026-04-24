import React from 'react';
import { Webhook, Trash2, Save } from 'lucide-react';
import type { RestPreset } from './types';

interface RestSetupPanelProps {
    theme: any;
    restEndpoint: string;
    restQueryParam: string;
    restDataPath: string;
    restPresets: RestPreset[];
    onEndpointChange: (v: string) => void;
    onQueryParamChange: (v: string) => void;
    onDataPathChange: (v: string) => void;
    onLoadPreset: (id: string) => void;
    onSave: () => void;
    onSavePreset: () => void;
    onDeletePreset: (id: string) => void;
}

export const RestSetupPanel: React.FC<RestSetupPanelProps> = ({
    theme, restEndpoint, restQueryParam, restDataPath, restPresets,
    onEndpointChange, onQueryParamChange, onDataPathChange,
    onLoadPreset, onSave, onSavePreset, onDeletePreset,
}) => (
    <div className="setup-panel custom-scrollbar">
        <div className="setup-title"><Webhook size={16}/> Setup REST API</div>
        <p className="setup-desc">Connect Exocore AI to any external REST API.</p>

        {restPresets.length > 0 && (
            <div className="form-group preset-group">
                <label>Load Saved API</label>
                <div className="preset-row">
                    <select onChange={(e) => onLoadPreset(e.target.value)} defaultValue="">
                        <option value="" disabled>-- Select a Preset --</option>
                        {restPresets.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.endpoint.slice(0,15)}...)</option>
                        ))}
                    </select>
                </div>
            </div>
        )}

        <div className="form-group">
            <label>Endpoint URL</label>
            <input
                type="text"
                placeholder="https://exocore/ai?chat="
                value={restEndpoint}
                onChange={(e) => onEndpointChange(e.target.value)}
            />
        </div>

        <div className="form-group">
            <label>Query Parameter</label>
            <input
                type="text"
                placeholder="e.g. ask, q, chat"
                value={restQueryParam}
                onChange={(e) => onQueryParamChange(e.target.value)}
            />
            <span className="hint">The parameter name where your message will be placed (e.g., ?chat=hi).</span>
        </div>

        <div className="form-group">
            <label>Response Data Path</label>
            <input
                type="text"
                placeholder="e.g. description or data.message"
                value={restDataPath}
                onChange={(e) => onDataPathChange(e.target.value)}
            />
            <span className="hint">Specify where the text response is inside `res.data`.</span>
        </div>

        <div className="setup-actions">
            <button className="save-btn" onClick={onSave}>Apply Config</button>
            <button className="secondary-btn" onClick={onSavePreset}><Save size={14}/> Save as Preset</button>
        </div>

        {restPresets.length > 0 && (
            <div className="manage-presets">
                <label style={{ fontSize: '10px', textTransform: 'uppercase', color: theme.textMuted, display: 'block' }}>Manage Presets</label>
                {restPresets.map(p => (
                    <div key={p.id} className="preset-item">
                        <span>{p.name}</span>
                        <button onClick={() => onDeletePreset(p.id)}><Trash2 size={12}/></button>
                    </div>
                ))}
            </div>
        )}
    </div>
);
