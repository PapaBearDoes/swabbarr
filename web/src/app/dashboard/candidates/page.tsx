'use client';

import { useEffect, useState, useCallback } from 'react';
import { getCandidates, markRemoved } from '@/lib/api';
import { formatBytes, formatScore, timeAgo } from '@/lib/utils';
import { Trash2, CheckCircle } from 'lucide-react';

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [mediaType, setMediaType] = useState('');
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<number | null>(null);
  const perPage = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page), per_page: String(perPage),
        sort_by: 'keep_score', sort_order: 'asc',
      });
      if (mediaType) params.set('media_type', mediaType);
      const data = await getCandidates(params.toString());
      setCandidates(data.scores || []);
      setTotal(data.total || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [page, mediaType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRemove = async (tmdbId: number) => {
    if (!confirm('Mark this title as removed? (Make sure you\'ve already deleted it in Radarr/Sonarr)')) return;
    setRemoving(tmdbId);
    try {
      await markRemoved(tmdbId);
      setCandidates(prev => prev.filter(c => c.tmdb_id !== tmdbId));
      setTotal(prev => prev - 1);
    } catch (e) { console.error(e); }
    setRemoving(null);
  };

  const totalSize = candidates.reduce((sum, c) => sum + (c.file_size_bytes || 0), 0);
  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Removal Candidates</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14 }}>
        Titles scoring below threshold. Delete in Radarr/Sonarr first, then mark as removed here.
      </p>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Candidates</div>
          <div className="stat-value" style={{ color: 'var(--score-low)' }}>{total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Reclaimable (this page)</div>
          <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>{formatBytes(totalSize)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Filter</div>
          <select className="filter-select" style={{ marginTop: 8 }} value={mediaType} onChange={e => { setMediaType(e.target.value); setPage(1); }}>
            <option value="">All Types</option>
            <option value="movie">Movies</option>
            <option value="series">TV Series</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Score</th>
              <th>Size</th>
              <th>Watch Activity</th>
              <th>Request</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Loading...</td></tr>
            ) : candidates.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                <CheckCircle size={32} style={{ marginBottom: 8, opacity: 0.5 }} /><br />No removal candidates. Your library is in good shape!
              </td></tr>
            ) : candidates.map((c: any) => (
              <tr key={c.tmdb_id}>
                <td><div style={{ fontWeight: 600 }}>{c.title}</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.year}</div></td>
                <td><span style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{c.media_type}</span></td>
                <td><span className="score-badge score-low">{formatScore(c.keep_score)}</span></td>
                <td>{formatBytes(c.file_size_bytes)}</td>
                <td><span style={{ fontSize: 13 }}>{formatScore(c.watch_activity_score || 0)}</span></td>
                <td><span style={{ fontSize: 13 }}>{formatScore(c.request_score || 0)}</span></td>
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => handleRemove(c.tmdb_id)} disabled={removing === c.tmdb_id}>
                    <Trash2 size={14} /> {removing === c.tmdb_id ? 'Removing...' : 'Mark Removed'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button className="btn btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
          <span style={{ padding: '4px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
          <button className="btn btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
        </div>
      )}
    </div>
  );
}
