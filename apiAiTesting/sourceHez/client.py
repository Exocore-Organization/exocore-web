"""chat.z.ai web client (GLM-5-Turbo, free).

Two-step protocol:

1. ``POST /api/v1/chats/new`` — allocate a remote chat (only on the first
   message of a local conversation; the chat_id is then reused for every
   follow-up so we don't spam new chats upstream).
2. ``POST /api/v2/chat/completions?...`` — stream the assistant reply for the
   newest user message, referencing ``chat_id`` and the parent message id.

Auth is a Bearer JWT extracted from the ``token`` cookie at chat.z.ai.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Generator, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# X-Signature scheme reverse-engineered from chat.z.ai prod-fe-1.1.14.
# The signing key is rotated every 5 minutes by HMAC'ing a fixed seed
# against the current 5-min epoch bucket; the result is then used as the
# HMAC key over `sortedPayload|base64(message)|timestamp_ms`.
_SIG_SEED = "key-@@@@)))()((9))-xxxx&&&%%%%%"
_BUCKET_MS = 5 * 60 * 1000


def _jwt_user_id(token: str) -> str:
    """Pull the `id` claim out of the JWT (no signature verify)."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload).decode("utf-8"))
        v = data.get("id") or data.get("user_id") or ""
        return v if isinstance(v, str) else ""
    except Exception:
        return ""


def _zai_signature(message: str, timestamp_ms: int, request_id: str, user_id: str) -> str:
    """Compute the chat.z.ai X-Signature header value."""
    bucket = timestamp_ms // _BUCKET_MS
    rotated_key = hmac.new(
        _SIG_SEED.encode("utf-8"),
        str(bucket).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    # sortedPayload = Object.entries({timestamp, requestId, user_id})
    #                 .sort(([a],[b])=>a.localeCompare(b)).join(",")
    # When you .join(",") an array of [k,v] pairs each pair stringifies
    # to "k,v", so the final shape is "requestId,<r>,timestamp,<t>,user_id,<u>".
    pairs = [("timestamp", str(timestamp_ms)),
             ("requestId", request_id),
             ("user_id", user_id)]
    pairs.sort(key=lambda kv: kv[0])
    sorted_payload = ",".join(f"{k},{v}" for k, v in pairs)
    msg_b64 = base64.b64encode(message.encode("utf-8")).decode("ascii")
    data = f"{sorted_payload}|{msg_b64}|{timestamp_ms}"
    return hmac.new(
        rotated_key.encode("utf-8"),
        data.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

BASE_URL = "https://chat.z.ai"
NEW_CHAT_EP = "/api/v1/chats/new"
COMPLETIONS_EP = "/api/v2/chat/completions"
LIST_CHATS_EP = "/api/v1/chats/"
GET_CHAT_EP = "/api/v1/chats/{chat_id}"

CHROME_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)

MODELS = {"GLM-5-Turbo": "GLM-5-Turbo", "default": "GLM-5-Turbo"}
DEFAULT_MODEL = "GLM-5-Turbo"

# Asia/Manila offset (no DST)
_PH_TZ = timezone(timedelta(hours=8))


class SourceHezError(Exception):
    def __init__(self, message: str, status_code: int = 0, body: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


def _build_session(token: str) -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=2, backoff_factor=0.4,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET", "HEAD"),
    )
    s.mount("https://", HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=16))
    s.headers.update({
        "accept": "application/json",
        "accept-language": "en-US",
        "authorization": f"Bearer {token}",
        "content-type": "application/json",
        "user-agent": CHROME_UA,
        "origin": BASE_URL,
        "referer": BASE_URL + "/",
        "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="147", "Google Chrome";v="147"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Linux"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-fe-version": "prod-fe-1.1.14",
    })
    return s


