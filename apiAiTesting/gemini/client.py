"""Lightweight Gemini (gemini.google.com) web client.

Cookie-based auth, mirrors the shape of the local `meta` client. Returns a
plain dict with `text`, `conversation_id`, `response_id`, `choice_id`, and
the model used. Only conversation_id is required to continue a thread —
caller is responsible for storing it.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional

import requests
from requests.adapters import HTTPAdapter
try:
    from urllib3.util.retry import Retry
except ImportError:  # pragma: no cover
    Retry = None  # type: ignore


# Model identifiers extracted from gemini.google.com's bundled config
# (sor/e884f5e583fd8fc2, "thinking=...,fast=..." experiment buckets).
MODELS: Dict[str, str] = {
    "fast":     "56fdd199312815e2",   # Gemini 2.5 Flash (fast tier)
    "thinking": "797f3d0293f288ad",   # Gemini 2.5 with thinking
    "pro":      "2525e3954d185b3c",   # Gemini 2.5 Pro
}

_MODEL_ALIASES = {
    "fast": "fast", "flash": "fast", "instant": "fast", "quick": "fast",
    "thinking": "thinking", "think": "thinking", "reason": "thinking",
    "pro": "pro", "advanced": "pro", "deep": "pro",
}

_BASE = "https://gemini.google.com"
_APP = f"{_BASE}/app"
_GENERATE = (
    f"{_BASE}/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate"
)
_BATCHEXECUTE = f"{_BASE}/_/BardChatUi/data/batchexecute"
# rpcid used by gemini.google.com to delete a conversation thread.
_RPC_DELETE = "GzXR5e"

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)

# Browser-fingerprint headers Chrome 147 sends to gemini.google.com. Sending
# this full set makes the request blend in with a real browser session — the
# "client hints" (sec-ch-*) and "fetch metadata" (sec-fetch-*) headers are
# what Google's bot/anomaly heuristics inspect first.
_BROWSER_HEADERS = {
    "User-Agent": _UA,
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Origin": _BASE,
    "Referer": f"{_BASE}/app",
    "DNT": "1",
    "Sec-Ch-Ua": '"Google Chrome";v="147", "Chromium";v="147", "Not?A_Brand";v="24"',
    "Sec-Ch-Ua-Arch": '"x86"',
    "Sec-Ch-Ua-Bitness": '"64"',
    "Sec-Ch-Ua-Full-Version": '"147.0.7390.79"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Model": '""',
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Ch-Ua-Platform-Version": '"15.0.0"',
    "Sec-Ch-Ua-Wow64": "?0",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "X-Same-Domain": "1",
}


class GeminiError(RuntimeError):
    pass


def normalize_model(value: Optional[str]) -> str:
    if not value:
        return "fast"
    key = str(value).strip().lower()
    return _MODEL_ALIASES.get(key, key if key in MODELS else "fast")


class GeminiClient:
    """One client per browser session (cookie set).

    Caches the SNlM0e token after the first call to avoid re-fetching the app
    HTML on every request.
    """

    def __init__(
        self,
        cookies: Dict[str, str],
        proxy: Optional[Dict[str, str]] = None,
        label: Optional[str] = None,
    ):
        if not cookies:
            raise GeminiError("cookies required (need __Secure-1PSID at minimum)")
        self.cookies = dict(cookies)
        self.label = label or (cookies.get("__Secure-1PSID", "")[:12] + "…")
        self._snlm0e: Optional[str] = None
        self._snlm0e_at: float = 0.0
        self._bl: str = "boq_assistant-bard-web-server_20260421.09_p0"
        self._sid: str = ""
        # Per-conversation thread state: conv_id -> (response_id, choice_id).
        # Gemini's web protocol needs all three ids to chain a turn — passing
        # only conv_id starts a fresh branch with no memory. We track this
        # internally so callers only have to remember conversation_id.
        self._threads: Dict[str, tuple] = {}
        # Throttle bookkeeping (used by AccountPool to skip cooked sessions).
        self.throttled_until: float = 0.0
        self.last_used: float = 0.0

        s = requests.Session()
        s.headers.update(_BROWSER_HEADERS)

        # Proxy precedence: explicit arg > GEMINI_PROXY env > HTTPS_PROXY env.
        proxy_url = (
            (proxy or {}).get("https") if proxy else None
        ) or os.environ.get("GEMINI_PROXY") or os.environ.get("HTTPS_PROXY")
        if proxy_url:
            s.proxies.update({"http": proxy_url, "https": proxy_url})

        # Retry/backoff for transient network blips and 429/5xx responses.
        # We do NOT auto-retry POSTs (Gemini chat is non-idempotent), only
        # the idempotent GET /app probe and the auth refresh paths.
        if Retry is not None:
            retry = Retry(
                total=3,
                connect=3,
                read=2,
                backoff_factor=0.6,
                status_forcelist=(429, 500, 502, 503, 504),
                allowed_methods=frozenset(["GET", "HEAD"]),
                raise_on_status=False,
            )
            adapter = HTTPAdapter(
                max_retries=retry,
                pool_connections=8,
                pool_maxsize=16,
            )
            s.mount("https://", adapter)
            s.mount("http://", adapter)

        for k, v in self.cookies.items():
            s.cookies.set(k, v, domain=".google.com")
        self.session = s

    @property
    def is_throttled(self) -> bool:
        return time.time() < self.throttled_until

    def mark_throttled(self, cooldown: float = 600.0) -> None:
        """Mark this account as cooling down (used by AccountPool)."""
        self.throttled_until = time.time() + cooldown

    # ---- auth ---------------------------------------------------------
    def _fetch_snlm0e(self, force: bool = False) -> str:
        if not force and self._snlm0e and time.time() - self._snlm0e_at < 1500:
            return self._snlm0e
        r = self.session.get(_APP, timeout=20, allow_redirects=True)
        if r.status_code != 200:
            raise GeminiError(
                f"failed to load gemini app (status {r.status_code}); "
                "check that __Secure-1PSID / __Secure-1PSIDTS cookies are valid"
            )
        m = re.search(r'"SNlM0e":"([^"]+)"', r.text)
        if not m:
            raise GeminiError(
                "SNlM0e token not found — cookies likely expired or account "
                "is not signed in to gemini.google.com"
            )
        self._snlm0e = m.group(1)
        self._snlm0e_at = time.time()
        sid_m = re.search(r'"FdrFJe":"([^"]+)"', r.text)
        if sid_m:
            self._sid = sid_m.group(1)
        bl_m = re.search(r'"cfb2h":"([^"]+)"', r.text)
        if bl_m:
            self._bl = bl_m.group(1)
        return self._snlm0e

    # ---- chat ---------------------------------------------------------
    def chat(
        self,
        message: str,
        *,
        model: str = "fast",
        conversation_id: Optional[str] = None,
        response_id: Optional[str] = None,
        choice_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not message or not message.strip():
            raise GeminiError("message is required")

        model_key = normalize_model(model)
        model_id = MODELS.get(model_key, MODELS["fast"])

        # If caller passed only conversation_id, auto-fill the latest known
        # (response_id, choice_id) for that thread — required by Gemini to
        # chain context across turns.
        if conversation_id and not (response_id and choice_id):
            cached = self._threads.get(conversation_id)
            if cached:
                response_id = response_id or cached[0]
                choice_id   = choice_id   or cached[1]

        # Try once; on auth failure refresh SNlM0e and retry once.
        last_err: Optional[Exception] = None
        for attempt in range(2):
            snlm0e = self._fetch_snlm0e(force=attempt > 0)
            try:
                result = self._send(
                    message, model_key, model_id, snlm0e,
                    conversation_id, response_id, choice_id,
                )
                # Remember the latest turn so the next call with the same
                # conversation_id keeps memory automatically.
                cid = result.get("conversation_id")
                rid = result.get("response_id")
                ch  = result.get("choice_id")
                if cid and rid and ch:
                    self._threads[cid] = (rid, ch)
                return result
            except GeminiError as e:
                last_err = e
                if attempt == 0 and ("auth" in str(e).lower() or "snlm0e" in str(e).lower()):
                    continue
                raise

        raise last_err or GeminiError("unreachable")

    def _send(
        self,
        message: str,
        model_key: str,
        model_id: str,
        snlm0e: str,
        conversation_id: Optional[str],
        response_id: Optional[str],
        choice_id: Optional[str],
    ) -> Dict[str, Any]:
        # f.req inner payload mirrors what gemini.google.com's web client posts.
        thread = [conversation_id or "", response_id or "", choice_id or ""]
        inner = [[message], None, thread]
        f_req = json.dumps([None, json.dumps(inner)])

        # Model selection header — minimal form ([1,null,null,null,"<id>"]) is
        # what the live web client sends; adding extra positions makes
        # thinking/pro reject the request with status 13.
        x_goog = f'[1,null,null,null,"{model_id}"]'

        params = {
            "bl": self._bl,
            "f.sid": self._sid or str(int(time.time() * 1000) % 10_000_000_000),
            "hl": "en",
            "_reqid": str(int(time.time() * 1000) % 1_000_000),
            "rt": "c",
        }
        data = {"f.req": f_req, "at": snlm0e}

        r = self.session.post(
            _GENERATE,
            params=params,
            data=data,
            headers={
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                "x-goog-ext-525001261-jspb": x_goog,
            },
            timeout=120,
        )
        if r.status_code != 200:
            raise GeminiError(
                f"StreamGenerate http {r.status_code}: {r.text[:200]}"
            )

        return self._parse(r.text, model_key, model_id)

    # ---- response parsing --------------------------------------------
    @staticmethod
    def _iter_wrb_payloads(body: str):
        """Yield every parsed wrb.fr payload across all RPC chunks.

        Body is Google's chunked format: ``)]}'`` then repeating
        ``\\n<bytelen>\\n<json>``. The length is in **bytes** (UTF-8), so we
        walk the body in bytes — slicing characters breaks on multi-byte
        emoji that Gemini loves to use. Thinking/pro responses stream several
        frames; the final answer is usually only in a later chunk.
        """
        data = body.encode("utf-8") if isinstance(body, str) else body
        i = 0
        n = len(data)
        # Skip the optional leading `)]}'` xssi guard.
        if data[:5] == b")]}'\n":
            i = 5
        while i < n:
            # Find the next "\n<digits>\n" length prefix.
            nl = data.find(b"\n", i)
            if nl == -1:
                break
            j = nl + 1
            k = j
            while k < n and 0x30 <= data[k] <= 0x39:  # ascii digits
                k += 1
            if k == j or k >= n or data[k:k + 1] != b"\n":
                i = nl + 1
                continue
            length = int(data[j:k])
            start = k + 1
            chunk = data[start:start + length]
            i = start + length
            try:
                arr = json.loads(chunk.decode("utf-8", errors="replace"))
            except Exception:
                continue
            for entry in arr if isinstance(arr, list) else []:
                if (isinstance(entry, list) and len(entry) > 2
                        and entry[0] == "wrb.fr" and isinstance(entry[2], str)):
                    try:
                        yield json.loads(entry[2])
                    except Exception:
                        continue

    @classmethod
    def _parse(cls, body: str, model_key: str, model_id: str) -> Dict[str, Any]:
        conversation_id: Optional[str] = None
        response_id: Optional[str] = None
        candidates: List[Dict[str, Any]] = []

        for outer in cls._iter_wrb_payloads(body):
            # Thread ids: [conv_id, resp_id] live in outer[1] when present.
            if (len(outer) > 1 and isinstance(outer[1], list)
                    and outer[1] and isinstance(outer[1][0], str)):
                conversation_id = outer[1][0]
                if len(outer[1]) > 1 and isinstance(outer[1][1], str):
                    response_id = outer[1][1]
            # Candidates list lives in outer[4] when the answer is ready.
            if len(outer) > 4 and isinstance(outer[4], list):
                for c in outer[4]:
                    if not isinstance(c, list):
                        continue
                    cid = c[0] if len(c) > 0 and isinstance(c[0], str) else None
                    text = ""
                    if len(c) > 1 and isinstance(c[1], list) and c[1]:
                        first = c[1][0]
                        if isinstance(first, str):
                            text = first
                    if text or cid:
                        candidates.append({"choice_id": cid, "text": text})

        if conversation_id is None and not candidates:
            # Status-only frame (e.g. [13]) means the request was rejected,
            # almost always because the account is rate-limited. Tag a
            # short cooldown so the AccountPool will skip it for a while.
            raise GeminiError(
                "Gemini returned no candidates — account likely rate-limited "
                "(status 13). Try a different account or wait ~10–30 min."
            )

        # Prefer the longest non-empty candidate (later frames overwrite earlier
        # partial ones).
        best = max(
            (c for c in candidates if c["text"]),
            key=lambda c: len(c["text"]),
            default={"choice_id": None, "text": ""},
        )

        return {
            "text": best["text"],
            "conversation_id": conversation_id,
            "response_id": response_id,
            "choice_id": best["choice_id"],
            "model": model_key,
            "model_id": model_id,
            "candidates": candidates,
        }

    # ---- conversation management -------------------------------------
    def delete_conversation(self, conversation_id: str) -> bool:
        """Delete a single conversation thread on Gemini.

        Uses the same batchexecute RPC (`GzXR5e`) the web sidebar fires when
        you click the trash icon. Returns True on a 200 response. Forgets
        the local thread cache regardless so future chats start fresh even
        if the server already evicted it.
        """
        if not conversation_id:
            raise GeminiError("conversation_id is required")

        snlm0e = self._fetch_snlm0e()
        # Inner payload mirrors the live web client: just the conversation id
        # wrapped in two single-element lists.
        inner = [[conversation_id]]
        f_req = json.dumps([[[_RPC_DELETE, json.dumps(inner), None, "generic"]]])

        params = {
            "rpcids": _RPC_DELETE,
            "source-path": "/app",
            "bl": self._bl,
            "f.sid": self._sid or str(int(time.time() * 1000) % 10_000_000_000),
            "hl": "en",
            "_reqid": str(int(time.time() * 1000) % 1_000_000),
            "rt": "c",
        }
        data = {"f.req": f_req, "at": snlm0e}

        ok = False
        try:
            r = self.session.post(
                _BATCHEXECUTE, params=params, data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
                timeout=30,
            )
            ok = r.status_code == 200
        finally:
            self._threads.pop(conversation_id, None)
        return ok

    def delete_all_conversations(self) -> Dict[str, Any]:
        """Delete every conversation this client has tracked locally.

        Only deletes conversations created or chained through *this* client
        instance — we don't enumerate the account's full server-side history.
        That keeps the operation safe (won't nuke chats made in the browser
        UI) and matches the "delete what we made before testing" workflow.
        """
        ids = list(self._threads.keys())
        deleted, failed = [], []
        for cid in ids:
            try:
                if self.delete_conversation(cid):
                    deleted.append(cid)
                else:
                    failed.append(cid)
            except GeminiError:
                failed.append(cid)
        return {"deleted": deleted, "failed": failed, "count": len(deleted)}

    def known_conversations(self) -> List[str]:
        """Return ids of conversations this client is currently tracking."""
        return list(self._threads.keys())
