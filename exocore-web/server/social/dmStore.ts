import axios from "axios";
import { resolveBaseUrl } from "../../routes/_resolveBase";

export interface DMRecord {
  id: string;
  ts: number;
  from: string;        // sender username
  to: string;          // recipient username
  ciphertext: string;  // base64 (XChaCha20-Poly1305)
  nonce: string;       // base64 (24 bytes)
  ephPub?: string;     // base64 (optional sender ephemeral X25519 pub)
}

const TIMEOUT_MS = 5000;

async function endpoint(): Promise<string> {
  const base = await resolveBaseUrl();
  return `${base}/dms`;
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("__");
}

export async function appendDM(rec: DMRecord): Promise<void> {
  try {
    await axios.post(await endpoint(), { record: rec }, { timeout: TIMEOUT_MS });
  } catch (e: any) {
    console.warn("[dmStore] append failed:", e?.message);
  }
}

export async function listDMs(a: string, b: string, limit = 100): Promise<DMRecord[]> {
  try {
    const r = await axios.get(await endpoint(), {
      params: { a, b, limit },
      timeout: TIMEOUT_MS,
    });
    const arr = r.data?.messages ?? r.data;
    return Array.isArray(arr) ? arr : [];
  } catch (e: any) {
    console.warn("[dmStore] list failed:", e?.message);
    return [];
  }
}
