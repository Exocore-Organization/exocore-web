import { useCallback, useEffect, useRef, useState } from "react";
import { encode, decode } from "@msgpack/msgpack";
import { ensureKeyPair, KeyPair, openFromPeer, pubKeyB64, sealForPeer } from "./crypto";
import { muxCarrier, MuxChannel } from "../access/wsMux";

export type Role = "owner" | "admin" | "mod" | "user";

export interface PresenceUser {
  username: string;
  nickname?: string;
  role: Role | string;
  level?: number;
  pubKey?: string | null;
  avatarUrl?: string | null;
}

export interface ChatMessage {
  id: string;
  ts: number;
  username: string;
  nickname?: string;
  role: Role | string;
  text: string;
  deleted?: boolean;
  avatarUrl?: string | null;
}

export interface FriendUser extends PresenceUser { mutual?: number }

export interface FriendsState {
  friends: FriendUser[];
  incoming: FriendUser[];
  outgoing: FriendUser[];
  suggestions: FriendUser[];
}

export interface DMMessage {
  id: string; ts: number; from: string; to: string;
  text: string;          // plaintext (decrypted client-side; "" if undecryptable)
  decryptOk: boolean;    // true if we could open it
}

interface Frame<T = unknown> { t: string; d?: T; id?: string; ts?: number }

interface UseSocialOptions { token: string | null; enabled?: boolean }

export interface UseSocialResult {
  status: "idle" | "connecting" | "online" | "offline" | "banned" | "error";
  presence: PresenceUser[];
  chat: ChatMessage[];
  me: PresenceUser | null;
  friends: FriendsState;
  myPubKey: string | null;
  send: (text: string) => void;
  deleteMessage: (id: string) => void;
  setRole: (target: string, role: Role) => void;
  ban: (target: string, days: number | "perm") => void;
  refreshFriends: () => void;
  friendAction: (action: "request" | "cancel" | "accept" | "decline" | "remove", target: string) => void;
  // DMs
  openDM: (peer: string) => Promise<void>;
  sendDM: (peer: string, text: string) => Promise<boolean>;
  dmHistory: Record<string, DMMessage[]>;
  errorMsg: string | null;
  xpToast: { xpDelta: number; level: number; levelUp: boolean; newAchievements: string[]; ts: number } | null;
  dismissXpToast: () => void;
  postsTick: number;
}