class SourceHezClient:
    """chat.z.ai client. Token is required (extracted from cookies)."""

    def __init__(
        self,
        token: Optional[str] = None,
        cookies: Optional[Dict[str, str]] = None,
        timeout: int = 90,
    ):
        if not token and cookies:
            token = cookies.get("token")
        if not token:
            raise SourceHezError(
                "z.ai bearer token is required (cookie name: 'token')"
            )
        self.token = token
        self.timeout = timeout
        self.session = _build_session(token)
        self.user_id = _jwt_user_id(token)
        # Local conversation registry:
        #   {conv_id: {chat_id, parent_id, messages:[{role,content,id}]}}
        self._conversations: Dict[str, Dict[str, Any]] = {}

    # ---------- conversation registry ----------

    def create_conversation(self) -> str:
        cid = str(uuid.uuid4())
        self._conversations[cid] = {
            "chat_id": None,  # populated on first ask()
            "parent_id": None,
            "messages": [],
        }
        return cid

    def list_conversations(self) -> List[Dict[str, Any]]:
        return [
            {
                "conversation_id": cid,
                "chat_id": c.get("chat_id"),
                "messages": len(c.get("messages", [])),
            }
            for cid, c in self._conversations.items()
        ]

    def get_history(self, conversation_id: str) -> List[Dict[str, str]]:
        c = self._conversations.get(conversation_id)
        if not c:
            return []
        return [{"role": m["role"], "content": m["content"]} for m in c["messages"]]

    def delete_conversation(self, conversation_id: str, remote: bool = True) -> bool:
        c = self._conversations.pop(conversation_id, None)
        if c and remote and c.get("chat_id"):
            try:
                self.session.delete(
                    BASE_URL + GET_CHAT_EP.format(chat_id=c["chat_id"]),
                    timeout=self.timeout,
                )
            except requests.RequestException:
                pass
        return c is not None

    def delete_all(self, remote: bool = True) -> int:
        ids = list(self._conversations.keys())
        n = 0
        for cid in ids:
            if self.delete_conversation(cid, remote=remote):
                n += 1
        return n

    # ---------- upstream listing ----------

    def list_remote_chats(self, page: int = 1, type_: str = "default") -> Any:
        r = self.session.get(
            BASE_URL + LIST_CHATS_EP,
            params={"page": page, "type": type_}, timeout=self.timeout,
        )
        if r.status_code != 200:
            raise SourceHezError(f"list_remote_chats HTTP {r.status_code}",
                                 status_code=r.status_code, body=r.text[:300])
        return r.json()

    # ---------- chat ----------

    def ask(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        model: str = DEFAULT_MODEL,
        web_search: bool = False,
        thinking: bool = False,
    ) -> Dict[str, Any]:
        chunks: List[str] = []
        meta: Dict[str, Any] = {}
        for evt in self._ask_stream(
            message, conversation_id=conversation_id, model=model,
            web_search=web_search, thinking=thinking,
        ):
            piece = _extract_delta(evt)
            if piece:
                chunks.append(piece)
            if evt.get("_meta"):
                meta.update(evt["_meta"])
        text = "".join(chunks).strip()
        return {
            "text": text,
            "conversation_id": meta.get("conversation_id"),
            "chat_id": meta.get("chat_id"),
            "model": model,
        }

    def ask_stream(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        model: str = DEFAULT_MODEL,
        web_search: bool = False,
        thinking: bool = False,
    ) -> Generator[Dict[str, Any], None, None]:
        yield from self._ask_stream(
            message, conversation_id=conversation_id, model=model,
            web_search=web_search, thinking=thinking,
        )

    # ---------- internal ----------

    def _ensure_chat(self, conversation_id: str, first_user_msg: str, model: str) -> Tuple[str, str]:
        """Return (chat_id, user_msg_id), creating remote chat if needed."""
        conv = self._conversations[conversation_id]
        if conv.get("chat_id"):
            # already have a remote chat — just allocate a new user message id
            user_id = str(uuid.uuid4())
            return conv["chat_id"], user_id

        user_id = str(uuid.uuid4())
        ts = int(time.time())
        body = {"chat": {
            "id": "",
            "title": "New Chat",
            "models": [model],
            "params": {},
            "history": {
                "messages": {
                    user_id: {
                        "id": user_id, "parentId": None, "childrenIds": [],
                        "role": "user", "content": first_user_msg,
                        "timestamp": ts, "models": [model],
                    }
                },
                "currentId": user_id,
            },
            "tags": [], "flags": [],
            "features": [], "messages": [
                {"id": user_id, "parentId": None, "childrenIds": [],
                 "role": "user", "content": first_user_msg,
                 "timestamp": ts, "models": [model]}
            ],
            "timestamp": ts * 1000,
        }}
        r = self.session.post(BASE_URL + NEW_CHAT_EP, json=body, timeout=self.timeout)
        if r.status_code not in (200, 201):
            raise SourceHezError(f"chats/new HTTP {r.status_code}",
                                 status_code=r.status_code, body=r.text[:400])
        data = r.json() if r.text else {}
        chat_id = data.get("id") or data.get("chat", {}).get("id")
        if not chat_id:
            raise SourceHezError("chats/new returned no chat id", body=r.text[:400])
        conv["chat_id"] = chat_id
        return chat_id, user_id

    def _ask_stream(
        self,
        message: str,
        conversation_id: Optional[str],
        model: str,
        web_search: bool,
        thinking: bool,
    ) -> Generator[Dict[str, Any], None, None]:
        if not message or not isinstance(message, str):
            raise SourceHezError("message is required")
        model = MODELS.get(model, DEFAULT_MODEL)

        if conversation_id is None or conversation_id not in self._conversations:
            conversation_id = conversation_id or str(uuid.uuid4())
            self._conversations[conversation_id] = {
                "chat_id": None, "parent_id": None, "messages": [],
            }

        chat_id, user_msg_id = self._ensure_chat(conversation_id, message, model)
        conv = self._conversations[conversation_id]
        parent_id = conv.get("parent_id")  # last assistant id, or None for first turn

        # Build full message list (history + new user turn) for completions.
        messages_payload: List[Dict[str, str]] = []
        for m in conv["messages"]:
            messages_payload.append({"role": m["role"], "content": m["content"]})
        messages_payload.append({"role": "user", "content": message})

        now_ph = datetime.now(_PH_TZ)
        variables = {
            "{{USER_NAME}}": "User",
            "{{USER_LOCATION}}": "Unknown",
            "{{CURRENT_DATETIME}}": now_ph.strftime("%Y-%m-%d %H:%M:%S"),
            "{{CURRENT_DATE}}": now_ph.strftime("%Y-%m-%d"),
            "{{CURRENT_TIME}}": now_ph.strftime("%H:%M:%S"),
            "{{CURRENT_WEEKDAY}}": now_ph.strftime("%A"),
            "{{CURRENT_TIMEZONE}}": "Asia/Manila",
            "{{USER_LANGUAGE}}": "en-US",
        }
        completion_id = str(uuid.uuid4())
        body = {
            "stream": True,
            "model": model,
            "messages": messages_payload,
            "signature_prompt": message,
            "params": {},
            "extra": {},
            "features": {
                "image_generation": False,
                "web_search": web_search,
                "auto_web_search": web_search,
                "preview_mode": True,
                "flags": [],
                "vlm_tools_enable": False,
                "vlm_web_search_enable": False,
                "vlm_website_mode": False,
                "enable_thinking": thinking,
            },
            "variables": variables,
            "chat_id": chat_id,
            "id": completion_id,
            "current_user_message_id": user_msg_id,
            "current_user_message_parent_id": parent_id,
            "background_tasks": {"title_generation": True, "tags_generation": False},
        }

        ts_ms = int(time.time() * 1000)
        request_id = str(uuid.uuid4())
        x_signature = _zai_signature(message, ts_ms, request_id, self.user_id)
        params = {
            "timestamp": ts_ms,
            "requestId": request_id,
            "user_id": self.user_id,
            "version": "0.0.1",
            "platform": "web",
            "token": self.token,
            "user_agent": CHROME_UA,
            "language": "en-US",
            "languages": "en-US,en",
            "timezone": "Asia/Manila",
            "cookie_enabled": "true",
            "screen_width": "1600", "screen_height": "900",
            "screen_resolution": "1600x900",
            "viewport_height": "749", "viewport_width": "955",
            "viewport_size": "955x749",
            "color_depth": "24", "pixel_ratio": "1.2",
            "current_url": f"https://chat.z.ai/c/{chat_id}",
            "pathname": f"/c/{chat_id}",
            "host": "chat.z.ai", "hostname": "chat.z.ai",
            "protocol": "https:",
            "title": "Z.ai", "timezone_offset": "-480",
            "is_mobile": "false", "is_touch": "false",
            "max_touch_points": "0",
            "browser_name": "Chrome", "os_name": "Linux",
            "signature_timestamp": ts_ms,
        }

        try:
            resp = self.session.post(
                BASE_URL + COMPLETIONS_EP, params=params, json=body,
                timeout=self.timeout, stream=True,
                headers={
                    "accept": "text/event-stream, */*",
                    "x-signature": x_signature,
                },
            )
        except requests.RequestException as e:
            raise SourceHezError(f"completions request failed: {e}") from e

        if resp.status_code != 200:
            raise SourceHezError(
                f"completions HTTP {resp.status_code}",
                status_code=resp.status_code, body=resp.text[:500],
            )

        full_text: List[str] = []
        assistant_id: Optional[str] = None
        try:
            data_buf: List[str] = []
            for raw in resp.iter_lines(decode_unicode=True, chunk_size=4096):
                if raw is None:
                    continue
                line = raw.rstrip("\r")
                if line == "":
                    if data_buf:
                        evt = _parse_sse("\n".join(data_buf))
                        data_buf = []
                        if evt is not None:
                            piece = _extract_delta(evt)
                            if piece:
                                full_text.append(piece)
                            mid = _extract_message_id(evt)
                            if mid:
                                assistant_id = mid
                            yield evt
                    continue
                if line.startswith("data:"):
                    data_buf.append(line[5:].lstrip())
            if data_buf:
                evt = _parse_sse("\n".join(data_buf))
                if evt is not None:
                    piece = _extract_delta(evt)
                    if piece:
                        full_text.append(piece)
                    yield evt
        finally:
            resp.close()

        # Persist locally and update parent for next turn.
        text_final = "".join(full_text).strip()
        conv["messages"].append({"role": "user", "content": message, "id": user_msg_id})
        if text_final:
            aid = assistant_id or str(uuid.uuid4())
            conv["messages"].append({"role": "assistant", "content": text_final, "id": aid})
            conv["parent_id"] = aid
        else:
            conv["parent_id"] = user_msg_id

        # Surface meta on a synthetic final event for the non-streaming wrapper.
        yield {"_meta": {"conversation_id": conversation_id, "chat_id": chat_id}}


