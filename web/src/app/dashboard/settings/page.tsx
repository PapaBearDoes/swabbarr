'use client';

import { useEffect, useState } from 'react';
import { getSettings, updateServiceSettings, verifyService } from '@/lib/api';
import { Plug, CheckCircle, XCircle, AlertCircle, Loader, Eye, EyeOff } from 'lucide-react';

interface ServiceState {
  service_name: string;
  display_name: string;
  base_url: string;
  has_api_key: boolean;
  api_key_preview: string;
  enabled: boolean;
  last_verified: string | null;
  verify_status: string;
  // Local edit state
  editUrl: string;
  editKey: string;
  editEnabled: boolean;
  dirty: boolean;
  saving: boolean;
  verifying: boolean;
  showKey: boolean;
}

export default function SettingsPage() {
  const [services, setServices] = useState<ServiceState[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await getSettings();
        setServices((data.services || []).map((s: any) => ({
          ...s,
          editUrl: s.base_url || '',
          editKey: '',
          editEnabled: s.enabled,
          dirty: false,
          saving: false,
          verifying: false,
          showKey: false,
        })));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const updateField = (idx: number, field: string, value: any) => {
    setServices(prev => prev.map((s, i) =>
      i === idx ? { ...s, [field]: value, dirty: true } : s
    ));
    setMessage('');
  };

  const handleToggleEnabled = async (idx: number, enabled: boolean) => {
    const svc = services[idx];
    setServices(prev => prev.map((s, i) =>
      i === idx ? { ...s, editEnabled: enabled, enabled } : s
    ));
    try {
      await updateServiceSettings(svc.service_name, { enabled });
      setMessage(`${svc.display_name} ${enabled ? 'enabled' : 'disabled'}`);
    } catch (e: any) {
      // Revert on failure
      setServices(prev => prev.map((s, i) =>
        i === idx ? { ...s, editEnabled: !enabled, enabled: !enabled } : s
      ));
      setMessage(e.message || 'Failed to update');
    }
  };

  const handleSave = async (idx: number) => {
    const svc = services[idx];
    setServices(prev => prev.map((s, i) => i === idx ? { ...s, saving: true } : s));
    try {
      const update: any = {
        base_url: svc.editUrl || null,
        enabled: svc.editEnabled,
      };
      if (svc.editKey) update.api_key = svc.editKey;
      await updateServiceSettings(svc.service_name, update);
      // Backend auto-enables when an API key is saved
      const nowEnabled = svc.editKey ? true : svc.editEnabled;
      setServices(prev => prev.map((s, i) =>
        i === idx ? {
          ...s, saving: false, dirty: false, editKey: '',
          base_url: svc.editUrl,
          has_api_key: svc.editKey ? true : s.has_api_key,
          enabled: nowEnabled,
          editEnabled: nowEnabled,
        } : s
      ));
      setMessage(`${svc.display_name} settings saved`);
    } catch (e: any) {
      setMessage(e.message || 'Save failed');
      setServices(prev => prev.map((s, i) => i === idx ? { ...s, saving: false } : s));
    }
  };

  const handleVerify = async (idx: number) => {
    const svc = services[idx];
    setServices(prev => prev.map((s, i) => i === idx ? { ...s, verifying: true } : s));
    try {
      const result = await verifyService(svc.service_name);
      setServices(prev => prev.map((s, i) =>
        i === idx ? { ...s, verifying: false, verify_status: result.status } : s
      ));
      setMessage(`${svc.display_name}: ${result.status}`);
    } catch (e: any) {
      setServices(prev => prev.map((s, i) => i === idx ? { ...s, verifying: false, verify_status: 'error' } : s));
      setMessage(e.message || 'Verify failed');
    }
  };

  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'connected': return <CheckCircle size={16} style={{ color: 'var(--score-high)' }} />;
      case 'unreachable': return <XCircle size={16} style={{ color: 'var(--score-low)' }} />;
      case 'error': return <AlertCircle size={16} style={{ color: 'var(--score-low)' }} />;
      case 'not_configured': return <AlertCircle size={16} style={{ color: 'var(--accent-amber)' }} />;
      default: return <AlertCircle size={16} style={{ color: 'var(--text-disabled)' }} />;
    }
  };

  if (loading) return <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading settings...</div>;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Service Settings</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
          Configure connections to your media stack. API keys are encrypted at rest.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {services.map((svc, idx) => (
          <div key={svc.service_name} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Plug size={20} style={{ color: svc.enabled ? 'var(--accent-teal)' : 'var(--text-disabled)' }} />
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>{svc.display_name}</h3>
                <StatusIcon status={svc.verify_status} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{svc.verify_status}</span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={svc.editEnabled} onChange={e => handleToggleEnabled(idx, e.target.checked)} />
                Enabled
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {svc.service_name !== 'tmdb' && (
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Base URL</label>
                  <input
                    type="text" value={svc.editUrl}
                    onChange={e => updateField(idx, 'editUrl', e.target.value)}
                    placeholder="http://10.20.30.x:8181"
                    className="filter-select" style={{ width: '100%', padding: '8px 12px' }}
                  />
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  API Key {svc.has_api_key && <span style={{ color: 'var(--accent-teal)' }}>(set: {svc.api_key_preview})</span>}
                </label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type={svc.showKey ? 'text' : 'password'}
                    value={svc.editKey}
                    onChange={e => updateField(idx, 'editKey', e.target.value)}
                    placeholder={svc.has_api_key ? 'Leave blank to keep current' : 'Enter API key'}
                    className="filter-select" style={{ flex: 1, padding: '8px 12px' }}
                  />
                  <button className="btn btn-sm" onClick={() => updateField(idx, 'showKey', !svc.showKey)} style={{ padding: '8px' }}>
                    {svc.showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => handleSave(idx)} disabled={svc.saving}>
                {svc.saving ? 'Saving...' : 'Save'}
              </button>
              <button className="btn btn-sm" onClick={() => handleVerify(idx)} disabled={svc.verifying || !svc.editUrl && svc.service_name !== 'tmdb'}>
                {svc.verifying ? <><Loader size={14} className="animate-spin" /> Testing...</> : 'Verify Connection'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {message && (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'var(--bg-elevated)', fontSize: 14, color: 'var(--accent-teal)' }}>
          {message}
        </div>
      )}

      <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Where to find your API keys</h3>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <strong>Tautulli:</strong> Settings → Web Interface → API Key<br />
          <strong>Radarr:</strong> Settings → General → API Key<br />
          <strong>Sonarr:</strong> Settings → General → API Key<br />
          <strong>Seerr:</strong> Settings → General → API Key<br />
          <strong>TMDB:</strong> themoviedb.org → Settings → API → Read Access Token
        </div>
      </div>
    </div>
  );
}
