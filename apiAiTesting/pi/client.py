"""Pi.ai web client — wraps pi.ai backend APIs using browser session cookies."""

from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://pi.ai"

_CHAT_EP = "/api/v2/chat"
_CONVERSATIONS_EP = "/api/conversations"
_CHAT_HISTORY_EP = "/api/chat/history"
_GREETING_EP = "/api/greeting"
_DISCOVER_EP = "/api/discover"
_CONVERSATION_EP = "/api/conversations/{id}"

_CHROME_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)

_BASE_HEADERS = {
    "accept-language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="147", "Google Chrome";v="147"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Linux"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": _CHROME_UA,
    "origin": "https://pi.ai",
    "referer": "https://pi.ai/talk",
}

REQUIRED_COOKIE = "__Secure-pi-session"


class PiError(Exception):
    def __init__(self, message: str, status_code: int = 0, body: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class RateLimitError(PiError):
    pass


class AuthError(PiError):
    pass


class PiClient:
    """
    Thin wrapper around pi.ai private APIs.

    Auth: Pi.ai uses cookie-based sessions. Key cookies:
      - ``__Secure-pi-session``  (required — the auth session token)
      - ``__Host-session``       (same value, hostOnly variant)
      - ``__Secure-pi-auth-state`` (usually "1")
      - ``__cf_bm``              (Cloudflare bot-mgmt, rotates every 30 min)

    Conversation continuity:
      - Pi.ai is stateful on the server side — just pass the same
        ``conversation`` ID and it remembers the full history.
      - ``_tracked``: set of conversation IDs this client has used.
      - ``_pinned_id``: the currently active conversation ID.
    """

    def __init__(
        self,
        cookies: Dict[str, str],
        proxy: Optional[str] = None,
    ):
        self.session = requests.Session()
        retry = Retry(
            total=2,
            backoff_factor=0.5,
            status_forcelist=(502, 503, 504),
            allowed_methods={"GET"},
        )
        self.session.mount(
            "https://",
            HTTPAdapter(max_retries=retry, pool_connections=4, pool_maxsize=8),
        )

        proxy_url = proxy or os.environ.get("PI_PROXY") or os.environ.get("HTTPS_PROXY")
        if proxy_url:
            self.session.proxies = {"https": proxy_url, "http": proxy_url}

        self.cookies: Dict[str, str] = dict(cookies)
        for k, v in cookies.items():
            self.session.cookies.set(k, v, domain="pi.ai")
            self.session.cookies.set(k, v, domain=".pi.ai")

        # Analytics IDs (generated once per client instance)
        self._distinct_id: str = str(uuid.uuid4())
        self._session_id: str = str(uuid.uuid4())

        # Conversation tracking
        self._tracked: set = set()
        self._pinned_id: Optional[str] = None

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _headers(self, accept: str = "application/json", api_version: Optional[str] = None) -> Dict[str, str]:
        h = {**_BASE_HEADERS, "accept": accept}
        if api_version:
            h["x-api-version"] = api_version
        return h

    def _check_auth(self, resp: requests.Response) -> None:
        if resp.status_code in (401, 403):
            raise AuthError(f"Auth failed: HTTP {resp.status_code}", resp.status_code, resp.text[:300])

    # ------------------------------------------------------------------
    # Chat
    # ------------------------------------------------------------------

    def chat(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        use_pinned: bool = True,
    ) -> Dict[str, Any]:
        """
        Send a message. Returns {text, conversation_id, sid}.

        If use_pinned=True and no conversation_id given, uses the pinned conversation.
        If there's no pinned conversation, creates a new one first.
        On 429, raises RateLimitError.
        """
        if use_pinned and conversation_id is None:
            conversation_id = self._pinned_id

        if conversation_id is None:
            conv = self.create_conversation()
            conversation_id = conv.get("sid") or conv.get("id")
            if conversation_id:
                self.pin_conversation(conversation_id)

        return self._do_chat(message, conversation_id)

    def _do_chat(self, message: str, conversation_id: str) -> Dict[str, Any]:
        payload = {
            "text": message,
            "conversation": conversation_id,
            "eqDistinctId": self._distinct_id,
            "eqSessionId": self._session_id,
            "clientId": str(uuid.uuid4()),
        }
        headers = {
            **self._headers(accept="text/event-stream", api_version="5"),
            "content-type": "application/json",
            "priority": "u=1, i",
        }

        try:
            resp = self.session.post(
                f"{BASE_URL}{_CHAT_EP}",
                headers=headers,
                json=payload,
                stream=True,
                timeout=(12, 120),
            )
        except requests.Timeout:
            raise PiError("Request timed out")

        self._check_auth(resp)

        if resp.status_code == 429:
            raise RateLimitError("Pi.ai rate limit hit", 429, "")
        if resp.status_code != 200:
            raise PiError(f"Chat failed: HTTP {resp.status_code}", resp.status_code, resp.text[:400])

        result = self._parse_sse(resp)
        result["conversation_id"] = conversation_id
        self._tracked.add(conversation_id)
        result["pinned_conversation_id"] = self._pinned_id
        return result

    def _parse_sse(self, resp: requests.Response) -> Dict[str, Any]:
        """
        Pi.ai SSE format (v2):
          data: {"text": "growing full text...", "sid": "...", "isComplete": false}
          data: {"text": "final full text.", "sid": "...", "isComplete": true}
        Each event has the FULL text so far (not a delta).
        The last event with isComplete=true has the final answer.
        """
        text = ""
        sid: Optional[str] = None

        for raw in resp.iter_lines():
            if not raw:
                continue
            line: str = raw.decode("utf-8") if isinstance(raw, bytes) else raw

            if not line.startswith("data: "):
                continue
            data_str = line[6:]
            if data_str.strip() == "[DONE]":
                break
            try:
                data = json.loads(data_str)
            except Exception:
                continue

            if isinstance(data, dict):
                if data.get("error"):
                    err = str(data["error"])
                    if any(k in err.lower() for k in ("rate", "limit", "quota")):
                        raise RateLimitError(err, 429, "")
                    raise PiError(err)

                sid = data.get("sid") or sid
                if "text" in data:
                    text = data["text"]

                if data.get("isComplete"):
                    break

        return {"text": text, "sid": sid}

    # ------------------------------------------------------------------
    # Conversation management
    # ------------------------------------------------------------------

    def create_conversation(self) -> Dict[str, Any]:
        """Create a new Pi.ai conversation. Returns the conversation object."""
        headers = {
            **self._headers(api_version="2"),
            "content-type": "application/json",
        }
        resp = self.session.post(
            f"{BASE_URL}{_CONVERSATIONS_EP}",
            headers=headers,
            json={},
            timeout=15,
        )
        self._check_auth(resp)
        if resp.status_code != 200:
            raise PiError(f"Create conversation failed: HTTP {resp.status_code}", resp.status_code, resp.text[:300])
        return resp.json()

    def list_conversations(self, include_deleted: bool = False) -> List[Dict]:
        """List all conversations for this account."""
        headers = self._headers(api_version="2")
        resp = self.session.get(
            f"{BASE_URL}{_CONVERSATIONS_EP}",
            headers=headers,
            params={"includeDeleted": str(include_deleted).lower()},
            timeout=15,
        )
        self._check_auth(resp)
        if resp.status_code != 200:
            raise PiError(f"List conversations failed: HTTP {resp.status_code}", resp.status_code, resp.text[:300])
        data = resp.json()
        if isinstance(data, list):
            return data
        return data.get("conversations") or data.get("items") or []

    def get_history(self, conversation_id: str, limit: int = 100) -> List[Dict]:
        """Fetch chat history for a conversation."""
        headers = self._headers(api_version="2")
        resp = self.session.get(
            f"{BASE_URL}{_CHAT_HISTORY_EP}",
            headers=headers,
            params={"conversation": conversation_id, "limit": limit},
            timeout=15,
        )
        self._check_auth(resp)
        if resp.status_code != 200:
            raise PiError(f"History failed: HTTP {resp.status_code}", resp.status_code, resp.text[:300])
        data = resp.json()
        if isinstance(data, list):
            return data
        return data.get("messages") or []

    def delete_conversation(self, conversation_id: str) -> bool:
        """Delete (or archive) a Pi.ai conversation."""
        headers = {**self._headers(), "content-type": "application/json"}

        # Try DELETE first (REST convention)
        try:
            resp = self.session.delete(
                f"{BASE_URL}{_CONVERSATION_EP.format(id=conversation_id)}",
                headers=headers,
                timeout=15,
            )
            if resp.status_code in (200, 204):
                self._tracked.discard(conversation_id)
                if self._pinned_id == conversation_id:
                    self._pinned_id = None
                return True
        except Exception:
            pass

        # Fallback: PATCH with deleted=true
        try:
            resp = self.session.patch(
                f"{BASE_URL}{_CONVERSATION_EP.format(id=conversation_id)}",
                headers=headers,
                json={"deleted": True},
                timeout=15,
            )
            ok = resp.status_code in (200, 204)
        except Exception:
            ok = False

        self._tracked.discard(conversation_id)
        if self._pinned_id == conversation_id:
            self._pinned_id = None
        return ok

    def delete_all_tracked(self) -> Dict[str, int]:
        """Delete all conversations this client instance has tracked."""
        success = 0
        failed = 0
        for cid in list(self._tracked):
            if self.delete_conversation(cid):
                success += 1
            else:
                failed += 1
        return {"deleted": success, "failed": failed}

    def pin_conversation(self, conversation_id: str) -> None:
        """Set the locally pinned conversation ID."""
        self._pinned_id = conversation_id
        self._tracked.add(conversation_id)

    def unpin_conversation(self) -> None:
        """Clear the pinned conversation ID."""
        self._pinned_id = None

    # ------------------------------------------------------------------
    # Misc
    # ------------------------------------------------------------------

    def greeting(self) -> Dict:
        """Fetch Pi's greeting message."""
        resp = self.session.get(
            f"{BASE_URL}{_GREETING_EP}",
            headers=self._headers(),
            timeout=12,
        )
        self._check_auth(resp)
        if resp.status_code == 200:
            return resp.json()
        raise PiError(f"Greeting failed: HTTP {resp.status_code}", resp.status_code)

    def discover(self) -> Dict:
        """Fetch Pi's discover / topic suggestions."""
        resp = self.session.get(
            f"{BASE_URL}{_DISCOVER_EP}",
            headers=self._headers(api_version="2"),
            timeout=12,
        )
        self._check_auth(resp)
        if resp.status_code == 200:
            return resp.json()
        raise PiError(f"Discover failed: HTTP {resp.status_code}", resp.status_code)

    # ------------------------------------------------------------------
    # State inspection
    # ------------------------------------------------------------------

    def get_pinned_id(self) -> Optional[str]:
        return self._pinned_id

    def tracked_conversation_ids(self) -> List[str]:
        return list(self._tracked)
