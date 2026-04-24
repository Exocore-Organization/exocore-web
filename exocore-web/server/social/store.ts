import axios from "axios";
import { resolveBaseUrl } from "../../routes/_resolveBase";

export interface ChatMessage {
  id: string;
  ts: number;
  username: string;
  nickname?: string;
  role: string;
  plan?: string;       // "free" | "exo" — surfaced for the chat-row badge
  text: string;
  deleted?: boolean;
}

const TIMEOUT_MS = 5000;

async function endpoint(): Promise<string> {
  const base = await resolveBaseUrl();
  return `${base}/store`;
}

export async function appendMessage(msg: ChatMessage): Promise<void> {
  try {
    await axios.post(await endpoint(), { message: msg }, { timeout: TIMEOUT_MS });
  } catch (e: any) {
    console.warn("[social.store] append failed:", e?.message);
  }
}

export async function listMessages(limit = 100): Promise<ChatMessage[]> {
  try {
    const r = await axios.get(await endpoint(), {
      params: { limit },
      timeout: TIMEOUT_MS,
    });
    const arr = r.data?.messages ?? r.data;
    return Array.isArray(arr) ? arr : [];
  } catch (e: any) {
    console.warn("[social.store] list failed:", e?.message);
    return [];
  }
}

export async function deleteMessage(id: string): Promise<boolean> {
  try {
    const url = `${await endpoint()}/${encodeURIComponent(id)}`;
    const r = await axios.delete(url, { timeout: TIMEOUT_MS });
    return r.data?.ok !== false;
  } catch (e: any) {
    console.warn("[social.store] delete failed:", e?.message);
    return false;
  }
}
