"""Perplexity AI ('pixeai') web client.

Wraps the SSE chat endpoint at ``https://www.perplexity.ai/rest/sse/perplexity_ask``.

The free tier exposes one model alias ``turbo`` under mode ``copilot``. Anonymous
(no-cookie) requests are accepted but rate-limited; logged-in cookies
(`__Secure-next-auth.session-token`) raise the limit considerably.

Conversation continuity is approximated by reusing the same
``frontend_context_uuid`` across follow-up calls; deeper threading would need
the ``last_backend_uuid`` / ``read_write_token`` returned by the SSE stream
(future work — current API treats every call as the start of a new thread).
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, Generator, Iterable, List, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://www.perplexity.ai"
ASK_EP = "/rest/sse/perplexity_ask"

CHROME_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)

_HEADERS = {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
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
    "x-app-apiclient": "default",
    "x-app-apiversion": "2.18",
    "x-perplexity-request-endpoint": BASE_URL + ASK_EP,
    "x-perplexity-request-reason": "ask-input-inner-home",
    "x-perplexity-request-try-number": "1",
}

# Free-tier surface: 1 mode, 1 model.
MODES = {"copilot": "copilot", "concise": "concise", "auto": "copilot"}
MODELS = {"turbo": "turbo", "default": "turbo"}
DEFAULT_MODE = "copilot"
DEFAULT_MODEL = "turbo"


class PixeAIError(Exception):
    def __init__(self, message: str, status_code: int = 0, body: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


def _build_session() -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=3, backoff_factor=0.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET", "HEAD"),
    )
    s.mount("https://", HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=16))
    s.headers.update(_HEADERS)
    return s


class PixeAIClient:
    """Anonymous-friendly Perplexity web client."""

    def __init__(self, cookies: Optional[Dict[str, str]] = None, timeout: int = 90):
        self.timeout = timeout
        self.session = _build_session()
        if cookies:
            for k, v in cookies.items():
                self.session.cookies.set(k, v)
        # Local conversation registry: {conversation_id: {messages, frontend_uuid, created}}
        self._conversations: Dict[str, Dict[str, Any]] = {}

    # ---------- conversations ----------

    def create_conversation(self) -> str:
        cid = str(uuid.uuid4())
        self._conversations[cid] = {
            "messages": [],
            "frontend_uuid": str(uuid.uuid4()),
            "created": time.time(),
        }
        return cid

    def list_conversations(self) -> List[str]:
        return list(self._conversations.keys())

    def get_history(self, conversation_id: str) -> List[Dict[str, str]]:
        c = self._conversations.get(conversation_id)
        return list(c["messages"]) if c else []

    def delete_conversation(self, conversation_id: str) -> bool:
        return self._conversations.pop(conversation_id, None) is not None

    def delete_all(self) -> int:
        n = len(self._conversations)
        self._conversations.clear()
        return n

    # ---------- chat ----------

    def ask(
        self,
        query: str,
        conversation_id: Optional[str] = None,
        mode: str = DEFAULT_MODE,
        model: str = DEFAULT_MODEL,
        search_focus: str = "internet",
        sources: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Non-streaming convenience wrapper. Returns the final answer + sources."""
        final: Dict[str, Any] = {"text": "", "sources": [], "raw_events": 0}
        for evt in self._ask_stream(
            query, conversation_id=conversation_id, mode=mode, model=model,
            search_focus=search_focus, sources=sources,
        ):
            final["raw_events"] += 1
            txt = _extract_answer_text(evt)
            if txt:
                final["text"] = txt  # answer rebuilds cumulatively in events
            srcs = _extract_sources(evt)
            if srcs:
                final["sources"] = srcs
        final["conversation_id"] = self._last_conversation_id
        final["mode"] = MODES.get(mode.lower(), DEFAULT_MODE)
        final["model"] = MODELS.get(model.lower(), DEFAULT_MODEL)
        return final

    def ask_stream(
        self,
        query: str,
        conversation_id: Optional[str] = None,
        mode: str = DEFAULT_MODE,
        model: str = DEFAULT_MODEL,
        search_focus: str = "internet",
        sources: Optional[List[str]] = None,
    ) -> Generator[Dict[str, Any], None, None]:
        yield from self._ask_stream(
            query, conversation_id=conversation_id, mode=mode, model=model,
            search_focus=search_focus, sources=sources,
        )

    # ---------- internal ----------

    def _ask_stream(
        self,
        query: str,
        conversation_id: Optional[str],
        mode: str,
        model: str,
        search_focus: str,
        sources: Optional[List[str]],
    ) -> Iterable[Dict[str, Any]]:
        if not query or not isinstance(query, str):
            raise PixeAIError("query is required")

        mode_slug = MODES.get((mode or DEFAULT_MODE).lower(), DEFAULT_MODE)
        model_slug = MODELS.get((model or DEFAULT_MODEL).lower(), DEFAULT_MODEL)

        if conversation_id is None:
            conversation_id = self.create_conversation()
        elif conversation_id not in self._conversations:
            self._conversations[conversation_id] = {
                "messages": [], "frontend_uuid": str(uuid.uuid4()),
                "created": time.time(),
            }

        conv = self._conversations[conversation_id]
        params = {
            "attachments": [],
            "language": "en-US",
            "timezone": "Asia/Manila",
            "search_focus": search_focus,
            "sources": sources or ["web"],
            "frontend_uuid": conv["frontend_uuid"],
            "mode": mode_slug,
            "model_preference": model_slug,
            "is_related_query": False,
            "is_sponsored": False,
            "frontend_context_uuid": conversation_id,
            "prompt_source": "user",
            "query_source": "home",
            "is_incognito": False,
            "use_schematized_api": True,
            "send_back_text_in_streaming_api": True,
            "supported_block_use_cases": ["answer_modes"],
            "client_coordinates": None,
            "mentions": [],
            "dsl_query": query,
            "skip_search_enabled": False,
            "is_nav_suggestions_disabled": True,
            "source": "default",
            "always_search_override": False,
            "override_no_search": False,
            "client_search_results_cache_key": conv["frontend_uuid"],
            "should_ask_for_mcp_tool_confirmation": False,
            "extended_context": False,
            "version": "2.18",
        }
        body = {"params": params, "query_str": query}

        try:
            resp = self.session.post(
                BASE_URL + ASK_EP, json=body,
                timeout=self.timeout, stream=True,
            )
        except requests.RequestException as e:
            raise PixeAIError(f"Request failed: {e}") from e

        if resp.status_code != 200:
            raise PixeAIError(
                f"Perplexity HTTP {resp.status_code}",
                status_code=resp.status_code, body=resp.text[:500],
            )

        # SSE parser using iter_lines: each event is `event: ...\ndata: {...}\n\n`.
        best_text = ""
        data_buf: List[str] = []

        def _flush() -> Optional[Dict[str, Any]]:
            nonlocal data_buf
            if not data_buf:
                return None
            evt = _parse_sse_payload("\n".join(data_buf))
            data_buf = []
            return evt

        try:
            for raw in resp.iter_lines(decode_unicode=True, chunk_size=8192):
                if raw is None:
                    continue
                line = raw.rstrip("\r")
                if line == "":
                    evt = _flush()
                    if evt is None:
                        continue
                    t = _extract_answer_text(evt)
                    if t:
                        best_text = t
                    yield evt
                    continue
                if line.startswith("data:"):
                    data_buf.append(line[5:].lstrip())
            evt = _flush()
            if evt is not None:
                t = _extract_answer_text(evt)
                if t:
                    best_text = t
                yield evt
        finally:
            resp.close()

        # Persist a tidy entry to local history (best effort).
        final_text = best_text
        conv["messages"].append({"role": "user", "content": query})
        if final_text:
            conv["messages"].append({"role": "assistant", "content": final_text})
        self._last_conversation_id = conversation_id

    _last_conversation_id: Optional[str] = None


