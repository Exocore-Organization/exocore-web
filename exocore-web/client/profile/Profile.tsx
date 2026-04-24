import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import './profile.css';

interface PostComment {
    id: string;
    ts: number;
    author: string;
    text: string;
    deleted?: boolean;
}

interface Post {
    id: string;
    ts: number;
    author: string;
    imageUrl: string | null;
    text: string;
    comments: PostComment[];
    deleted?: boolean;
}

interface ProfileData {
    profile: {
        id?: string | number;
        username: string;
        nickname?: string;
        bio?: string;
        country?: string;
        role?: string;
        level?: number;
        xp?: number;
        achievements?: string[];
        plan?: string;
        verified?: boolean;
    };
    avatarUrl: string | null;
    coverUrl: string | null;
    friendsCount: number;
    postsCount: number;
    posts: Post[];
    relation: { isSelf: boolean; isFriend: boolean; outgoing: boolean; incoming: boolean } | null;
}

const ROLE_LABEL: Record<string, string> = { owner: 'OWNER', admin: 'ADMIN', mod: 'MOD', user: 'USER' };

function titleForLevel(lv: number): string {
    const v = Math.max(0, Math.min(1000, Math.floor(lv || 0)));
    if (v < 10) return 'Beginner';
    if (v < 25) return 'Novice';
    if (v < 50) return 'Apprentice';
    if (v < 100) return 'Adept';
    if (v < 200) return 'Expert';
    if (v < 350) return 'Veteran';
    if (v < 500) return 'Elite';
    if (v < 700) return 'Master';
    if (v < 900) return 'Grandmaster';
    if (v < 1000) return 'Legend';
    return 'Mythic';
}

function timeAgo(ts: number): string {
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24); if (d < 30) return `${d}d`;
    return new Date(ts).toLocaleDateString();
}

