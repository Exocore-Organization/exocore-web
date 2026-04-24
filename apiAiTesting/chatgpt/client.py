"""ChatGPT web client — wraps chatgpt.com backend APIs using browser cookies / Bearer token."""

from __future__ import annotations

import base64
import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://chatgpt.com"

_SESSION_EP = "/api/auth/session"
_CONVERSATION_EP = "/backend-api/f/conversation"
_CONVERSATIONS_LIST_EP = "/backend-api/conversations"
_CONVERSATION_EP_DETAIL = "/backend-api/conversation/{id}"
_CHAT_REQUIREMENTS_EP = "/backend-api/sentinel/chat-requirements/prepare"

MODELS: Dict[str, str] = {
    "auto": "auto",
    "fast": "auto",
    "instant": "auto",
    "thinking": "o1",
    "o1": "o1",
    "o3-mini": "o3-mini",
    "gpt-4o": "gpt-4o",
    "gpt-4o-mini": "gpt-4o-mini",
}

_CHROME_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)

_BASE_CHROME_HEADERS = {
    "accept-language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="147", "Google Chrome";v="147"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Linux"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": _CHROME_UA,
    "origin": "https://chatgpt.com",
    "referer": "https://chatgpt.com/",
}

_OAI_CLIENT_BUILD = "6108575"
_OAI_CLIENT_VERSION = "prod-0968eaa36ab9ce5169914558a92ab3d845257ce0"


