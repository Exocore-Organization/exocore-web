import axios from "axios";
import { loadUrlConfig, type UrlConfig } from "./_urlVault";

let cached: { base: string; expires: number } | null = null;
const TTL_MS = 30_000;

function loadCfg(): UrlConfig {
  return loadUrlConfig(__dirname);
}

async function probe(url: string): Promise<boolean> {
  try {
    const r = await axios.get(url, { timeout: 1500, validateStatus: () => true });
    return r.status >= 200 && r.status < 500;
  } catch {
    return false;
  }
}

/**
 * Resolves the upstream backend base URL.
 * - If config has `local` and `preferLocal: true` AND that URL is reachable, use it.
 * - Else fetch the remote feed (URL) and return its `.link` field.
 * - Else fall back to `local` if defined, else throw.
 */
export async function resolveBaseUrl(): Promise<string> {
  if (cached && cached.expires > Date.now()) return cached.base;

  const cfg = loadCfg();
  let base: string | null = null;

  if (cfg.local && cfg.preferLocal) {
    if (await probe(cfg.local)) base = cfg.local;
  }

  if (!base && cfg.URL) {
    try {
      const r = await axios.get(`${cfg.URL}?cache=${Date.now()}`, { timeout: 4000 });
      if (typeof r.data === "object" && r.data && typeof r.data.link === "string") {
        base = r.data.link;
      } else if (typeof r.data === "string" && /^https?:\/\//.test(r.data.trim())) {
        base = r.data.trim();
      }
    } catch {
      /* fall through */
    }
  }

  if (!base && cfg.local) base = cfg.local;
  if (!base) throw new Error("No backend URL could be resolved");

  base = base.replace(/\/$/, "");
  cached = { base, expires: Date.now() + TTL_MS };
  return base;
}

export function clearResolvedCache(): void {
  cached = null;
}