const Profile: React.FC = () => {
    const { username = '' } = useParams<{ username: string }>();
    const navigate = useNavigate();
    const token = (() => { try { return localStorage.getItem('exo_token'); } catch { return null; } })();

    const [data, setData] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [composerOpen, setComposerOpen] = useState(false);
    const [postText, setPostText] = useState('');
    const [postFile, setPostFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [achCatalog, setAchCatalog] = useState<Record<string, { name: string; desc: string; icon?: string }>>({});
    const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
    const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
    const fileRef = useRef<HTMLInputElement | null>(null);

    const load = async () => {
        try {
            setLoading(true);
            const { rpc } = await import('../access/rpcClient');
            const data = await rpc.call<any>('posts.profile', { username, token: token || undefined });
            setData(data as ProfileData);
            setErr(null);
        } catch (e: any) {
            setErr(e?.message || 'failed to load');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [username]);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const { rpc } = await import('../access/rpcClient');
                const data = await rpc.call<any>('xp.catalog', {});
                if (!alive || !data?.success) return;
                const map: Record<string, { name: string; desc: string; icon?: string }> = {};
                for (const a of (data.achievements || [])) map[a.id] = { name: a.name, desc: a.desc, icon: a.icon };
                setAchCatalog(map);
            } catch {}
        })();
        return () => { alive = false; };
    }, []);

    const isSelf = !!data?.relation?.isSelf;

    const submitPost = async () => {
        if (!token) { navigate('/login'); return; }
        const text = postText.trim();
        if (!text && !postFile) return;
        setBusy(true);
        try {
            const { rpc, rpcFile } = await import('../access/rpcClient');
            await rpc.call('posts.create', {
                token, text,
                file: postFile ? await rpcFile(postFile) : undefined,
            });
            setPostText(''); setPostFile(null); setComposerOpen(false);
            if (fileRef.current) fileRef.current.value = '';
            await load();
        } catch (e: any) {
            alert(e?.message || 'failed to post');
        } finally { setBusy(false); }
    };

    const deletePost = async (id: string) => {
        if (!token || !confirm('Delete this post?')) return;
        try {
            const { rpc } = await import('../access/rpcClient');
            await rpc.call('posts.delete', { token, postId: id });
            await load();
        } catch (e: any) { alert(e?.message || 'failed'); }
    };

    const addComment = async (postId: string) => {
        if (!token) { navigate('/login'); return; }
        const text = (commentDraft[postId] || '').trim();
        if (!text) return;
        try {
            const { rpc } = await import('../access/rpcClient');
            await rpc.call('posts.comment', { token, postId, text });
            setCommentDraft(d => ({ ...d, [postId]: '' }));
            await load();
        } catch (e: any) { alert(e?.message || 'failed'); }
    };

    const friendActionBtn = useMemo(() => {
        if (!data || !data.relation || data.relation.isSelf || !token) return null;
        const friendCall = async (action: 'request' | 'accept' | 'remove' | 'cancel' | 'decline') => {
            try {
                const { rpc } = await import('../access/rpcClient');
                await rpc.call('social.friend', { token, action, target: username });
                load();
            } catch (e: any) { alert(e?.message || 'failed'); }
        };
        if (data.relation.isFriend) {
            return <button className="prof-act" onClick={() => friendCall('remove')}>Unfriend</button>;
        }
        if (data.relation.incoming) {
            return <button className="prof-act primary" onClick={() => friendCall('accept')}>Accept request</button>;
        }
        if (data.relation.outgoing) {
            return <button className="prof-act" onClick={() => friendCall('cancel')}>Cancel request</button>;
        }
        return <button className="prof-act primary" onClick={() => friendCall('request')}>Add friend</button>;
    }, [data, token, username]);

    if (loading) {
        return <div className="prof-page"><div className="prof-loading">Loading…</div></div>;
    }
    if (err || !data) {
        return (
            <div className="prof-page">
                <div className="prof-err">User not found.</div>
                <Link className="prof-back" to="/dashboard">← Back to dashboard</Link>
            </div>
        );
    }

    const p = data.profile;
    const role = (p.role || 'user').toLowerCase();
    const lv = p.level || 0;
    const xp = p.xp || 0;
    const plan = p.plan || 'free';
    const achievements = Array.isArray(p.achievements) ? p.achievements : [];

    // Phase 5 — XP curve: level = floor(sqrt(xp/12))  ⇒  xp(L) = 12·L².
    const xpForLevel = (L: number) => 12 * L * L;
    const curStart = xpForLevel(lv);
    const nextStart = xpForLevel(lv + 1);
    const into = Math.max(0, xp - curStart);
    const span = Math.max(1, nextStart - curStart);
    const pct = Math.min(100, Math.round((into / span) * 100));

    return (
        <div className="prof-page">
            <Link className="prof-back" to="/dashboard">← Dashboard</Link>
            <div className="prof-cover" style={data.coverUrl ? { backgroundImage: `url(${data.coverUrl})` } : undefined}>
                <div className="prof-cover-shade" />
            </div>

            <div className="prof-head">
                <div className="prof-avatar">
                    {data.avatarUrl
                        ? <img src={data.avatarUrl} alt={p.username} />
                        : <span>{(p.nickname || p.username || '?').slice(0, 2).toUpperCase()}</span>
                    }
                </div>
                <div className="prof-meta">
                    <div className="prof-name-row">
                        <h1>{p.nickname || p.username}</h1>
                        <span className={`prof-badge role-${role}`}>{ROLE_LABEL[role] || role.toUpperCase()}</span>
                        {plan === 'exo' && <span className="prof-badge plan-exo">EXO</span>}
                    </div>
                    <div className="prof-handle">@{String(p.username || '').replace(/^@+/, '')}</div>
                    <div className="prof-stats">
                        <span><b>Lv {lv}</b> · {titleForLevel(lv)}</span>
                        <span>· {data.friendsCount} friends</span>
                        <span>· {data.postsCount} posts</span>
                        {p.country && <span>· 🌍 {p.country}</span>}
                    </div>
                    <div className="prof-meta-grid">
                        {p.id != null && (
                            <span className="prof-meta-chip">
                                <span className="k">ID</span>
                                <span className="v mono">{String(p.id)}</span>
                            </span>
                        )}
                        <span className="prof-meta-chip">
                            <span className="k">Plan</span>
                            <span className="v" style={{ color: plan === 'exo' ? '#ffd400' : undefined }}>
                                {plan === 'exo' ? '★ EXO' : 'FREE'}
                            </span>
                        </span>
                        <span className="prof-meta-chip">
                            <span className="k">Status</span>
                            <span className="v" style={{ color: p.verified ? '#2ecc71' : '#888' }}>
                                {p.verified ? '✓ Verified' : 'Unverified'}
                            </span>
                        </span>
                        {isSelf && (
                            <span className="prof-meta-chip">
                                <span className="k">Presence</span>
                                <span className="v" style={{ color: '#2ecc71' }}>● Online</span>
                            </span>
                        )}
                    </div>
                    {p.bio && <div className="prof-bio">{p.bio}</div>}
                    <div className="prof-xpbar" title={`${xp} / ${nextStart} XP`}>
                        <div className="prof-xpbar-fill" style={{ width: `${pct}%` }} />
                        <span className="prof-xpbar-text">{xp} XP · {nextStart - xp} to Lv {lv + 1}</span>
                    </div>
                    {achievements.length > 0 && (
                        <div className="prof-achievements">
                            {achievements.map(id => {
                                const a = achCatalog[id];
                                return (
                                    <span key={id} className="prof-ach" title={a?.desc || id}>
                                        <span className="prof-ach-icon">{a?.icon || '🏅'}</span>
                                        <span className="prof-ach-name">{a?.name || id}</span>
                                    </span>
                                );
                            })}
                        </div>
                    )}
                    <div className="prof-actions">
                        {friendActionBtn}
                        {!isSelf && token && (
                            <button className="prof-act" onClick={() => navigate('/dashboard')}>Open DM</button>
                        )}
                        {isSelf && (
                            <button className="prof-act primary" onClick={() => setComposerOpen(o => !o)}>
                                {composerOpen ? 'Cancel' : '+ New post'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {isSelf && composerOpen && (
                <div className="prof-composer">
                    <textarea
                        placeholder="What's on your mind?  (≤ 500 chars)"
                        maxLength={500}
                        value={postText}
                        onChange={e => setPostText(e.target.value)}
                    />
                    <div className="prof-composer-row">
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            onChange={e => setPostFile(e.target.files?.[0] || null)}
                        />
                        <span className="prof-char-count">{postText.length}/500</span>
                        <button className="prof-act primary" disabled={busy || (!postText.trim() && !postFile)} onClick={submitPost}>
                            {busy ? 'Posting…' : 'Post'}
                        </button>
                    </div>
                </div>
            )}

            <div className="prof-feed">
                {data.posts.length === 0 && (
                    <div className="prof-empty">No posts yet.</div>
                )}
                {data.posts.map(post => (
                    <article key={post.id} className="prof-post">
                        <header>
                            <div className="prof-post-author">
                                {data.avatarUrl
                                    ? <img className="prof-tiny" src={data.avatarUrl} alt="" />
                                    : <span className="prof-tiny tiny-fallback">{(p.username || '?').slice(0, 2).toUpperCase()}</span>}
                                <div>
                                    <Link to={`/u/${p.username}`} className="strong">{p.nickname || p.username}</Link>
                                    <div className="muted">{timeAgo(post.ts)}</div>
                                </div>
                            </div>
                            {(isSelf) && (
                                <button className="prof-act danger small" onClick={() => deletePost(post.id)}>Delete</button>
                            )}
                        </header>
                        {post.text && <div className="prof-post-text">{post.text}</div>}
                        {post.imageUrl && (
                            <div className="prof-post-image">
                                <img src={post.imageUrl} alt="post" loading="lazy" />
                            </div>
                        )}
                        <footer>
                            <button
                                className="prof-link-btn"
                                onClick={() => setOpenComments(s => ({ ...s, [post.id]: !s[post.id] }))}
                            >
                                💬 {post.comments.filter(c => !c.deleted).length} comments
                            </button>
                        </footer>
                        {openComments[post.id] && (
                            <div className="prof-comments">
                                {post.comments.length === 0 && <div className="muted small">Be the first to comment.</div>}
                                {post.comments.map(c => (
                                    <div className="prof-comment" key={c.id}>
                                        <Link to={`/u/${c.author}`} className="strong">@{c.author}</Link>
                                        <span className={c.deleted ? 'deleted' : ''}>
                                            {c.deleted ? '[deleted]' : c.text}
                                        </span>
                                        <span className="muted small">· {timeAgo(c.ts)}</span>
                                    </div>
                                ))}
                                {token && (
                                    <div className="prof-comment-input">
                                        <input
                                            placeholder="Write a comment…"
                                            value={commentDraft[post.id] || ''}
                                            onChange={e => setCommentDraft(d => ({ ...d, [post.id]: e.target.value }))}
                                            onKeyDown={e => { if (e.key === 'Enter') addComment(post.id); }}
                                        />
                                        <button onClick={() => addComment(post.id)}>Send</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </article>
                ))}
            </div>
        </div>
    );
};

export default Profile;
