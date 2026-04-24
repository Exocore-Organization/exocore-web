"""DeepAI free chat client (deepai.org/chat).

The public-facing free tier exposes a single model alias ``standard``. The
endpoint is the (entertainingly named) ``/hacking_is_a_serious_crime`` POST
which takes a ``multipart/form-data`` body and streams plain-text response.

No cookies, no API key required — the server happily accepts anonymous
requests when the multipart body includes the expected fields.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, Generator, Iterable, List, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://api.deepai.org"
CHAT_EP = "/hacking_is_a_serious_crime"

CHROME_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)

_HEADERS = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": CHROME_UA,
    "origin": "https://deepai.org",
    "referer": "https://deepai.org/",
    "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="147", "Google Chrome";v="147"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Linux"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
}

MODELS = {
    "standard": "standard",
}
DEFAULT_MODEL = "standard"
DEFAULT_CHAT_STYLE = "what-is-ai"


class DeepAIError(Exception):
    def __init__(self, message: str, status_code: int = 0, body: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


def _build_session() -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET", "HEAD"),
    )
    s.mount("https://", HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=16))
    s.headers.update(_HEADERS)
    return s


class DeepAIClient:
    """Anonymous DeepAI chat client.

    Conversation state (history) is kept in-process keyed by ``conversation_id``
    (a UUID). Only the model alias ``standard`` is available on the free tier.
    """

    def __init__(self, timeout: int = 60):
        self.timeout = timeout
        self.session = _build_session()
        self._conversations: Dict[str, List[Dict[str, str]]] = {}

    # ---------- conversations ----------

    def create_conversation(self) -> str:
        cid = str(uuid.uuid4())
        self._conversations[cid] = []
        return cid

    def list_conversations(self) -> List[str]:
        return list(self._conversations.keys())

    def get_history(self, conversation_id: str) -> List[Dict[str, str]]:
        return list(self._conversations.get(conversation_id, []))

    def delete_conversation(self, conversation_id: str) -> bool:
        return self._conversations.pop(conversation_id, None) is not None

    def delete_all(self) -> int:
        n = len(self._conversations)
        self._conversations.clear()
        return n

    # ---------- chat ----------

    def chat(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        model: str = DEFAULT_MODEL,
        chat_style: str = DEFAULT_CHAT_STYLE,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        text = "".join(self._chat_stream(
            message, conversation_id=conversation_id, model=model,
            chat_style=chat_style, history=history,
        ))
        return {
            "text": text,
            "conversation_id": self._last_conversation_id,
            "model": model,
        }

    def chat_stream(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        model: str = DEFAULT_MODEL,
        chat_style: str = DEFAULT_CHAT_STYLE,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Generator[str, None, None]:
        yield from self._chat_stream(
            message, conversation_id=conversation_id, model=model,
            chat_style=chat_style, history=history,
        )

    # ---------- internal ----------

    def _chat_stream(
        self,
        message: str,
        conversation_id: Optional[str],
        model: str,
        chat_style: str,
        history: Optional[List[Dict[str, str]]],
    ) -> Iterable[str]:
        if not message or not isinstance(message, str):
            raise DeepAIError("message is required")
        slug = MODELS.get(model.lower() if model else "", DEFAULT_MODEL)

        if conversation_id is None:
            conversation_id = self.create_conversation()
        elif conversation_id not in self._conversations:
            self._conversations[conversation_id] = []

        # Caller-supplied history wins (stateless mode); else use stored.
        if history is None:
            convo = list(self._conversations[conversation_id])
        else:
            convo = [
                {"role": str(m.get("role", "user")), "content": str(m.get("content", ""))}
                for m in history if m.get("content")
            ]
        convo.append({"role": "user", "content": message})

        files = {
            "chat_style": (None, chat_style),
            "chatHistory": (None, json.dumps(convo, ensure_ascii=False)),
            "model": (None, slug),
            "session_uuid": (None, conversation_id),
            "sensitivity_request_id": (None, str(uuid.uuid4())),
            "hacker_is_stinky": (None, "very_stinky"),
            "enabled_tools": (None, "[]"),
        }

        try:
            resp = self.session.post(
                BASE_URL + CHAT_EP, files=files, timeout=self.timeout, stream=True,
            )
        except requests.RequestException as e:
            raise DeepAIError(f"Request failed: {e}") from e

        if resp.status_code != 200:
            body = resp.text[:400]
            raise DeepAIError(
                f"DeepAI HTTP {resp.status_code}", status_code=resp.status_code, body=body,
            )

        chunks: List[str] = []
        try:
            for raw in resp.iter_content(chunk_size=None, decode_unicode=True):
                if not raw:
                    continue
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8", errors="replace")
                chunks.append(raw)
                yield raw
        finally:
            resp.close()

        full_text = "".join(chunks).strip()
        # Persist history for stateful continuity (only when caller didn't override).
        if history is None:
            self._conversations[conversation_id].append({"role": "user", "content": message})
            if full_text:
                self._conversations[conversation_id].append(
                    {"role": "assistant", "content": full_text}
                )
        self._last_conversation_id = conversation_id

    _last_conversation_id: Optional[str] = None
