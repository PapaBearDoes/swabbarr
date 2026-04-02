'use client';

import { useEffect, useState, useCallback } from 'react';
import { getRemovalHistory, exportHistoryCSV } from '@/lib/api';
import { formatBytes, formatScore, timeAgo } from '@/lib/utils';
import { Trash2, Download } from 'lucide-react';

export default function HistoryPage() {
  const [removals, setRemovals] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalRemoved, setTotalRemoved] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const perPage = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page), per_page: String(perPage),
      });
      const data = await getRemovalHistory(params.toString());
      setRemovals(data.removals || []);
      setTotal(data.total || 0);
      setTotalRemoved(data.total_removed_bytes || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const reclaimTarget = 7.5 * 1024 ** 4;
  const reclaimPct = Math.min((totalRemoved / reclaimTarget) * 100, 100);
  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Removal History</h1>
        <a href={exportHistoryCSV()} className="btn btn-sm" download>
          <Download size={14} /> Export CSV
        </a>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Total Removed</div>
          <div className="stat-value">{total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Space Reclaimed</div>
          <div className="stat-value" style={{ color: 'var(--accent-teal)' }}>{formatBytes(totalRemoved)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Progress to 7.5 TB Goal</div>
          <div className="stat-value" style={{ color: 'var(--accent-teal)' }}>{reclaimPct.toFixed(1)}%</div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${reclaimPct}%` }} /></div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Final Score</th>
              <th>Size Freed</th>
              <th>Removed</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Loading...</td></tr>
            ) : removals.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                <Trash2 size={32} style={{ marginBottom: 8, opacity: 0.5 }} /><br />No removals yet.
              </td></tr>
            ) : removals.map((r: any, i: number) => (
              <tr key={i}>
                <td><div style={{ fontWeight: 600 }}>{r.title}</div></td>
                <td><span style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{r.media_type}</span></td>
                <td>{r.final_keep_score != null ? <span className="score-badge score-low">{formatScore(r.final_keep_score)}</span> : '—'}</td>
                <td style={{ color: 'var(--accent-teal)', fontWeight: 600 }}>{formatBytes(r.file_size_bytes)}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{timeAgo(r.removed_at)}</td>
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
