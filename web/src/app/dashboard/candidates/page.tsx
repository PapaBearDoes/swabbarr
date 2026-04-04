'use client';

import { useEffect, useState, useCallback } from 'react';
import { getCandidates, markRemoved, batchMarkRemoved, exportCandidatesCSV, protectTitle } from '@/lib/api';
import { formatBytes, formatScore, seriesStatusInfo } from '@/lib/utils';
import { Trash2, CheckCircle, Download, Shield, Film, Tv, Sparkles } from 'lucide-react';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w154';

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [mediaType, setMediaType] = useState('');
  const [arrSource, setArrSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchRemoving, setBatchRemoving] = useState(false);
  const [protecting, setProtecting] = useState<number | null>(null);
  const perPage = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page), per_page: String(perPage),
        sort_by: 'keep_score', sort_order: 'asc',
      });
      if (mediaType) params.set('media_type', mediaType);
      if (arrSource) params.set('arr_source', arrSource);
      const data = await getCandidates(params.toString());
      setCandidates(data.scores || []);
      setTotal(data.total || 0);
      setSelected(new Set());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [page, mediaType, arrSource]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRemove = async (tmdbId: number) => {
    if (!confirm('Mark this title as removed? (Make sure you\'ve deleted it in Radarr/Sonarr first)')) return;
    setRemoving(tmdbId);
    try {
      await markRemoved(tmdbId);
      setCandidates(prev => prev.filter(c => c.tmdb_id !== tmdbId));
      setTotal(prev => prev - 1);
      setSelected(prev => { const s = new Set(prev); s.delete(tmdbId); return s; });
    } catch (e) { console.error(e); }
    setRemoving(null);
  };

  const handleBatchRemove = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Mark ${selected.size} titles as removed? (Make sure you've deleted them in Radarr/Sonarr first)`)) return;
    setBatchRemoving(true);
    try {
      await batchMarkRemoved(Array.from(selected));
      setCandidates(prev => prev.filter(c => !selected.has(c.tmdb_id)));
      setTotal(prev => prev - selected.size);
      setSelected(new Set());
    } catch (e) { console.error(e); }
    setBatchRemoving(false);
  };

  const handleProtect = async (tmdbId: number, title: string) => {
    const reason = prompt(`Protect "${title}"?\n\nOptional: enter a reason (or leave blank):`);
    if (reason === null) return;
    setProtecting(tmdbId);
    try {
      await protectTitle(tmdbId, reason || undefined);
      setCandidates(prev => prev.filter(c => c.tmdb_id !== tmdbId));
      setTotal(prev => prev - 1);
      setSelected(prev => { const s = new Set(prev); s.delete(tmdbId); return s; });
    } catch (e) { console.error(e); }
    setProtecting(null);
  };

  const toggleSelect = (tmdbId: number) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(tmdbId)) s.delete(tmdbId); else s.add(tmdbId);
      return s;
    });
  };

  const toggleAll = () => {
    if (selected.size === candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map(c => c.tmdb_id)));
    }
  };

  const totalSize = candidates.reduce((sum, c) => sum + (c.file_size_bytes || 0), 0);
  const selectedSize = candidates.filter(c => selected.has(c.tmdb_id)).reduce((s, c) => s + (c.file_size_bytes || 0), 0);
  const totalPages = Math.ceil(total / perPage);

  const typeIcon = (c: any) => {
    if (c.arr_source === 'sonarr-anime') return <Sparkles size={12} />;
    if (c.media_type === 'series') return <Tv size={12} />;
    return <Film size={12} />;
  };

  const typeLabel = (c: any) => {
    if (c.arr_source === 'sonarr-anime') return 'Anime';
    if (c.media_type === 'series') return 'Series';
    return 'Movie';
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Removal Candidates</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            Titles scoring below threshold. Delete in Radarr/Sonarr first, then mark as removed here.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={exportCandidatesCSV()} className="btn btn-sm" download>
            <Download size={14} /> Export CSV
          </a>
          {selected.size > 0 && (
            <button className="btn btn-danger" onClick={handleBatchRemove} disabled={batchRemoving}>
              <Trash2 size={14} /> {batchRemoving ? 'Removing...' : `Remove ${selected.size} Selected (${formatBytes(selectedSize)})`}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 16 }}>
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
          <select className="filter-select" style={{ marginTop: 8 }} value={`${mediaType}|${arrSource}`} onChange={e => {
            const [mt, as_] = e.target.value.split('|');
            setMediaType(mt);
            setArrSource(as_);
            setPage(1);
          }}>
            <option value="|">All Types</option>
            <option value="movie|">Movies</option>
            <option value="series|sonarr">TV Series</option>
            <option value="series|sonarr-anime">Anime</option>
            <option value="series|">All Series</option>
          </select>
        </div>
      </div>

      {/* Select all bar */}
      {candidates.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
          padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 8,
          border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-secondary)',
        }}>
          <input
            type="checkbox"
            checked={selected.size === candidates.length && candidates.length > 0}
            onChange={toggleAll}
            style={{ accentColor: 'var(--accent-teal)' }}
          />
          <span>
            {selected.size > 0
              ? `${selected.size} selected (${formatBytes(selectedSize)})`
              : 'Select all'}
          </span>
        </div>
      )}

      {/* Card grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>Loading...</div>
      ) : candidates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
          <CheckCircle size={36} style={{ marginBottom: 12, opacity: 0.5 }} />
          <div>No removal candidates. Your library is in good shape!</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}>
          {candidates.map((c: any) => {
            const si = c.media_type === 'series' ? seriesStatusInfo(c.series_status) : null;
            const isSelected = selected.has(c.tmdb_id);
            return (
              <div
                key={c.tmdb_id}
                className="card"
                style={{
                  padding: 0, overflow: 'hidden', position: 'relative',
                  outline: isSelected ? '2px solid var(--accent-teal)' : 'none',
                  outlineOffset: -2,
                }}
              >
                {/* Top row: poster + info */}
                <div style={{ display: 'flex', gap: 12, padding: 12 }}>
                  {/* Checkbox overlay */}
                  <div style={{
                    position: 'absolute', top: 8, left: 8, zIndex: 2,
                  }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(c.tmdb_id)}
                      style={{ accentColor: 'var(--accent-teal)', width: 16, height: 16, cursor: 'pointer' }}
                    />
                  </div>
                  {/* Poster */}
                  <a
                    href={`https://www.themoviedb.org/${c.media_type === 'series' ? 'tv' : 'movie'}/${c.tmdb_id}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ flexShrink: 0 }}
                  >
                    {c.poster_url ? (
                      <img
                        src={`${TMDB_IMG}${c.poster_url}`}
                        alt={c.title}
                        width={68} height={102}
                        style={{
                          borderRadius: 6, objectFit: 'cover',
                          background: 'var(--bg-input)',
                        }}
                        loading="lazy"
                      />
                    ) : (
                      <div style={{
                        width: 68, height: 102, borderRadius: 6,
                        background: 'var(--bg-input)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-disabled)',
                      }}>
                        {typeIcon(c)}
                      </div>
                    )}
                  </a>
                  {/* Title + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a
                      href={`https://www.themoviedb.org/${c.media_type === 'series' ? 'tv' : 'movie'}/${c.tmdb_id}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        fontWeight: 700, fontSize: 15, color: 'var(--text-primary)',
                        textDecoration: 'none', display: 'block',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-teal)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                    >{c.title}</a>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{c.year}</span>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        {typeIcon(c)} {typeLabel(c)}
                      </span>
                      {si && (
                        <>
                          <span style={{ opacity: 0.4 }}>·</span>
                          <span style={{ color: si.color }}>{si.emoji} {si.label}</span>
                        </>
                      )}
                    </div>
                    {/* Score + size row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <span className="score-badge score-low" style={{ fontSize: 13, padding: '2px 8px' }}>
                        {formatScore(c.keep_score)}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--accent-amber)' }}>
                        {formatBytes(c.file_size_bytes)}
                      </span>
                      {c.episode_count && (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {c.episode_count} eps
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Signal breakdown */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                  borderTop: '1px solid var(--border)',
                  fontSize: 11, textAlign: 'center',
                }}>
                  {[
                    { label: 'Watch', val: c.watch_activity_score },
                    { label: 'Rarity', val: c.rarity_score },
                    { label: 'Request', val: c.request_score },
                    { label: 'Cultural', val: c.cultural_value_score },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '6px 4px', borderRight: '1px solid var(--border)' }}>
                      <div style={{ color: 'var(--text-secondary)', marginBottom: 2 }}>{s.label}</div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatScore(s.val || 0)}</div>
                    </div>
                  ))}
                </div>
                {/* Actions */}
                <div style={{
                  display: 'flex', gap: 6, padding: '8px 12px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => handleProtect(c.tmdb_id, c.title)}
                    disabled={protecting === c.tmdb_id}
                    style={{ flex: 1 }}
                    title="Protect this title"
                  >
                    <Shield size={13} /> {protecting === c.tmdb_id ? '...' : 'Protect'}
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleRemove(c.tmdb_id)}
                    disabled={removing === c.tmdb_id}
                    style={{ flex: 1 }}
                  >
                    <Trash2 size={13} /> {removing === c.tmdb_id ? '...' : 'Remove'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