export function useSocial({ token, enabled = true }: UseSocialOptions): UseSocialResult {
  const [status, setStatus] = useState<UseSocialResult["status"]>("idle");
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [me, setMe] = useState<PresenceUser | null>(null);
  const [friends, setFriends] = useState<FriendsState>({ friends: [], incoming: [], outgoing: [], suggestions: [] });
  const [dmHistory, setDmHistory] = useState<Record<string, DMMessage[]>>({});
  const [myPubKey, setMyPubKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [xpToast, setXpToast] = useState<UseSocialResult["xpToast"]>(null);
  const [postsTick, setPostsTick] = useState(0);

  const wsRef = useRef<MuxChannel | null>(null);
  const retryRef = useRef<number>(0);
  const reconnectTimer = useRef<number | null>(null);
  const kpRef = useRef<KeyPair | null>(null);
  const peerKeyCache = useRef<Map<string, string>>(new Map());

  const sendFrame = useCallback((f: Frame) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    try { ws.send(encode(f)); } catch {}
  }, []);

  const ensurePeerKey = useCallback((peer: string): Promise<string | null> => {
    const cached = peerKeyCache.current.get(peer);
    if (cached) return Promise.resolve(cached);
    return new Promise<string | null>((resolve) => {
      const id = `peer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const handler = (ev: MessageEvent) => {
        if (!(ev.data instanceof ArrayBuffer)) return;
        try {
          const f = decode(new Uint8Array(ev.data)) as Frame;
          if (f.id === id && f.t === "social:peer") {
            const pk = (f.d as any)?.peer?.pubKey || null;
            if (pk) peerKeyCache.current.set(peer, pk);
            wsRef.current?.removeEventListener("message", handler);
            resolve(pk);
          }
        } catch {}
      };
      wsRef.current?.addEventListener("message", handler);
      sendFrame({ t: "social:peer", d: { username: peer }, id });
      setTimeout(() => {
        wsRef.current?.removeEventListener("message", handler);
        resolve(peerKeyCache.current.get(peer) || null);
      }, 5000);
    });
  }, [sendFrame]);

  const decryptInto = useCallback(async (raw: any): Promise<DMMessage> => {
    const peer = raw.from === me?.username ? raw.to : raw.from;
    let text = "";
    let ok = false;
    try {
      const kp = kpRef.current;
      if (kp) {
        const peerKey = await ensurePeerKey(peer);
        if (peerKey) {
          const pt = openFromPeer(kp.priv, peerKey, raw.ciphertext, raw.nonce);
          if (pt != null) { text = pt; ok = true; }
        }
      }
    } catch {}
    return { id: raw.id, ts: raw.ts, from: raw.from, to: raw.to, text, decryptOk: ok };
  }, [me?.username, ensurePeerKey]);

  useEffect(() => {
    if (!enabled || !token) return;
    let closed = false;

    const init = async () => {
      const kp = await ensureKeyPair();
      kpRef.current = kp;
      setMyPubKey(pubKeyB64(kp));
    };
    init();

    const connect = () => {
      if (closed) return;
      setStatus("connecting");
      const ws = muxCarrier.openChannel("social", "/exocore/ws/social");
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setErrorMsg(null);
        // Send auth as the first message — keeps the token out of URLs/logs.
        try { ws.send(encode({ t: "auth", d: { token } })); } catch {}
        // Register/refresh pubkey + load friends (server queues these until auth completes).
        if (kpRef.current) {
          ws.send(encode({ t: "social:pubkey", d: { pubKey: pubKeyB64(kpRef.current) } }));
        }
        ws.send(encode({ t: "social:friends" }));
      };

      ws.onmessage = async (ev) => {
        if (!(ev.data instanceof ArrayBuffer)) return;
        let f: Frame;
        try { f = decode(new Uint8Array(ev.data)) as Frame; } catch { return; }
        switch (f.t) {
          case "auth:ok":
            setMe(((f.d as any)?.user ?? null) as PresenceUser | null);
            setStatus("online");
            break;
          case "auth:fail": {
            const reason = (f.d as any)?.reason || "auth failed";
            setStatus(reason === "banned" ? "banned" : "error");
            setErrorMsg(String(reason));
            break;
          }
          case "presence:list":
            setPresence((((f.d as any)?.users ?? []) as PresenceUser[]));
            break;
          case "chat:history":
            setChat(((f.d as any)?.messages ?? []) as ChatMessage[]);
            break;
          case "chat:msg":
            setChat(prev => {
              const next = [...prev, f.d as ChatMessage];
              return next.length > 200 ? next.slice(-200) : next;
            });
            break;
          case "chat:deleted": {
            const id = (f.d as any)?.id;
            if (!id) break;
            setChat(prev => prev.map(m => m.id === id ? { ...m, deleted: true, text: "" } : m));
            break;
          }
          case "xp:gain": {
            const d = f.d as any;
            setXpToast({
              xpDelta: Number(d?.xpDelta || 0),
              level: Number(d?.level || 0),
              levelUp: !!d?.levelUp,
              newAchievements: Array.isArray(d?.newAchievements) ? d.newAchievements : [],
              ts: Date.now(),
            });
            break;
          }
          case "user:updated": {
            const u = f.d as any;
            if (!u?.username) break;
            setPresence(prev => prev.map(p => p.username === u.username ? { ...p, ...u } : p));
            setMe(prev => (prev && prev.username === u.username ? { ...prev, ...u } : prev));
            break;
          }
          case "social:friends":
            setFriends({
              friends:     ((f.d as any)?.friends ?? []) as FriendUser[],
              incoming:    ((f.d as any)?.incoming ?? []) as FriendUser[],
              outgoing:    ((f.d as any)?.outgoing ?? []) as FriendUser[],
              suggestions: ((f.d as any)?.suggestions ?? []) as FriendUser[],
            });
            break;
          case "social:friend-event":
          case "social:ok":
            // Refresh friends after any change.
            sendFrame({ t: "social:friends" });
            break;
          case "social:err":
            setErrorMsg(String((f.d as any)?.message || "social error"));
            break;
          case "dm:history": {
            const peer = (f.d as any)?.peer as string;
            const msgs = ((f.d as any)?.messages ?? []) as any[];
            const decoded = await Promise.all(msgs.map(decryptInto));
            setDmHistory(prev => ({ ...prev, [peer]: decoded }));
            break;
          }
          case "dm:msg": {
            const raw = f.d as any;
            const peer = raw.from === me?.username ? raw.to : raw.from;
            const decoded = await decryptInto(raw);
            setDmHistory(prev => {
              const cur = prev[peer] || [];
              if (cur.some(m => m.id === decoded.id)) return prev;
              const next = [...cur, decoded];
              return { ...prev, [peer]: next.slice(-200) };
            });
            break;
          }
          case "posts:updated":
            setPostsTick(t => t + 1);
            break;
          case "error":
            setErrorMsg(String((f.d as any)?.message || "error"));
            break;
        }
      };

      ws.onclose = () => {
        if (closed) return;
        setStatus(prev => (prev === "banned" ? "banned" : "offline"));
        const delay = Math.min(15000, 1000 * Math.pow(2, retryRef.current++));
        reconnectTimer.current = window.setTimeout(connect, delay);
      };
      ws.onerror = () => setErrorMsg("connection error");
    };

    connect();
    const ping = window.setInterval(() => sendFrame({ t: "ping" }), 25000);

    return () => {
      closed = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      window.clearInterval(ping);
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [enabled, token, sendFrame, decryptInto, me?.username]);

  const send = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    sendFrame({ t: "chat:send", d: { text: t } });
  }, [sendFrame]);

  const deleteMessage = useCallback((id: string) => sendFrame({ t: "chat:delete", d: { id } }), [sendFrame]);
  const setRole = useCallback((target: string, role: Role) => sendFrame({ t: "admin:role", d: { target, role } }), [sendFrame]);
  const ban = useCallback((target: string, days: number | "perm") => sendFrame({ t: "admin:ban", d: { target, days } }), [sendFrame]);
  const refreshFriends = useCallback(() => sendFrame({ t: "social:friends" }), [sendFrame]);
  const friendAction = useCallback((action: "request" | "cancel" | "accept" | "decline" | "remove", target: string) => {
    // Optimistic UI: update the local list immediately so it feels instant.
    setFriends(prev => {
      const next: FriendsState = {
        friends:     [...prev.friends],
        incoming:    [...prev.incoming],
        outgoing:    [...prev.outgoing],
        suggestions: [...prev.suggestions],
      };
      const findAndRemove = (arr: FriendUser[]): FriendUser | null => {
        const i = arr.findIndex(u => u.username === target);
        if (i < 0) return null;
        const [u] = arr.splice(i, 1);
        return u;
      };
      const seed = (): FriendUser =>
        findAndRemove(next.friends) ||
        findAndRemove(next.incoming) ||
        findAndRemove(next.outgoing) ||
        findAndRemove(next.suggestions) ||
        ({ username: target, role: "user", level: 0 } as FriendUser);
      switch (action) {
        case "request": {
          const u = seed();
          if (!next.outgoing.some(x => x.username === u.username)) next.outgoing.push(u);
          break;
        }
        case "cancel":
        case "decline":
        case "remove": {
          // Just remove; if it was a removed friend, it can re-appear in suggestions on refresh.
          findAndRemove(next.friends);
          findAndRemove(next.incoming);
          findAndRemove(next.outgoing);
          findAndRemove(next.suggestions);
          break;
        }
        case "accept": {
          const u = seed();
          if (!next.friends.some(x => x.username === u.username)) next.friends.push(u);
          break;
        }
      }
      return next;
    });
    sendFrame({ t: "social:friend", d: { action, target } });
  }, [sendFrame]);

  const openDM = useCallback(async (peer: string) => {
    sendFrame({ t: "dm:history", d: { peer } });
    await ensurePeerKey(peer);
  }, [sendFrame, ensurePeerKey]);

  const sendDM = useCallback(async (peer: string, text: string): Promise<boolean> => {
    const t = text.trim();
    if (!t) return false;
    const kp = kpRef.current;
    if (!kp) { setErrorMsg("crypto not ready"); return false; }
    const peerKey = await ensurePeerKey(peer);
    if (!peerKey) { setErrorMsg("recipient has no public key yet"); return false; }
    const sealed = sealForPeer(kp.priv, peerKey, t);
    sendFrame({ t: "dm:send", d: { to: peer, ciphertext: sealed.ciphertext, nonce: sealed.nonce } });
    return true;
  }, [sendFrame, ensurePeerKey]);

  return {
    status, presence, chat, me, friends, myPubKey,
    send, deleteMessage, setRole, ban,
    refreshFriends, friendAction,
    openDM, sendDM, dmHistory,
    errorMsg,
    xpToast,
    dismissXpToast: () => setXpToast(null),
    postsTick,
  };
}
