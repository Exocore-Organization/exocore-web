"""AccountPool — round-robin Gemini accounts with throttle-aware failover.

Each account is one set of cookies (one Google login). The pool picks the
next non-throttled account for every chat. When one account hits the
status-13 throttle, it is marked cooling-down and the pool falls through
to the next available account automatically.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Dict, List, Optional

from .client import GeminiClient, GeminiError


class AccountPool:
    """Thread-safe pool of `GeminiClient`s keyed by a caller-chosen label.

    The pool keeps insertion order so round-robin is deterministic. Throttled
    accounts are skipped until their cooldown expires; if every account is
    cooling down, the call falls back to the least-recently-throttled one
    (so the user still gets a chance, with a clear error).
    """

    def __init__(self, default_cooldown: float = 600.0):
        self._clients: "Dict[str, GeminiClient]" = {}
        self._order: List[str] = []
        self._lock = threading.Lock()
        self._cursor = 0
        self.default_cooldown = default_cooldown

    # ---- registration ------------------------------------------------
    def add(self, cookies: Dict[str, str], label: Optional[str] = None,
            proxy: Optional[Dict[str, str]] = None) -> str:
        """Add or replace an account. Returns the label used."""
        client = GeminiClient(cookies=cookies, proxy=proxy, label=label)
        key = label or client.label
        with self._lock:
            if key in self._clients:
                # Replace silently (e.g. cookie refresh) without losing slot.
                self._clients[key] = client
            else:
                self._clients[key] = client
                self._order.append(key)
        return key

    def remove(self, label: str) -> bool:
        with self._lock:
            if label not in self._clients:
                return False
            del self._clients[label]
            self._order = [k for k in self._order if k != label]
            self._cursor %= max(len(self._order), 1)
            return True

    def clear(self) -> int:
        with self._lock:
            n = len(self._clients)
            self._clients.clear()
            self._order.clear()
            self._cursor = 0
            return n

    def labels(self) -> List[str]:
        with self._lock:
            return list(self._order)

    def status(self) -> List[Dict[str, Any]]:
        now = time.time()
        with self._lock:
            return [
                {
                    "label": k,
                    "throttled": c.is_throttled,
                    "cooldown_remaining": max(0.0, c.throttled_until - now),
                    "last_used": c.last_used,
                    "tracked_conversations": len(c._threads),
                }
                for k, c in ((k, self._clients[k]) for k in self._order)
            ]

    # ---- selection ---------------------------------------------------
    def _pick_locked(self) -> Optional[GeminiClient]:
        if not self._order:
            return None
        n = len(self._order)
        for offset in range(n):
            idx = (self._cursor + offset) % n
            client = self._clients[self._order[idx]]
            if not client.is_throttled:
                self._cursor = (idx + 1) % n
                return client
        # Everyone's cooling down — pick the one with the earliest expiry
        # so the user at least sees the soonest-recovery error.
        soonest = min(self._order, key=lambda k: self._clients[k].throttled_until)
        return self._clients[soonest]

    def get(self, label: Optional[str] = None) -> Optional[GeminiClient]:
        with self._lock:
            if label is not None:
                return self._clients.get(label)
            return self._pick_locked()

    # ---- chat (with auto-failover) -----------------------------------
    def chat(self, message: str, *, model: str = "fast",
             conversation_id: Optional[str] = None,
             max_failover: int = 3,
             prefer_label: Optional[str] = None,
             **kwargs) -> Dict[str, Any]:
        """Send a chat through the pool, rotating on rate-limits.

        If `prefer_label` is provided we try that account first (so callers
        can stick a conversation to whichever account owns it). On a
        throttle error we mark the account cooling-down and try the next
        one, up to `max_failover` attempts.
        """
        if not self._order:
            raise GeminiError("AccountPool is empty — register an account first")

        last_err: Optional[Exception] = None
        tried: List[str] = []

        for attempt in range(max_failover):
            with self._lock:
                if attempt == 0 and prefer_label and prefer_label in self._clients:
                    client = self._clients[prefer_label]
                else:
                    client = self._pick_locked()
            if client is None:
                break
            if client.label in tried:
                # avoid retrying the same account twice in a single call
                with self._lock:
                    client = self._pick_locked()
                if client is None or client.label in tried:
                    break
            tried.append(client.label)
            client.last_used = time.time()
            try:
                result = client.chat(
                    message, model=model,
                    conversation_id=conversation_id,
                    **kwargs,
                )
                result["account"] = client.label
                return result
            except GeminiError as e:
                last_err = e
                msg = str(e).lower()
                if "rate-limited" in msg or "status 13" in msg or "no candidates" in msg:
                    client.mark_throttled(self.default_cooldown)
                    continue
                # Non-throttle errors (auth, network) — surface immediately.
                raise

        raise last_err or GeminiError(
            f"All {len(tried)} account(s) failed/throttled: {tried}"
        )
