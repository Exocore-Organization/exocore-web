import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import Swal from "sweetalert2";
import { useSocial, PresenceUser, Role, FriendUser } from "./useSocial";
import { RichText } from "./RichText";
import "./social.css";

const exoSwal = Swal.mixin({
  background: "#15151a",
  color: "#eaeaea",
  iconColor: "#ffd400",
  confirmButtonColor: "#ffd400",
  cancelButtonColor: "#2a2a2a",
  customClass: {
    popup: "exo-swal-popup",
    confirmButton: "exo-swal-confirm",
    cancelButton: "exo-swal-cancel",
    input: "exo-swal-input",
    title: "exo-swal-title",
  },
  buttonsStyling: false,
});

async function exoConfirm(message: string, title = "Confirm"): Promise<boolean> {
  const r = await exoSwal.fire({
    title, text: message, icon: "question",
    showCancelButton: true, confirmButtonText: "Yes", cancelButtonText: "Cancel",
  });
  return !!r.isConfirmed;
}

async function exoPrompt(message: string, def = ""): Promise<string | null> {
  const r = await exoSwal.fire({
    title: message, input: "text", inputValue: def,
    showCancelButton: true, confirmButtonText: "OK", cancelButtonText: "Cancel",
  });
  return r.isConfirmed ? String(r.value ?? "") : null;
}

const CODE_LANGS: { value: string; label: string }[] = [
  { value: "",           label: "Choose language…" },
  { value: "js",         label: "JavaScript" },
  { value: "ts",         label: "TypeScript" },
  { value: "tsx",        label: "TSX" },
  { value: "jsx",        label: "JSX" },
  { value: "py",         label: "Python" },
  { value: "java",       label: "Java" },
  { value: "c",          label: "C" },
  { value: "cpp",        label: "C++" },
  { value: "cs",         label: "C#" },
  { value: "go",         label: "Go" },
  { value: "rs",         label: "Rust" },
  { value: "rb",         label: "Ruby" },
  { value: "php",        label: "PHP" },
  { value: "swift",      label: "Swift" },
  { value: "kt",         label: "Kotlin" },
  { value: "html",       label: "HTML" },
  { value: "css",        label: "CSS" },
  { value: "json",       label: "JSON" },
  { value: "yaml",       label: "YAML" },
  { value: "sql",        label: "SQL" },
  { value: "bash",       label: "Bash" },
  { value: "lua",        label: "Lua" },
  { value: "dart",       label: "Dart" },
  { value: "r",          label: "R" },
  { value: "md",         label: "Markdown" },
];

const ROLE_TITLES: Record<string, string> = { owner: "OWNER", admin: "ADMIN", mod: "MOD", user: "USER" };

const ROLE_BUBBLE_COLOR: Record<string, string> = {
  owner: "#ffd400", admin: "#ff5b5b", mod: "#5bc0ff", system: "#888", user: "#3a3a3a",
};

const REACTIONS: { key: string; emoji: string; label: string; color: string }[] = [
  { key: "like",  emoji: "👍", label: "Like",  color: "#5bc0ff" },
  { key: "love",  emoji: "❤️", label: "Love",  color: "#ff5b8a" },
  { key: "haha",  emoji: "😂", label: "Haha",  color: "#ffd400" },
  { key: "wow",   emoji: "😮", label: "Wow",   color: "#b388ff" },
  { key: "sad",   emoji: "😢", label: "Sad",   color: "#7ec0ee" },
  { key: "angry", emoji: "😡", label: "Angry", color: "#ff7a45" },
];

const QUICK_EMOJIS = [
  "😀","😂","🥹","😍","😘","🤩","🥳","😎","🤔","😇",
  "😭","😡","🥶","🤯","🤝","👏","🙏","💪","👍","👎",
  "❤️","🔥","✨","🎉","💯","💀","👀","🚀","🌈","☕",
];