class ChatGPTError(Exception):
    def __init__(self, message: str, status_code: int = 0, body: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class RateLimitError(ChatGPTError):
    pass


class AuthError(ChatGPTError):
    pass


class ChatGPTClient:
    """
    Thin wrapper around chatgpt.com private APIs.

    Auth precedence (first non-empty wins):
      1. ``access_token`` constructor arg (Bearer JWT)
      2. Cookies → GET /api/auth/session → accessToken

    Conversation continuity:
      - ``_threads``: maps conversation_id → last assistant message_id
      - ``_pinned_id``: the currently pinned conversation_id
      - On chat with ``use_pinned=True`` and no conversation_id given,
        the pinned id is used automatically.
      - On a 429/rate-limit, a fresh conversation is created, then pinned.
    """

    def __init__(
        self,
        cookies: Optional[Dict[str, str]] = None,
        access_token: Optional[str] = None,
        device_id: Optional[str] = None,
        proxy: Optional[str] = None,
    ):
        self.session = requests.Session()
        retry = Retry(
            total=2,
            backoff_factor=0.5,
            status_forcelist=(502, 503, 504),
            allowed_methods={"GET"},
        )
        adapter = HTTPAdapter(
            max_retries=retry,
            pool_connections=4,
            pool_maxsize=8,
        )
        self.session.mount("https://", adapter)

        proxy_url = proxy or os.environ.get("CHATGPT_PROXY") or os.environ.get("HTTPS_PROXY")
        if proxy_url:
            self.session.proxies = {"https": proxy_url, "http": proxy_url}

        self.cookies: Dict[str, str] = dict(cookies or {})
        self._access_token: Optional[str] = access_token
        self.device_id: str = device_id or str(uuid.uuid4())
        self.session_id: str = str(uuid.uuid4())

        # Thread tracking: conv_id → last assistant message id
        self._threads: Dict[str, str] = {}
        # Pinned conversation
        self._pinned_id: Optional[str] = None

        if cookies:
            for k, v in cookies.items():
                self.session.cookies.set(k, v, domain="chatgpt.com")
                self.session.cookies.set(k, v, domain=".chatgpt.com")

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    def _get_access_token(self) -> str:
        if self._access_token:
            return self._access_token
        resp = self.session.get(
            f"{BASE_URL}{_SESSION_EP}",
            headers={**_BASE_CHROME_HEADERS, "accept": "application/json"},
            timeout=20,
        )
        if resp.status_code != 200:
            raise AuthError(
                f"Session fetch failed: HTTP {resp.status_code}",
                resp.status_code,
                resp.text[:500],
            )
        data = resp.json()
        token = data.get("accessToken") or data.get("access_token")
        if not token:
            raise AuthError("No accessToken in session response", 0, resp.text[:500])
        self._access_token = token
        return token

    def invalidate_token(self) -> None:
        """Force re-fetch of access token on next call."""
        self._access_token = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _oai_headers(self, accept: str = "*/*") -> Dict[str, str]:
        return {
            **_BASE_CHROME_HEADERS,
            "accept": accept,
            "content-type": "application/json",
            "authorization": f"Bearer {self._get_access_token()}",
            "oai-device-id": self.device_id,
            "oai-session-id": self.session_id,
            "oai-language": "en-US",
            "oai-client-build-number": _OAI_CLIENT_BUILD,
            "oai-client-version": _OAI_CLIENT_VERSION,
        }

    def _get_sentinel_token(self) -> Optional[str]:
        """Best-effort fetch of the chat requirements sentinel token."""
        try:
            ts = int(time.time() * 1000)
            p_payload = json.dumps([ts, _CHROME_UA, 0])
            p = base64.b64encode(p_payload.encode()).decode()
            resp = self.session.post(
                f"{BASE_URL}{_CHAT_REQUIREMENTS_EP}",
                headers={**self._oai_headers(), "accept": "*/*"},
                json={"p": p},
                timeout=12,
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("token") or data.get("chat_requirements_token")
        except Exception:
            pass
        return None

    # ------------------------------------------------------------------
    # Chat
    # ------------------------------------------------------------------

    def chat(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        model: str = "auto",
        use_pinned: bool = True,
    ) -> Dict[str, Any]:
        """
        Send a message. Returns:
          {text, conversation_id, parent_message_id, model, pinned_conversation_id}

        If use_pinned=True and conversation_id is None, uses the pinned conversation.
        On rate-limit, auto-creates a new conversation and pins it.
        """
        if use_pinned and conversation_id is None:
            conversation_id = self._pinned_id

        result = self._do_chat(message, conversation_id=conversation_id, model=model)

        if result.get("_rate_limited"):
            # Create fresh conversation
            result = self._do_chat(message, conversation_id=None, model=model)
            new_cid = result.get("conversation_id")
            if new_cid:
                self.pin_conversation(new_cid)

        result.pop("_rate_limited", None)
        result["pinned_conversation_id"] = self._pinned_id
        return result

    def _do_chat(
        self,
        message: str,
        conversation_id: Optional[str],
        model: str,
    ) -> Dict[str, Any]:
        msg_id = str(uuid.uuid4())
        parent_id = self._threads.get(conversation_id or "") or str(uuid.uuid4())
        model_slug = MODELS.get(model, model)

        payload: Dict[str, Any] = {
            "action": "next",
            "messages": [
                {
                    "id": msg_id,
                    "author": {"role": "user"},
                    "create_time": time.time(),
                    "content": {"content_type": "text", "parts": [message]},
                    "metadata": {},
                }
            ],
            "parent_message_id": parent_id,
            "model": model_slug,
            "timezone_offset_min": -480,
            "timezone": "Asia/Manila",
            "conversation_mode": {"kind": "primary_assistant"},
            "supports_buffering": True,
            "supported_encodings": ["v1"],
            "client_prepare_state": "none",
            "system_hints": [],
        }
        if conversation_id:
            payload["conversation_id"] = conversation_id

        headers = {**self._oai_headers(accept="text/event-stream")}

        sentinel = self._get_sentinel_token()
        if sentinel:
            headers["openai-sentinel-chat-requirements-token"] = sentinel

        try:
            resp = self.session.post(
                f"{BASE_URL}{_CONVERSATION_EP}",
                headers=headers,
                json=payload,
                stream=True,
                timeout=(12, 120),
            )
        except requests.Timeout:
            raise ChatGPTError("Request timed out")

        if resp.status_code == 429:
            return {"_rate_limited": True, "error": "rate_limited", "conversation_id": conversation_id}
        if resp.status_code in (401, 403):
            self._access_token = None
            raise AuthError(f"Auth failed: HTTP {resp.status_code}", resp.status_code, resp.text[:200])
        if resp.status_code != 200:
            raise ChatGPTError(
                f"Chat request failed: HTTP {resp.status_code}",
                resp.status_code,
                resp.text[:500],
            )

        return self._parse_sse(resp)

    def _parse_sse(self, resp: requests.Response) -> Dict[str, Any]:
        text = ""
        conversation_id: Optional[str] = None
        assistant_msg_id: Optional[str] = None
        model_slug: Optional[str] = None

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

            if isinstance(data, dict) and data.get("error"):
                err = str(data["error"])
                if any(k in err.lower() for k in ("rate", "limit", "quota")):
                    return {"_rate_limited": True, "error": err, "conversation_id": conversation_id}
                raise ChatGPTError(err)

            # v1 buffered encoding — "v" contains a text delta
            v = data.get("v")
            if isinstance(v, str):
                text += v
                conversation_id = data.get("c") or conversation_id
                # assistant message id
                p = data.get("p", "")
                if isinstance(p, str) and p.startswith("/message/"):
                    # path like "/message/<uuid>/content/parts/0"
                    parts = p.split("/")
                    if len(parts) >= 3:
                        candidate = parts[2]
                        if len(candidate) > 10:
                            assistant_msg_id = candidate

            # Legacy / non-buffered format
            if isinstance(v, dict):
                conversation_id = v.get("conversation_id") or conversation_id

            if "conversation_id" in data:
                conversation_id = data["conversation_id"]

            msg = data.get("message")
            if isinstance(msg, dict):
                assistant_msg_id = msg.get("id") or assistant_msg_id
                model_slug = msg.get("model_slug") or model_slug or data.get("model_slug")
                content = msg.get("content", {})
                if isinstance(content, dict) and not text:
                    for part in content.get("parts", []):
                        if isinstance(part, str):
                            text += part

        if conversation_id and assistant_msg_id:
            self._threads[conversation_id] = assistant_msg_id

        return {
            "text": text,
            "conversation_id": conversation_id,
            "parent_message_id": assistant_msg_id,
            "model": model_slug,
        }

    # ------------------------------------------------------------------
    # Conversation management
    # ------------------------------------------------------------------

    def pin_conversation(self, conversation_id: str, server_pin: bool = True) -> bool:
        """
        Set conversation as the local pinned ID.
        Optionally also tells chatgpt.com to mark it pinned (server_pin=True).
        Returns True if server call succeeded (or server_pin=False).
        """
        self._pinned_id = conversation_id
        if not server_pin:
            return True
        try:
            resp = self.session.patch(
                f"{BASE_URL}{_CONVERSATION_EP_DETAIL.format(id=conversation_id)}",
                headers={**self._oai_headers(), "accept": "*/*"},
                json={"is_pinned": True},
                timeout=15,
            )
            return resp.status_code == 200
        except Exception:
            return False

    def unpin_conversation(self, conversation_id: str) -> bool:
        if self._pinned_id == conversation_id:
            self._pinned_id = None
        try:
            resp = self.session.patch(
                f"{BASE_URL}{_CONVERSATION_EP_DETAIL.format(id=conversation_id)}",
                headers={**self._oai_headers(), "accept": "*/*"},
                json={"is_pinned": False},
                timeout=15,
            )
            return resp.status_code == 200
        except Exception:
            return False

    def delete_conversation(self, conversation_id: str) -> bool:
        """Soft-delete (hide) a conversation on chatgpt.com."""
        try:
            resp = self.session.patch(
                f"{BASE_URL}{_CONVERSATION_EP_DETAIL.format(id=conversation_id)}",
                headers={**self._oai_headers(), "accept": "*/*"},
                json={"is_visible": False},
                timeout=15,
            )
            ok = resp.status_code == 200
        except Exception:
            ok = False
        self._threads.pop(conversation_id, None)
        if self._pinned_id == conversation_id:
            self._pinned_id = None
        return ok

    def delete_all_tracked(self) -> Dict[str, int]:
        """Delete every conversation this client instance has tracked."""
        success = 0
        failed = 0
        for cid in list(self._threads.keys()):
            if self.delete_conversation(cid):
                success += 1
            else:
                failed += 1
        return {"deleted": success, "failed": failed}

    def list_conversations(self, limit: int = 28) -> List[Dict]:
        try:
            resp = self.session.get(
                f"{BASE_URL}{_CONVERSATIONS_LIST_EP}",
                headers={**self._oai_headers(), "accept": "*/*"},
                params={"offset": 0, "limit": limit, "order": "updated"},
                timeout=15,
            )
            if resp.status_code == 200:
                return resp.json().get("items", [])
        except Exception:
            pass
        return []

    def create_conversation(self, first_message: str, model: str = "auto") -> Dict[str, Any]:
        """Create a new conversation by sending the first message."""
        return self._do_chat(first_message, conversation_id=None, model=model)

    # ------------------------------------------------------------------
    # State inspection
    # ------------------------------------------------------------------

    def get_pinned_id(self) -> Optional[str]:
        return self._pinned_id

    def tracked_conversation_ids(self) -> List[str]:
        return list(self._threads.keys())
