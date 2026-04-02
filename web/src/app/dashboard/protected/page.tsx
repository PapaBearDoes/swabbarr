'use client';

import { useEffect, useState } from 'react';
import { getProtected, unprotectTitle } from '@/lib/api';
import { formatBytes, timeAgo } from '@/lib/utils';
import { Shield, ShieldOff } from 'lucide-react';

export default function ProtectedPage() {
  const [titles, setTitles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getProtected();
      setTitles(data.protected || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleUnprotect = async (tmdbId: number, title: string) => {
    if (!confirm(`Remove protection from "${title}"?`)) return;
    try {
      await unprotectTitle(tmdbId);
      setTitles(prev => prev.filter(t => t.tmdb_id !== tmdbId));
    } catch (e) { console.error(e); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Protected Titles</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            These titles will never appear as removal candidates, regardless of score.
          </p>
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          <Shield size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
          {titles.length} protected
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Size</th>
              <th>Reason</th>
              <th>Protected Since</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Loading...</td></tr>
            ) : titles.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                No protected titles. You can protect titles from the score table.
              </td></tr>
            ) : titles.map((t: any) => (
              <tr key={t.tmdb_id}>
                <td><div style={{ fontWeight: 600 }}>{t.title}</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.year}</div></td>
                <td><span style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{t.media_type}</span></td>
                <td>{formatBytes(t.file_size_bytes)}</td>
                <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t.reason || '—'}</td>
                <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{timeAgo(t.protected_at)}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => handleUnprotect(t.tmdb_id, t.title)}>
                    <ShieldOff size={14} /> Unprotect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