# ---------- SSE event helpers ----------

def _parse_sse_payload(payload: str) -> Optional[Dict[str, Any]]:
    payload = payload.strip()
    if not payload or payload == "[DONE]":
        return None
    try:
        return json.loads(payload)
    except (ValueError, json.JSONDecodeError):
        return {"_raw": payload}


def _maybe_load_json(s: str) -> Any:
    """Some Perplexity events nest a JSON document inside the `text` field."""
    if not isinstance(s, str):
        return s
    t = s.strip()
    if t.startswith("{") or t.startswith("["):
        try:
            return json.loads(t)
        except (ValueError, json.JSONDecodeError):
            return s
    return s


def _extract_answer_text(evt: Optional[Dict[str, Any]]) -> str:
    if not evt:
        return ""
    # Perplexity wraps the full cumulative answer as a JSON-encoded string in `text`.
    raw = evt.get("text")
    if isinstance(raw, str) and raw:
        loaded = _maybe_load_json(raw)
        if isinstance(loaded, (dict, list)):
            ans = _walk_for_answer(loaded)
            if ans:
                return ans
        elif isinstance(loaded, str) and loaded.strip():
            return loaded
    for key in ("answer",):
        v = evt.get(key)
        if isinstance(v, str) and v:
            return v
    chunks = evt.get("chunks")
    if isinstance(chunks, list):
        out = []
        for c in chunks:
            if isinstance(c, dict):
                t = c.get("text") or c.get("answer")
                if t:
                    out.append(t)
        if out:
            return "".join(out)
    blocks = evt.get("blocks")
    if isinstance(blocks, list):
        out = []
        for b in blocks:
            if isinstance(b, dict):
                # markdown_block -> chunks -> text
                mb = b.get("markdown_block") or b
                ch = mb.get("chunks") if isinstance(mb, dict) else None
                if isinstance(ch, list):
                    for c in ch:
                        if isinstance(c, dict):
                            t = c.get("text") or c.get("answer")
                            if t:
                                out.append(t)
        if out:
            return "".join(out)
    return ""