# ---------- SSE helpers ----------

def _parse_sse(payload: str) -> Optional[Dict[str, Any]]:
    payload = payload.strip()
    if not payload or payload == "[DONE]":
        return None
    try:
        return json.loads(payload)
    except (ValueError, json.JSONDecodeError):
        return {"_raw": payload}


def _extract_delta(evt: Dict[str, Any]) -> str:
    """Pull the incremental text token out of one SSE event."""
    if not isinstance(evt, dict):
        return ""
    # OpenAI-compatible: choices[0].delta.content
    choices = evt.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0] if isinstance(choices[0], dict) else {}
        delta = first.get("delta") or {}
        c = delta.get("content")
        if isinstance(c, str):
            return c
        msg = first.get("message") or {}
        c2 = msg.get("content")
        if isinstance(c2, str):
            return c2
    # z.ai sometimes emits {data:{delta_content:"..."}} or {content:"..."}.
    data = evt.get("data")
    if isinstance(data, dict):
        for key in ("delta_content", "edit_content", "content"):
            v = data.get(key)
            if isinstance(v, str):
                return v
    for key in ("delta_content", "content"):
        v = evt.get(key)
        if isinstance(v, str):
            return v
    return ""


def _extract_message_id(evt: Dict[str, Any]) -> Optional[str]:
    if not isinstance(evt, dict):
        return None
    for key in ("id", "message_id"):
        v = evt.get(key)
        if isinstance(v, str) and v:
            return v
    data = evt.get("data") if isinstance(evt.get("data"), dict) else None
    if data:
        for key in ("id", "message_id"):
            v = data.get(key)
            if isinstance(v, str) and v:
                return v
    return None