const stripAt = (s?: string) => String(s || "").replace(/^@+/, "");

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d`;
  return new Date(ts).toLocaleDateString();
}

const Avatar: React.FC<{ name?: string; role?: string; size?: number; src?: string | null }> = ({ name = "?", role = "user", size = 28, src }) => {
  const initials = stripAt(name).slice(0, 2).toUpperCase() || "?";
  const bg = ROLE_BUBBLE_COLOR[(role || "user").toLowerCase()] || "#3a3a3a";
  if (src) {
    return (
      <img
        className="chat-avatar chat-avatar-img"
        src={src}
        alt={name}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="chat-avatar"
      style={{
        width: size, height: size, lineHeight: `${size}px`,
        background: bg, color: bg === "#ffd400" || bg === "#5bc0ff" ? "#111" : "#fff",
        fontSize: size * 0.4,
      }}
    >{initials}</span>
  );
};

const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const r = (role || "user").toLowerCase();
  return <span className={`role-badge ${r}`}>{ROLE_TITLES[r] || r.toUpperCase()}</span>;
};

interface FeedComment { id: string; ts: number; author: string; text: string; deleted?: boolean }
interface FeedPost {
  id: string; ts: number; author: string;
  imageUrl: string | null; text: string;
  comments: FeedComment[];
  reactions?: Record<string, string[]>;
  deleted?: boolean;
}

interface Props { token: string | null }

type Tab = "chat" | "dms" | "friends" | "people" | "feed";

const SocialPanel: React.FC<Props> = ({ token }) => {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [draft, setDraft] = useState("");
  const [dmDraft, setDmDraft] = useState("");
  const [activeDM, setActiveDM] = useState<string | null>(null);
  const [friendQuery, setFriendQuery] = useState("");
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedErr, setFeedErr] = useState<string | null>(null);
  const [reactPickerFor, setReactPickerFor] = useState<string | null>(null);
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [feedComposerText, setFeedComposerText] = useState("");
  const [feedComposerFile, setFeedComposerFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const [avatarMap, setAvatarMap] = useState<Record<string, string | null>>({});
  const avatarRequestedRef = useRef<Set<string>>(new Set());
  const social = useSocial({ token, enabled: !!token });

  // Batch-fetch avatars for usernames we don't yet have. Throttled with rAF debounce.
  const requestAvatars = useCallback((names: string[]) => {
    const need = names.filter(n => n && n !== "system" && !avatarRequestedRef.current.has(n));
    if (need.length === 0) return;
    for (const n of need) avatarRequestedRef.current.add(n);
    (async () => {
      try {
        const { rpc } = await import("../access/rpcClient");
        const data = await rpc.call<any>("social.avatars", { usernames: need.join(",") });
        if (data?.success && data.avatars) {
          setAvatarMap(prev => ({ ...prev, ...data.avatars }));
        }
      } catch { /* allow retry next tab */ }
    })();
  }, []);

  const avatarOf = useCallback((u: { username?: string; avatarUrl?: string | null } | undefined | null): string | null => {
    if (!u?.username) return null;
    if (u.avatarUrl) return u.avatarUrl;
    return avatarMap[u.username.toLowerCase()] ?? null;
  }, [avatarMap]);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const dmRef = useRef<HTMLDivElement | null>(null);
  const composerFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [social.chat, open, tab]);

  // Prefetch avatars for everyone visible.
  useEffect(() => {
    const names = new Set<string>();
    for (const m of social.chat) if (m.username && !m.avatarUrl) names.add(m.username);
    for (const u of social.presence) if (!u.avatarUrl) names.add(u.username);
    for (const g of [social.friends.friends, social.friends.incoming, social.friends.outgoing, social.friends.suggestions])
      for (const u of g) if (!u.avatarUrl) names.add(u.username);
    for (const p of feed) {
      if (p.author) names.add(p.author);
      for (const c of (p.comments || [])) if (c.author) names.add(c.author);
    }
    if (names.size > 0) requestAvatars(Array.from(names));
  }, [social.chat, social.presence, social.friends, feed, requestAvatars]);

  useEffect(() => {
    if (dmRef.current) dmRef.current.scrollTop = dmRef.current.scrollHeight;
  }, [social.dmHistory, activeDM]);

  useEffect(() => {
    if (activeDM) social.openDM(activeDM);
  }, [activeDM]);  // eslint-disable-line react-hooks/exhaustive-deps

  const loadFeed = useCallback(async () => {
    try {
      setFeedLoading(true);
      const { rpc } = await import("../access/rpcClient");
      const data = await rpc.call<any>("posts.list", {});
      if (data?.success) {
        setFeed(((data.posts || []) as FeedPost[]).filter(p => !p.deleted));
        setFeedErr(null);
      } else setFeedErr(data?.message || "Failed to load feed");
    } catch (e: any) {
      setFeedErr(e?.message || "Failed to load feed");
    } finally { setFeedLoading(false); }
  }, []);

  useEffect(() => {
    if (open && tab === "feed") loadFeed();
  }, [open, tab, loadFeed]);

  // Live-refresh feed via WSS event (no polling).
  useEffect(() => {
    if (!open || tab !== "feed") return;
    if (social.postsTick === 0) return;
    loadFeed();
  }, [open, tab, loadFeed, social.postsTick]);

  const isStaff = useMemo(
    () => social.me && (social.me.role === "owner" || social.me.role === "admin" || social.me.role === "mod"),
    [social.me]
  );
  const isOwner = social.me?.role === "owner";

  const dotClass =
    social.status === "online" ? "" :
    social.status === "connecting" ? "warn" : "off";

  const [chatCodeLang, setChatCodeLang] = useState<string>("");
  const [feedCodeLang, setFeedCodeLang] = useState<string>("");
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const dmDraftRef = useRef<HTMLTextAreaElement | null>(null);
  const feedTextRef = useRef<HTMLTextAreaElement | null>(null);

  const insertAtCaret = (
    el: HTMLTextAreaElement | HTMLInputElement | null,
    snippet: string,
    setter: (updater: (t: string) => string) => void
  ) => {
    if (!el) { setter(t => t + snippet); return; }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const next = before + snippet + after;
    setter(() => next);
    requestAnimationFrame(() => {
      try {
        el.focus();
        const pos = start + snippet.length;
        el.setSelectionRange(pos, pos);
      } catch { /* noop */ }
    });
  };
  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  };
  useEffect(() => { autoResize(draftRef.current); }, [draft]);
  useEffect(() => { autoResize(dmDraftRef.current); }, [dmDraft]);

  const insertCodeBlock = (lang: string, current: string): string => {
    const fence = "```";
    const block = `\n${fence}${lang || ""}\n\n${fence}\n`;
    return (current || "") + block;
  };

  const onSend = () => { if (!draft.trim()) return; social.send(draft); setDraft(""); };
  const onPromote = async (u: PresenceUser, role: Role) => {
    if (!(await exoConfirm(`Set ${u.username} → ${role.toUpperCase()}?`, "Change role"))) return;
    social.setRole(u.username, role);
  };
  const onBan = async (u: PresenceUser) => {
    const ans = await exoPrompt(`Ban ${u.username} for how many days? (7, 30, "perm", or 0 to unban)`, "7");
    if (ans == null) return;
    if (ans.trim().toLowerCase() === "perm") return social.ban(u.username, "perm");
    const n = parseInt(ans, 10);
    if (Number.isFinite(n) && n >= 0) social.ban(u.username, n);
  };

  const isFriend = (n: string) => social.friends.friends.some(f => f.username === n);
  const isOutgoing = (n: string) => social.friends.outgoing.some(f => f.username === n);
  const isIncoming = (n: string) => social.friends.incoming.some(f => f.username === n);

  const dmList = useMemo(() => {
    const set = new Map<string, FriendUser>();
    for (const f of social.friends.friends) set.set(f.username, f);
    for (const peer of Object.keys(social.dmHistory)) {
      if (!set.has(peer)) set.set(peer, { username: peer, role: "user" });
    }
    return Array.from(set.values()).sort((a, b) => a.username.localeCompare(b.username));
  }, [social.friends.friends, social.dmHistory]);

  const sendDMNow = async () => {
    if (!activeDM) return;
    const ok = await social.sendDM(activeDM, dmDraft);
    if (ok) setDmDraft("");
  };

  const friendActions = (u: FriendUser) => {
    if (u.username === social.me?.username) return null;
    if (isFriend(u.username)) {
      return (
        <span className="actions">
          <button onClick={() => { setActiveDM(u.username); setTab("dms"); }}>chat</button>
          <button onClick={async () => { if (await exoConfirm(`Unfriend ${u.username}?`, "Unfriend")) social.friendAction("remove", u.username); }}>unfriend</button>
        </span>
      );
    }
    if (isIncoming(u.username)) {
      return (
        <span className="actions">
          <button className="primary" onClick={() => social.friendAction("accept", u.username)}>accept</button>
          <button onClick={() => social.friendAction("decline", u.username)}>decline</button>
        </span>
      );
    }
    if (isOutgoing(u.username)) {
      return (
        <span className="actions">
          <button onClick={() => social.friendAction("cancel", u.username)}>cancel</button>
        </span>
      );
    }
    return (
      <span className="actions">
        <button className="primary" onClick={() => social.friendAction("request", u.username)}>+ add</button>
      </span>
    );
  };

  const reactToPost = async (postId: string, emoji: string) => {
    if (!token) return;
    setReactPickerFor(null);
    // Optimistic UI: toggle locally.
    setFeed(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const reactions = { ...(p.reactions || {}) };
      const me = social.me?.username || "";
      let prev: string | null = null;
      for (const k of Object.keys(reactions)) {
        const arr = reactions[k];
        const i = arr.indexOf(me);
        if (i >= 0) { prev = k; reactions[k] = arr.filter(x => x !== me); if (reactions[k].length === 0) delete reactions[k]; }
      }
      if (prev !== emoji) {
        reactions[emoji] = [ ...(reactions[emoji] || []), me ];
      }
      return { ...p, reactions };
    }));
    try {
      const { rpc } = await import("../access/rpcClient");
      const data = await rpc.call<any>("posts.react", { token, postId, emoji });
      if (data?.success) {
        setFeed(prev => prev.map(p => p.id === postId ? { ...p, reactions: data.reactions || {} } : p));
      }
    } catch { /* keep optimistic */ }
  };

  const myReaction = (p: FeedPost): string | null => {
    const me = social.me?.username;
    if (!me || !p.reactions) return null;
    for (const k of Object.keys(p.reactions)) if (p.reactions[k].includes(me)) return k;
    return null;
  };

  const reactionCount = (p: FeedPost) =>
    Object.values(p.reactions || {}).reduce((acc, arr) => acc + (arr?.length || 0), 0);

  const submitFeedComment = async (postId: string) => {
    if (!token) return;
    const text = (commentDraft[postId] || "").trim();
    if (!text) return;
    try {
      const { rpc } = await import("../access/rpcClient");
      const data = await rpc.call<any>("posts.comment", { token, postId, text });
      if (data?.success) {
        setCommentDraft(d => ({ ...d, [postId]: "" }));
        setFeed(prev => prev.map(p => p.id === postId ? { ...p, comments: [...(p.comments || []), data.comment] } : p));
      }
    } catch (e: any) { /* swallow */ }
  };

  const submitFeedPost = async () => {
    if (!token) return;
    const t = feedComposerText.trim();
    if (!t && !feedComposerFile) return;
    setPosting(true);
    try {
      const { rpc, rpcFile } = await import("../access/rpcClient");
      const data = await rpc.call<any>("posts.create", {
        token, text: t,
        file: feedComposerFile ? await rpcFile(feedComposerFile) : undefined,
      });
      if (data?.success) {
        setFeedComposerText(""); setFeedComposerFile(null);
        if (composerFileRef.current) composerFileRef.current.value = "";
        await loadFeed();
      }
    } catch { /* swallow */ }
    finally { setPosting(false); }
  };

  const deleteFeedPost = async (postId: string) => {
    if (!token) return;
    if (!(await exoConfirm("Delete this post?", "Delete"))) return;
    try {
      const { rpc } = await import("../access/rpcClient");
      await rpc.call("posts.delete", { token, postId });
      setFeed(prev => prev.filter(p => p.id !== postId));
    } catch { /* swallow */ }
  };

  return (
    <>
      <button className="social-fab" onClick={() => setOpen(o => !o)} title={`Social — ${social.status}`} aria-label="Toggle social panel">
        💬<span className={`dot ${dotClass}`} />
      </button>
      {open && (
        <div className={`social-panel${fullscreen ? " fullscreen" : ""}`} role="dialog" aria-label="Social">
          <div className="social-head">
            <span className={`status-dot ${dotClass}`} />
            <span className="title">EXOCORE SOCIAL</span>
            <span className="grow" style={{ flex: 1 }} />
            {social.me && <RoleBadge role={social.me.role} />}
            <button
              className="ico-btn"
              onClick={() => setFullscreen(f => !f)}
              title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {fullscreen ? "⤡" : "⛶"}
            </button>
            <button className="ico-btn" onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="social-tabs">
            <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>GLOBAL</button>
            <button className={tab === "feed" ? "active" : ""} onClick={() => setTab("feed")}>FEED</button>
            <button className={tab === "dms" ? "active" : ""} onClick={() => setTab("dms")}>
              DMs{social.friends.incoming.length > 0 ? ` ·${social.friends.incoming.length}` : ""}
            </button>
            <button className={tab === "friends" ? "active" : ""} onClick={() => setTab("friends")}>
              FRIENDS{social.friends.incoming.length > 0 ? ` ·${social.friends.incoming.length}` : ""}
            </button>
            <button className={tab === "people" ? "active" : ""} onClick={() => setTab("people")}>
              ONLINE·{social.presence.length}
            </button>
          </div>

          <div className="social-body">
            {tab === "chat" && (
              <>
                <div className="chat-list" ref={chatRef}>
                  {social.chat.length === 0 && (
                    <div style={{ color: "#666", fontSize: ".8rem", padding: 8 }}>No messages yet. Say hi 👋</div>
                  )}
                  {social.chat.map(m => (
                    <div className="chat-row chat-row-bubble" key={m.id}>
                      <Avatar name={m.nickname || m.username} role={m.role} src={m.avatarUrl || avatarMap[m.username?.toLowerCase()] || null} />
                      <div className="chat-bubble">
                        <div className="chat-bubble-head">
                          <RoleBadge role={m.role} />
                          {m.role === "system"
                            ? <span className="name">{m.nickname || m.username}</span>
                            : <Link to={`/u/${m.username}`} className="name name-link">{m.nickname || m.username}</Link>}
                          <span className="ts">{new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          {isOwner && !m.deleted && (
                            <button className="del-btn" onClick={() => social.deleteMessage(m.id)}>delete</button>
                          )}
                        </div>
                        <div className={`text${m.deleted ? " deleted" : ""}`}>
                          {m.deleted ? "[deleted by owner]" : <RichText text={m.text} />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="chat-input chat-input-rich">
                  <textarea
                    ref={draftRef}
                    className="chat-textarea"
                    rows={1}
                    placeholder={social.status === "online" ? "Message everyone…" : social.status === "banned" ? "You are banned." : "Connecting…"}
                    value={draft}
                    disabled={social.status !== "online"}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onSend();
                      }
                    }}
                  />
                  <div className="emoji-wrap">
                    <button
                      type="button"
                      className="emoji-inline-btn"
                      title="Emoji"
                      onMouseDown={ev => ev.preventDefault()}
                      onClick={() => setEmojiPickerFor(p => p === "__chat__" ? null : "__chat__")}
                    >😊</button>
                    {emojiPickerFor === "__chat__" && (
                      <div className="emoji-picker right scrollable">
                        {QUICK_EMOJIS.map(e => (
                          <button
                            key={e}
                            type="button"
                            className="emoji-pick"
                            onMouseDown={ev => ev.preventDefault()}
                            onClick={() => insertAtCaret(draftRef.current, e, setDraft)}
                          >{e}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={onSend} disabled={social.status !== "online" || !draft.trim()} className="chat-send">Send</button>
                </div>
                <div className="chat-code-row">
                  <div className="lang-select-wrap">
                    <select
                      className="lang-select"
                      value={chatCodeLang}
                      onChange={e => setChatCodeLang(e.target.value)}
                      aria-label="Choose code language"
                    >
                      {CODE_LANGS.map(l => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                    <span className="lang-caret">▾</span>
                  </div>
                  <button
                    type="button"
                    className="file-pill code-pill"
                    title={chatCodeLang ? "Insert a fenced code block" : "Pick a language first"}
                    disabled={!chatCodeLang}
                    onClick={() => {
                      if (!chatCodeLang) return;
                      setDraft(t => insertCodeBlock(chatCodeLang, t));
                      setTimeout(() => draftRef.current?.focus(), 0);
                    }}
                  >&lt;/&gt; Insert code</button>
                </div>
              </>
            )}

            {tab === "feed" && (
              <div className="feed-list">
                <div className="feed-composer">
                  <textarea
                    ref={feedTextRef}
                    placeholder="Share something with the community…"
                    maxLength={2000}
                    value={feedComposerText}
                    onChange={e => setFeedComposerText(e.target.value)}
                  />
                  <div className="feed-composer-row code-row">
                    <div className="lang-select-wrap">
                      <select
                        className="lang-select"
                        value={feedCodeLang}
                        onChange={e => setFeedCodeLang(e.target.value)}
                        aria-label="Choose code language"
                      >
                        {CODE_LANGS.map(l => (
                          <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                      </select>
                      <span className="lang-caret">▾</span>
                    </div>
                    <button
                      type="button"
                      className="file-pill code-pill"
                      title={feedCodeLang ? "Insert a fenced code block" : "Pick a language first"}
                      disabled={!feedCodeLang}
                      onClick={() => {
                        if (!feedCodeLang) return;
                        setFeedComposerText(t => insertCodeBlock(feedCodeLang, t).slice(0, 2000));
                        setTimeout(() => feedTextRef.current?.focus(), 0);
                      }}
                    >&lt;/&gt; Insert code</button>
                  </div>
                  <div className="feed-composer-row">
                    <label className="file-pill compact">
                      🖼 <span className="pill-text">{feedComposerFile ? feedComposerFile.name.slice(0, 18) : "Image"}</span>
                      <input
                        ref={composerFileRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={e => setFeedComposerFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <div className="emoji-wrap">
                      <button
                        type="button"
                        className="file-pill emoji-toggle compact"
                        onMouseDown={ev => ev.preventDefault()}
                        onClick={() => setEmojiPickerFor(p => p === "__composer__" ? null : "__composer__")}
                      >😊 <span className="pill-text">Emoji</span></button>
                      {emojiPickerFor === "__composer__" && (
                        <div className="emoji-picker scrollable">
                          {QUICK_EMOJIS.map(e => (
                            <button
                              key={e}
                              type="button"
                              className="emoji-pick"
                              onMouseDown={ev => ev.preventDefault()}
                              onClick={() => insertAtCaret(
                                feedTextRef.current,
                                e,
                                (up) => setFeedComposerText(t => up(t).slice(0, 2000))
                              )}
                            >{e}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="grow" style={{ flex: 1 }} />
                    <span className="ts">{feedComposerText.length}/2000</span>
                    <button
                      className="primary-btn"
                      disabled={posting || (!feedComposerText.trim() && !feedComposerFile)}
                      onClick={submitFeedPost}
                    >
                      {posting ? "Posting…" : "Post"}
                    </button>
                  </div>
                </div>

                <div className="feed-toolbar">
                  <button
                    className="feed-tool-btn"
                    onClick={loadFeed}
                    disabled={feedLoading}
                    title="Reload posts"
                  >🔄 Refresh</button>
                  <button
                    className="feed-tool-btn"
                    onClick={() => setFeed(prev => {
                      const a = prev.slice();
                      for (let i = a.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [a[i], a[j]] = [a[j], a[i]];
                      }
                      return a;
                    })}
                    disabled={feed.length < 2}
                    title="Show posts in a random order"
                  >🎲 Shuffle</button>
                  <span className="grow" style={{ flex: 1 }} />
                  <span className="ts">{feed.length} post{feed.length === 1 ? "" : "s"}</span>
                </div>

                {feedLoading && feed.length === 0 && (
                  <div className="feed-empty">Loading the feed…</div>
                )}
                {feedErr && <div className="feed-empty err">{feedErr}</div>}
                {!feedLoading && !feedErr && feed.length === 0 && (
                  <div className="feed-empty">No posts yet. Be the first to share something! ✨</div>
                )}

                {feed.map(post => {
                  const mine = myReaction(post);
                  const total = reactionCount(post);
                  const topReactions = Object.entries(post.reactions || {})
                    .sort((a, b) => (b[1]?.length || 0) - (a[1]?.length || 0))
                    .slice(0, 3);
                  const canDelete = social.me && (social.me.username === post.author || social.me.role === "owner");
                  return (
                    <article key={post.id} className="feed-card">
                      <header className="feed-card-head">
                        <Link to={`/u/${post.author}`} className="feed-author">
                          <Avatar name={stripAt(post.author)} role="user" size={36} src={avatarOf({ username: post.author })} />
                          <div>
                            <div className="feed-author-name">@{stripAt(post.author)}</div>
                            <div className="ts">{timeAgo(post.ts)}</div>
                          </div>
                        </Link>
                        {canDelete && (
                          <button className="del-btn" onClick={() => deleteFeedPost(post.id)}>delete</button>
                        )}
                      </header>
                      {post.text && <div className="feed-text"><RichText text={post.text} /></div>}
                      {post.imageUrl && (
                        <div className="feed-image">
                          <img src={post.imageUrl} alt="post" loading="lazy" />
                        </div>
                      )}
                      <div className="feed-react-summary">
                        {topReactions.length > 0 && (
                          <span className="react-summary-emojis">
                            {topReactions.map(([k]) => {
                              const r = REACTIONS.find(x => x.key === k);
                              return <span key={k}>{r?.emoji || "👍"}</span>;
                            })}
                            <span className="react-count">{total}</span>
                          </span>
                        )}
                        <span className="grow" style={{ flex: 1 }} />
                        <span className="react-count">{post.comments.filter(c => !c.deleted).length} 💬</span>
                      </div>
                      <div className="feed-actions">
                        <div
                          className="react-wrap"
                          onMouseLeave={() => setReactPickerFor(null)}
                        >
                          <button
                            className={`feed-act-btn ${mine ? "active" : ""}`}
                            style={mine ? { color: REACTIONS.find(r => r.key === mine)?.color } : undefined}
                            onMouseEnter={() => setReactPickerFor(post.id)}
                            onClick={() => reactToPost(post.id, mine || "like")}
                            onTouchStart={() => {
                              if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
                              longPressTimerRef.current = window.setTimeout(() => {
                                setReactPickerFor(post.id);
                                longPressTimerRef.current = null;
                              }, 380);
                            }}
                            onTouchEnd={() => {
                              if (longPressTimerRef.current) {
                                window.clearTimeout(longPressTimerRef.current);
                                longPressTimerRef.current = null;
                              }
                            }}
                            onTouchMove={() => {
                              if (longPressTimerRef.current) {
                                window.clearTimeout(longPressTimerRef.current);
                                longPressTimerRef.current = null;
                              }
                            }}
                          >
                            {mine
                              ? <>{REACTIONS.find(r => r.key === mine)?.emoji} {REACTIONS.find(r => r.key === mine)?.label}</>
                              : <>👍 React</>}
                          </button>
                          {reactPickerFor === post.id && (
                            <div className="react-picker">
                              {REACTIONS.map(r => (
                                <button
                                  key={r.key}
                                  className="react-pick"
                                  title={r.label}
                                  onClick={() => reactToPost(post.id, r.key)}
                                >{r.emoji}</button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          className="feed-act-btn"
                          onClick={() => setOpenComments(s => ({ ...s, [post.id]: !s[post.id] }))}
                        >
                          💬 Comment
                        </button>
                      </div>
                      {openComments[post.id] && (
                        <div className="feed-comments">
                          {post.comments.filter(c => !c.deleted).map(c => (
                            <div key={c.id} className="feed-comment">
                              <Avatar name={stripAt(c.author)} size={22} src={avatarOf({ username: c.author })} />
                              <div className="feed-comment-bubble">
                                <Link to={`/u/${c.author}`} className="feed-comment-author">@{stripAt(c.author)}</Link>
                                <div className="feed-comment-text"><RichText text={c.text} /></div>
                                <div className="ts">{timeAgo(c.ts)}</div>
                              </div>
                            </div>
                          ))}
                          {token && (
                            <div className="feed-comment-input">
                              <Avatar name={social.me?.username} role={social.me?.role} size={22} src={avatarOf(social.me)} />
                              <input
                                placeholder="Write a comment…"
                                value={commentDraft[post.id] || ""}
                                onChange={e => setCommentDraft(d => ({ ...d, [post.id]: e.target.value }))}
                                onKeyDown={e => { if (e.key === "Enter") submitFeedComment(post.id); }}
                              />
                              <div className="emoji-wrap">
                                <button
                                  type="button"
                                  className="emoji-inline-btn"
                                  onClick={() => setEmojiPickerFor(p => p === "c_"+post.id ? null : "c_"+post.id)}
                                  title="Emoji"
                                >😊</button>
                                {emojiPickerFor === "c_"+post.id && (
                                  <div className="emoji-picker right scrollable">
                                    {QUICK_EMOJIS.map(e => (
                                      <button
                                        key={e}
                                        type="button"
                                        className="emoji-pick"
                                        onMouseDown={ev => ev.preventDefault()}
                                        onClick={() => setCommentDraft(d => ({ ...d, [post.id]: (d[post.id] || "") + e }))}
                                      >{e}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button onClick={() => submitFeedComment(post.id)}>Send</button>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            {tab === "dms" && (
              !activeDM ? (
                <div className="presence-list">
                  {dmList.length === 0 && (
                    <div style={{ color: "#666", fontSize: ".8rem", padding: 8 }}>
                      Add friends para makapag-DM. Lahat ng DM ay encrypted (E2EE) — server hindi makakabasa.
                    </div>
                  )}
                  {dmList.map(u => {
                    const lastMsgs = social.dmHistory[u.username] || [];
                    const last = lastMsgs[lastMsgs.length - 1];
                    return (
                      <div className="dm-list-row" key={u.username} onClick={() => setActiveDM(u.username)}>
                        <div className="dm-list-avatar">
                          <Avatar name={u.nickname || u.username} role={u.role} size={42} src={avatarOf(u)} />
                          {social.presence.some(p => p.username === u.username) && <span className="presence-bullet" />}
                        </div>
                        <div className="dm-list-meta">
                          <div className="dm-list-name">
                            <span>{stripAt(u.nickname || u.username)}</span>
                            <RoleBadge role={u.role} />
                          </div>
                          <div className="dm-list-preview">
                            {last
                              ? `${last.from === social.me?.username ? "you: " : ""}${last.decryptOk ? last.text : "[encrypted]"}`
                              : "Tap to start chatting"}
                          </div>
                        </div>
                        {last && <div className="ts">{timeAgo(last.ts)}</div>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="dm-head">
                    <button className="ico-btn" onClick={() => setActiveDM(null)}>← back</button>
                    <Avatar name={activeDM} role="user" size={32} src={avatarOf({ username: activeDM || "" })} />
                    <Link to={`/u/${activeDM}`} className="dm-head-name">@{activeDM}</Link>
                    <span className="grow" style={{ flex: 1 }} />
                    <span className="dm-head-e2ee">🔒 E2EE</span>
                  </div>
                  <div className="dm-thread" ref={dmRef}>
                    {(social.dmHistory[activeDM] || []).length === 0 && (
                      <div style={{ color: "#666", fontSize: ".8rem", padding: 8, textAlign: "center" }}>No messages yet.</div>
                    )}
                    {(social.dmHistory[activeDM] || []).map((m, i, arr) => {
                      const mine = m.from === social.me?.username;
                      const prev = arr[i - 1];
                      const showAvatar = !mine && (!prev || prev.from !== m.from);
                      const showTime = !prev || (m.ts - prev.ts) > 5 * 60 * 1000;
                      return (
                        <React.Fragment key={m.id}>
                          {showTime && (
                            <div className="dm-time-divider">{new Date(m.ts).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}</div>
                          )}
                          <div className={`dm-bubble-row ${mine ? "mine" : "theirs"}`}>
                            {!mine && (
                              <span className="dm-bubble-avatar">
                                {showAvatar ? <Avatar name={activeDM} role="user" size={28} src={avatarOf({ username: activeDM || "" })} /> : <span style={{ width: 28, display: "inline-block" }} />}
                              </span>
                            )}
                            <div className={`dm-bubble ${!m.decryptOk ? "encrypted" : ""}`}>
                              {m.decryptOk ? <RichText text={m.text} /> : "[encrypted — peer key not available]"}
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                  <div className="chat-input chat-input-rich">
                    <textarea
                      ref={dmDraftRef}
                      className="chat-textarea"
                      rows={1}
                      placeholder="Encrypted message…"
                      value={dmDraft}
                      onChange={e => setDmDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendDMNow();
                        }
                      }}
                    />
                    <div className="emoji-wrap">
                      <button
                        type="button"
                        className="emoji-inline-btn"
                        onClick={() => setEmojiPickerFor(p => p === "__dm__" ? null : "__dm__")}
                        title="Emoji"
                      >😊</button>
                      {emojiPickerFor === "__dm__" && (
                        <div className="emoji-picker right scrollable">
                          {QUICK_EMOJIS.map(e => (
                            <button
                              key={e}
                              type="button"
                              className="emoji-pick"
                              onMouseDown={ev => ev.preventDefault()}
                              onClick={() => insertAtCaret(dmDraftRef.current, e, setDmDraft)}
                            >{e}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={sendDMNow} disabled={!dmDraft.trim()}>Send</button>
                  </div>
                </>
              )
            )}

            {tab === "friends" && (
              <div className="presence-list">
                <div className="chat-input" style={{ borderTop: 0, borderBottom: "1px solid #222" }}>
                  <input
                    placeholder="Search a username to add…"
                    value={friendQuery}
                    onChange={e => setFriendQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && friendQuery.trim()) {
                        social.friendAction("request", friendQuery.trim());
                        setFriendQuery("");
                      }
                    }}
                  />
                  <button
                    disabled={!friendQuery.trim()}
                    onClick={() => { social.friendAction("request", friendQuery.trim()); setFriendQuery(""); }}
                  >add</button>
                </div>
                {social.friends.incoming.length > 0 && (
                  <>
                    <div className="section-head accent">INCOMING REQUESTS · {social.friends.incoming.length}</div>
                    {social.friends.incoming.map(u => (
                      <div className="presence-row" key={"in_"+u.username}>
                        <Avatar name={u.nickname || u.username} role={u.role} size={32} src={avatarOf(u)} />
                        <div className="presence-name-stack">
                          <Link to={`/u/${u.username}`} className="name-link">{stripAt(u.nickname || u.username)}</Link>
                          <div className="presence-sub"><RoleBadge role={u.role} /><span className="lv-chip">Lv {u.level || 0}</span></div>
                        </div>
                        {friendActions(u)}
                      </div>
                    ))}
                  </>
                )}
                {social.friends.outgoing.length > 0 && (
                  <>
                    <div className="section-head">OUTGOING REQUESTS · {social.friends.outgoing.length}</div>
                    {social.friends.outgoing.map(u => (
                      <div className="presence-row" key={"out_"+u.username}>
                        <Avatar name={u.nickname || u.username} role={u.role} size={32} src={avatarOf(u)} />
                        <div className="presence-name-stack">
                          <Link to={`/u/${u.username}`} className="name-link">{stripAt(u.nickname || u.username)}</Link>
                          <div className="presence-sub"><RoleBadge role={u.role} /><span className="lv-chip">Lv {u.level || 0}</span></div>
                        </div>
                        {friendActions(u)}
                      </div>
                    ))}
                  </>
                )}
                <div className="section-head">FRIENDS · {social.friends.friends.length}</div>
                {social.friends.friends.length === 0 && (
                  <div style={{ color: "#666", fontSize: ".8rem", padding: 8 }}>No friends yet. Add some from suggestions below 👇</div>
                )}
                {social.friends.friends.map(u => (
                  <div className="presence-row" key={"fr_"+u.username}>
                    <div className="dm-list-avatar">
                      <Avatar name={u.nickname || u.username} role={u.role} size={32} src={avatarOf(u)} />
                      {social.presence.some(p => p.username === u.username) && <span className="presence-bullet sm" />}
                    </div>
                    <div className="presence-name-stack">
                      <Link to={`/u/${u.username}`} className="name-link">{stripAt(u.nickname || u.username)}</Link>
                      <div className="presence-sub"><RoleBadge role={u.role} /><span className="lv-chip">Lv {u.level || 0}</span></div>
                    </div>
                    {friendActions(u)}
                  </div>
                ))}
                <div className="section-head info">
                  ✨ SUGGESTED · VERIFIED USERS · {social.friends.suggestions.length}
                </div>
                {social.friends.suggestions.length === 0 && (
                  <div style={{ color: "#666", fontSize: ".8rem", padding: 8 }}>
                    No suggestions right now. Check back later — verified users will appear here.
                  </div>
                )}
                {social.friends.suggestions.map(u => (
                  <div className="presence-row sug-row" key={"sug_"+u.username}>
                    <Avatar name={u.nickname || u.username} role={u.role} size={36} src={avatarOf(u)} />
                    <div className="presence-name-stack">
                      <Link to={`/u/${u.username}`} className="name-link">
                        {stripAt(u.nickname || u.username)} <span className="verified-tick" title="Verified">✓</span>
                      </Link>
                      <div className="presence-sub">
                        <RoleBadge role={u.role} />
                        <span className="lv-chip">Lv {u.level || 0}</span>
                        {u.mutual ? <span className="mutual-chip">{u.mutual} mutual</span> : null}
                      </div>
                    </div>
                    {friendActions(u)}
                  </div>
                ))}
              </div>
            )}

            {tab === "people" && (
              <div className="presence-list">
                {social.presence.length === 0 && (
                  <div style={{ color: "#666", fontSize: ".8rem", padding: 8 }}>No one is online right now.</div>
                )}
                {social.presence.map(u => (
                  <div className="presence-row" key={u.username}>
                    <div className="dm-list-avatar">
                      <Avatar name={u.nickname || u.username} role={u.role} size={32} src={avatarOf(u)} />
                      <span className="presence-bullet sm" />
                    </div>
                    <div className="presence-name-stack">
                      <Link to={`/u/${u.username}`} className="name-link">{stripAt(u.nickname || u.username)}</Link>
                      <div className="presence-sub"><RoleBadge role={u.role} /><span className="lv-chip">Lv {u.level || 0}</span></div>
                    </div>
                    {social.me?.username !== u.username && (
                      <span className="actions actions-pretty">
                        <button className="act-btn" onClick={() => { setActiveDM(u.username); setTab("dms"); }}>dm</button>
                        {!isFriend(u.username) && !isOutgoing(u.username) && !isIncoming(u.username) && (
                          <button className="act-btn primary" onClick={() => social.friendAction("request", u.username)}>+ add</button>
                        )}
                        {isStaff && u.role !== "owner" && (
                          <>
                            {isOwner && u.role !== "admin" && <button className="act-btn" onClick={() => onPromote(u, "admin")}>→admin</button>}
                            {isOwner && u.role !== "mod" && <button className="act-btn" onClick={() => onPromote(u, "mod")}>→mod</button>}
                            {isOwner && u.role !== "user" && <button className="act-btn" onClick={() => onPromote(u, "user")}>→user</button>}
                            <button className="act-btn danger" onClick={() => onBan(u)}>ban</button>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="social-footer">
            <span>secure binary · WSS · msgpack · X25519+XChaCha20</span>
            <span className="grow" style={{ flex: 1 }} />
            {social.errorMsg && <span className="err">{social.errorMsg}</span>}
          </div>
        </div>
      )}

      {social.xpToast && (
        <div className="xp-toast" onClick={() => social.dismissXpToast()}>
          <div className="xp-toast-row">
            <span className="xp-toast-spark">✨</span>
            <strong>+{social.xpToast.xpDelta} XP</strong>
            {social.xpToast.levelUp && <span className="xp-toast-up">→ Lv {social.xpToast.level}</span>}
          </div>
          {social.xpToast.newAchievements.length > 0 && (
            <div className="xp-toast-ach">
              🏅 {social.xpToast.newAchievements.join(", ")}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default SocialPanel;