def _walk_for_answer(node: Any) -> str:
    """Best-effort: dig through the schematized payload to find the human answer."""
    if isinstance(node, list):
        # Perplexity FINAL step: list of {step_type, content, ...}.
        for item in node:
            if isinstance(item, dict) and item.get("step_type") == "FINAL":
                inner = item.get("content", {}).get("answer")
                if isinstance(inner, str):
                    loaded = _maybe_load_json(inner)
                    if isinstance(loaded, dict):
                        a = loaded.get("answer")
                        if isinstance(a, str) and a:
                            return a
                    elif isinstance(loaded, str) and loaded:
                        return loaded
        # otherwise concatenate any nested answers
        out_parts: List[str] = []
        for item in node:
            got = _walk_for_answer(item)
            if got:
                out_parts.append(got)
        return "".join(out_parts)
    if isinstance(node, dict):
        # Markdown blocks: {"markdown_block": {"chunks":[{"text":"..."}]}}
        mb = node.get("markdown_block")
        if isinstance(mb, dict):
            got = _walk_for_answer(mb)
            if got:
                return got
        # Most common shapes: {"answer": "..."} or {"chunks":[{"text":"..."}]}
        for key in ("answer", "markdown", "content"):
            v = node.get(key)
            if isinstance(v, str) and v:
                # double-encoded JSON?
                loaded = _maybe_load_json(v)
                if isinstance(loaded, dict):
                    a = loaded.get("answer")
                    if isinstance(a, str) and a:
                        return a
                elif isinstance(loaded, str) and loaded.strip():
                    return loaded
                return v
        chunks = node.get("chunks")
        if isinstance(chunks, list):
            out: List[str] = []
            for c in chunks:
                if isinstance(c, dict):
                    t = c.get("text") or c.get("answer") or c.get("content")
                    if t:
                        out.append(t)
                elif isinstance(c, str):
                    out.append(c)
            if out:
                return "".join(out)
        # recurse into common wrapper keys
        for key in ("answer_modes", "blocks", "data"):
            v = node.get(key)
            if v is not None:
                got = _walk_for_answer(v)
                if got:
                    return got
    return ""


def _extract_sources(evt: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not evt:
        return []
    # Sources may also live inside the nested-JSON text payload.
    raw = evt.get("text")
    if isinstance(raw, str):
        loaded = _maybe_load_json(raw)
        if isinstance(loaded, (dict, list)):
            srcs = _collect_sources(loaded)
            if srcs:
                return srcs
    for key in ("web_results", "search_results", "sources"):
        v = evt.get(key)
        if isinstance(v, list) and v:
            out = []
            for item in v:
                if isinstance(item, dict):
                    out.append({
                        "name": item.get("name") or item.get("title"),
                        "url": item.get("url"),
                        "snippet": item.get("snippet"),
                    })
            if out:
                return out
    return []


def _collect_sources(node: Any) -> List[Dict[str, Any]]:
    if isinstance(node, dict):
        for key in ("web_results", "search_results", "sources"):
            v = node.get(key)
            if isinstance(v, list) and v:
                out = []
                for item in v:
                    if isinstance(item, dict):
                        out.append({
                            "name": item.get("name") or item.get("title"),
                            "url": item.get("url"),
                            "snippet": item.get("snippet"),
                        })
                if out:
                    return out
        for v in node.values():
            if isinstance(v, (dict, list)):
                got = _collect_sources(v)
                if got:
                    return got
    elif isinstance(node, list):
        for item in node:
            got = _collect_sources(item)
            if got:
                return got
    return []
