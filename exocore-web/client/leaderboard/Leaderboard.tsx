import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './leaderboard.css';

type SortKey = 'xp' | 'level' | 'achievements';

interface Entry {
    rank: number;
    username: string;
    nickname?: string;
    avatarUrl?: string | null;
    role: string;
    plan: string;
    level: number;
    xp: number;
    title: string;
    achievements: number;
    country?: string;
}

const ROLE_LABEL: Record<string, string> = {
    owner: 'OWNER',
    admin: 'ADMIN',
    mod: 'MOD',
    user: 'USER',
};

export default function Leaderboard() {
    const navigate = useNavigate();
    const [entries, setEntries] = useState<Entry[]>([]);
    const [total, setTotal] = useState(0);
    const [sort, setSort] = useState<SortKey>('xp');
    const [limit, setLimit] = useState(50);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [query, setQuery] = useState('');

    const myUsername = useMemo(() => {
        try { return localStorage.getItem('exo_username') || ''; }
        catch { return ''; }
    }, []);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setErr(null);
        (async () => {
            try {
                const { rpc } = await import('../access/rpcClient');
                const data = await rpc.call<any>('leaderboard.list', { sort, limit });
                if (!alive) return;
                if (data?.success) {
                    setEntries(Array.isArray(data.entries) ? data.entries : []);
                    setTotal(data.total || 0);
                } else {
                    setErr(data?.message || 'Failed to load');
                }
            } catch (e: any) {
                if (alive) setErr(e?.message || 'Failed to load');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [sort, limit]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return entries;
        return entries.filter(e =>
            e.username.toLowerCase().includes(q) ||
            (e.nickname || '').toLowerCase().includes(q)
        );
    }, [entries, query]);

    const podium = filtered.slice(0, 3);
    const rest = filtered.slice(3);

    return (
        <div className="lb-page">
            <button className="lb-back" onClick={() => navigate(-1)}>← Back</button>

            <header className="lb-header">
                <div className="lb-header-icon">🏆</div>
                <div>
                    <h1 className="lb-title">Leaderboard</h1>
                    <p className="lb-sub">Top members across Exocore — {total} ranked</p>
                </div>
            </header>

            <div className="lb-controls">
                <div className="lb-tabs">
                    {(['xp', 'level', 'achievements'] as SortKey[]).map(k => (
                        <button
                            key={k}
                            className={`lb-tab${sort === k ? ' on' : ''}`}
                            onClick={() => setSort(k)}
                        >
                            {k === 'xp' ? 'XP' : k === 'level' ? 'Level' : 'Achievements'}
                        </button>
                    ))}
                </div>
                <input
                    className="lb-search"
                    placeholder="Search username…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
                <select
                    className="lb-limit"
                    value={limit}
                    onChange={e => setLimit(parseInt(e.target.value, 10))}
                >
                    <option value={25}>Top 25</option>
                    <option value={50}>Top 50</option>
                    <option value={100}>Top 100</option>
                    <option value={250}>Top 250</option>
                </select>
            </div>

            {loading && <div className="lb-state">Loading…</div>}
            {err && !loading && <div className="lb-state lb-err">{err}</div>}

            {!loading && !err && (
                <>
                    {podium.length > 0 && (
                        <div className="lb-podium">
                            {[1, 0, 2].map(i => {
                                const e = podium[i];
                                if (!e) return <div key={i} className="lb-podium-slot empty" />;
                                const place = i === 0 ? 1 : i === 1 ? 2 : 3;
                                return (
                                    <Link
                                        to={`/u/${e.username}`}
                                        key={e.username}
                                        className={`lb-podium-slot place-${place}`}
                                    >
                                        <div className="lb-medal">{place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉'}</div>
                                        {e.avatarUrl
                                            ? <img className="lb-podium-avatar" src={e.avatarUrl} alt="" />
                                            : <div className="lb-podium-avatar fallback">{(e.nickname || e.username).slice(0, 2).toUpperCase()}</div>
                                        }
                                        <div className="lb-podium-name">{e.nickname || e.username}</div>
                                        <div className="lb-podium-handle">@{e.username}</div>
                                        <div className="lb-podium-xp">{e.xp.toLocaleString()} XP</div>
                                        <div className="lb-podium-meta">Lv {e.level} · {e.title}</div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}

                    <ol className="lb-list">
                        {rest.map(e => (
                            <li
                                key={e.username}
                                className={`lb-row${e.username === myUsername ? ' me' : ''}`}
                            >
                                <span className="lb-rank">#{e.rank}</span>
                                {e.avatarUrl
                                    ? <img className="lb-avatar" src={e.avatarUrl} alt="" />
                                    : <div className="lb-avatar fallback">{(e.nickname || e.username).slice(0, 2).toUpperCase()}</div>
                                }
                                <Link className="lb-name" to={`/u/${e.username}`}>
                                    <span className="lb-display">{e.nickname || e.username}</span>
                                    <span className="lb-handle">@{e.username}</span>
                                </Link>
                                <span className={`lb-badge role-${e.role}`}>{ROLE_LABEL[e.role] || 'USER'}</span>
                                {e.plan === 'exo' && <span className="lb-badge plan-exo">EXO</span>}
                                <span className="lb-stat lb-level" title="Level">Lv {e.level}</span>
                                <span className="lb-stat lb-title" title="Title">{e.title}</span>
                                <span className="lb-stat lb-ach" title="Achievements">🏅 {e.achievements}</span>
                                <span className="lb-stat lb-xp" title="XP">{e.xp.toLocaleString()} XP</span>
                            </li>
                        ))}
                    </ol>

                    {filtered.length === 0 && <div className="lb-state">No members match.</div>}
                </>
            )}
        </div>
    );
}
