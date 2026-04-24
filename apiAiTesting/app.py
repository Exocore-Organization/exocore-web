"""Tapos Flask API - wraps the local `meta` (Meta AI) SDK."""

from __future__ import annotations

import json
import os
import tempfile
import threading
import uuid
from typing import Any, Dict, Optional

import requests
from flask import Flask, jsonify, request, Response

from meta import MetaAI
from gemini import GeminiClient, GeminiError, MODELS as GEMINI_MODELS, AccountPool
from chatgpt import ChatGPTClient, ChatGPTError, RateLimitError, AuthError as ChatGPTAuthError, MODELS as CHATGPT_MODELS
from pi import PiClient, PiError, PiAuthError, PiRateLimitError
from deepai import DeepAIClient, DeepAIError
from pixeai import PixeAIClient, PixeAIError
from sourceHez import SourceHezClient, SourceHezError, MODELS as HEZ_MODELS, DEFAULT_MODEL as HEZ_DEFAULT_MODEL


KNOWN_COOKIE_KEYS = (
    # meta.ai
    "datr", "ecto_1_sess", "abra_sess", "dpr", "ps_l", "ps_n",
    "rd_challenge", "wd", "c_user", "xs", "fr", "sb", "presence",
    # gemini.google.com
    "__Secure-1PSID", "__Secure-1PSIDTS", "__Secure-1PSIDCC",
    "__Secure-3PSID", "__Secure-3PSIDTS", "__Secure-3PSIDCC",
    "__Secure-1PAPISID", "__Secure-3PAPISID",
    "SAPISID", "APISID", "SID", "HSID", "SSID", "SIDCC", "NID",
    # chatgpt.com
    "__Secure-next-auth.session-token",
    "oai-did", "oai-sid", "oai-gn",
    "_puid", "cf_clearance",
    # pi.ai
    "__Secure-pi-session", "__Host-session", "__Secure-pi-auth-state", "__cf_bm",
)
REQUIRED_COOKIE = "ecto_1_sess"
REQUIRED_GEMINI_COOKIE = "__Secure-1PSID"
REQUIRED_PI_COOKIE = "__Secure-pi-session"


def _cookies_from_request() -> Dict[str, str]:
    """Resolve cookies from the user's request. Sources merged in priority:

    1. JSON body `cookies` — dict or "k=v;k=v" string
    2. Query string `?cookies=` — JSON or "k=v;k=v"
    3. Individual query params for any known cookie name
    4. `Cookie` request header (if the caller forwards their browser cookies)
    """
    cookies: Dict[str, str] = {}

    # 1. JSON body
    if request.is_json:
        body = request.get_json(silent=True) or {}
        c = body.get("cookies")
        if isinstance(c, dict):
            cookies.update({k: v for k, v in c.items() if v})
        elif isinstance(c, str) and c.strip():
            cookies.update(_parse_cookie_string(c))

    # 2. ?cookies=
    qc = request.args.get("cookies")
    if qc:
        if qc.strip().startswith("{"):
            try:
                cookies.update({k: v for k, v in json.loads(qc).items() if v})
            except Exception:
                pass
        else:
            cookies.update(_parse_cookie_string(qc))

    # 3. individual query params
    for k in KNOWN_COOKIE_KEYS:
        v = request.args.get(k)
        if v:
            cookies[k] = v

    # 4. Cookie header
    header = request.headers.get("Cookie") or request.headers.get("X-Meta-Cookie")
    if header:
        for k, v in _parse_cookie_string(header).items():
            cookies.setdefault(k, v)

    return cookies


def _require_cookies():
    """Return (cookies, error_response). If cookies are missing, error_response
    is a Flask response tuple to return immediately."""
    cookies = _cookies_from_request()
    if not cookies or REQUIRED_COOKIE not in cookies:
        return cookies, (
            jsonify({
                "error": "Cookies required. Send your meta.ai cookies with each request.",
                "required": [REQUIRED_COOKIE],
                "accepted_methods": [
                    'JSON body: {"cookies": {"ecto_1_sess": "...", "datr": "..."}}',
                    'Query: ?cookies={"ecto_1_sess":"..."} or ?cookies=ecto_1_sess=...;datr=...',
                    'Query: ?ecto_1_sess=...&datr=...',
                    'Header: Cookie: ecto_1_sess=...; datr=...',
                ],
                "received": sorted(cookies.keys()),
            }),
            400,
        )
    return cookies, None


def _require_gemini_cookies():
    cookies = _cookies_from_request()
    if not cookies or REQUIRED_GEMINI_COOKIE not in cookies:
        return cookies, (
            jsonify({
                "error": "Gemini cookies required. Send your gemini.google.com cookies with each request.",
                "required": [REQUIRED_GEMINI_COOKIE],
                "recommended": [
                    "__Secure-1PSID", "__Secure-1PSIDTS",
                    "__Secure-3PSID", "__Secure-3PSIDTS",
                    "SAPISID", "SID", "HSID", "SSID", "NID",
                ],
                "received": sorted(cookies.keys()),
            }),
            400,
        )
    return cookies, None


def _parse_cookie_string(s: str) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for part in s.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            k, v = k.strip(), v.strip()
            if k:
                out[k] = v
    return out


_client_cache: "Dict[str, MetaAI]" = {}
_client_cache_lock = threading.Lock()
_CLIENT_CACHE_MAX = 32


def _client(cookies: Dict[str, str]) -> MetaAI:
    """Return a MetaAI client, reusing a cached instance for the same session.

    The MetaAI constructor + first request trigger an `extract_access_token_from_page`
    call that solves the meta.ai `rd_challenge` (~1-2s overhead). Caching the
    instance per session cookie skips that on subsequent requests, cutting
    chat latency roughly in half on warm calls.
    """
    key = cookies.get(REQUIRED_COOKIE) or ""
    if not key:
        return MetaAI(cookies=cookies)
    with _client_cache_lock:
        client = _client_cache.get(key)
        if client is None:
            client = MetaAI(cookies=cookies)
            if len(_client_cache) >= _CLIENT_CACHE_MAX:
                _client_cache.pop(next(iter(_client_cache)))
            _client_cache[key] = client
        else:
            # refresh cookie jar in case caller rotated other cookies
            try: client.cookies = cookies
            except Exception: pass
    return client


_gemini_cache: "Dict[str, GeminiClient]" = {}
_gemini_cache_lock = threading.Lock()

# Server-wide multi-account pool. Empty until /gemini/accounts/register is
# called. When the caller's /gemini POST omits cookies, we route through
# the pool so requests round-robin and auto-failover on rate-limits.
_gemini_pool = AccountPool(default_cooldown=600.0)

# -------- ChatGPT client cache --------
_chatgpt_cache: "Dict[str, ChatGPTClient]" = {}
_chatgpt_cache_lock = threading.Lock()


def _chatgpt_auth() -> tuple:
    """
    Extract ChatGPT auth from the current request.
    Returns (access_token, cookies, device_id, error_response).

    Priority:
      1. JSON body ``access_token``
      2. Authorization: Bearer <token> header
      3. X-Chatgpt-Token header
      4. ?access_token= query param  (useful for GET routes)
      5. JSON body ``cookies`` (dict or cookie-string) — used to fetch token lazily
    """
    body = _body()

    auth_hdr = request.headers.get("Authorization", "")
    if auth_hdr.lower().startswith("bearer "):
        auth_hdr = auth_hdr[7:].strip()
    else:
        auth_hdr = ""

    token = (
        body.get("access_token")
        or auth_hdr
        or request.headers.get("X-Chatgpt-Token")
        or request.args.get("access_token")
        or None
    )
    cookies_raw = body.get("cookies")
    device_id = body.get("device_id") or request.args.get("device_id")

    if not token and not cookies_raw:
        return None, None, None, (
            jsonify({"error": "Provide access_token (Bearer JWT) or cookies for chatgpt.com."}), 400
        )

    cookies: Dict[str, str] = {}
    if isinstance(cookies_raw, str):
        cookies = _parse_cookie_string(cookies_raw)
    elif isinstance(cookies_raw, dict):
        cookies = cookies_raw

    return token, cookies, device_id, None


def _chatgpt_client(token: Optional[str], cookies: Dict[str, str], device_id: Optional[str] = None) -> ChatGPTClient:
    """Return a cached ChatGPTClient keyed by access_token or primary cookie."""
    cache_key = token or cookies.get("__Secure-next-auth.session-token") or cookies.get("oai-sid") or ""
    if not cache_key:
        return ChatGPTClient(cookies=cookies, access_token=token, device_id=device_id)
    with _chatgpt_cache_lock:
        client = _chatgpt_cache.get(cache_key)
        if client is None:
            client = ChatGPTClient(cookies=cookies, access_token=token, device_id=device_id)
            if len(_chatgpt_cache) >= _CLIENT_CACHE_MAX:
                _chatgpt_cache.pop(next(iter(_chatgpt_cache)))
            _chatgpt_cache[cache_key] = client
        else:
            if token:
                client._access_token = token
            if cookies:
                client.cookies.update(cookies)
    return client


# -------- Pi.ai client cache --------
_pi_cache: "Dict[str, PiClient]" = {}
_pi_cache_lock = threading.Lock()


def _require_pi_cookies() -> tuple:
    """Extract pi.ai cookies from the request. Returns (cookies, error_response)."""
    body = _body()
    cookies_raw = body.get("cookies")

    if cookies_raw is None:
        cookies_raw = request.args.get("cookies")

    cookies: Dict[str, str] = {}
    if isinstance(cookies_raw, str):
        cookies = _parse_cookie_string(cookies_raw)
    elif isinstance(cookies_raw, dict):
        cookies = cookies_raw

    if not cookies:
        return None, (jsonify({"error": f"Provide pi.ai cookies (need at least {REQUIRED_PI_COOKIE})."}), 400)
    if REQUIRED_PI_COOKIE not in cookies and "__Host-session" not in cookies:
        return None, (jsonify({"error": f"Missing required cookie: {REQUIRED_PI_COOKIE} (or __Host-session)."}), 400)
    return cookies, None


def _pi_client(cookies: Dict[str, str]) -> PiClient:
    """Cached PiClient per __Secure-pi-session."""
    key = cookies.get(REQUIRED_PI_COOKIE) or cookies.get("__Host-session") or ""
    if not key:
        return PiClient(cookies=cookies)
    with _pi_cache_lock:
        client = _pi_cache.get(key)
        if client is None:
            client = PiClient(cookies=cookies)
            if len(_pi_cache) >= _CLIENT_CACHE_MAX:
                _pi_cache.pop(next(iter(_pi_cache)))
            _pi_cache[key] = client
        else:
            # Refresh cookies (e.g. __cf_bm rotates every 30 min)
            client.cookies.update(cookies)
            for k, v in cookies.items():
                client.session.cookies.set(k, v, domain="pi.ai")
                client.session.cookies.set(k, v, domain=".pi.ai")
    return client


def _gemini_client(cookies: Dict[str, str]) -> GeminiClient:
    """Cached GeminiClient per __Secure-1PSID. Skips re-fetching SNlM0e on warm calls."""
    key = cookies.get(REQUIRED_GEMINI_COOKIE) or ""
    if not key:
        return GeminiClient(cookies=cookies)
    with _gemini_cache_lock:
        client = _gemini_cache.get(key)
        if client is None:
            client = GeminiClient(cookies=cookies)
            if len(_gemini_cache) >= _CLIENT_CACHE_MAX:
                _gemini_cache.pop(next(iter(_gemini_cache)))
            _gemini_cache[key] = client
        else:
            # refresh cookies in case caller rotated other values
            try:
                client.cookies.update(cookies)
                for k, v in cookies.items():
                    client.session.cookies.set(k, v, domain=".google.com")
            except Exception:
                pass
    return client


def _body() -> Dict[str, Any]:
    return request.get_json(force=True, silent=True) or {}


app = Flask(__name__)

_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()


# -------- meta --------
@app.get("/healthz")
def healthz():
    return jsonify({"status": "ok"})


@app.get("/")
def root():
    return jsonify({
        "name": "Tapos - Multi-AI Flask API",
        "endpoints": {
            "meta": [
                "POST /meta/chat", "POST /meta/upload", "POST /meta/image",
                "POST /meta/video", "POST /meta/video/extend", "POST /meta/video/async",
                "GET  /meta/video/jobs/<job_id>",
                "POST /meta/delete", "POST /meta/delete/all", "GET  /meta/conversations",
                "POST /meta/rename", "POST /meta/pin", "POST /meta/unpin",
                "POST /meta/warmup", "POST /meta/stop", "POST /meta/mode",
                "POST /meta/think", "POST /meta/instant",
                "GET  /meta/starters", "POST /meta/cookies/check",
            ],
            "gemini": [
                "POST /gemini  (modes: fast|thinking|pro)",
                "POST /gemini/delete", "POST /gemini/delete/all",
                "GET  /gemini/conversations",
                "POST /gemini/accounts/register", "GET /gemini/accounts",
                "DELETE /gemini/accounts/<label>", "POST /gemini/accounts/clear",
            ],
            "chatgpt": [
                "POST /chatgpt", "POST /chatgpt/create",
                "POST /chatgpt/pin", "POST /chatgpt/unpin",
                "POST /chatgpt/delete", "POST /chatgpt/delete/all",
                "GET  /chatgpt/conversations", "GET /chatgpt/models",
            ],
            "pi": [
                "POST /pi", "POST /pi/create",
                "POST /pi/pin", "POST /pi/unpin",
                "POST /pi/delete", "POST /pi/delete/all",
                "GET  /pi/conversations", "GET /pi/history",
                "GET  /pi/greeting", "GET /pi/discover",
            ],
            "deep": [
                "POST /deep  (free, no cookies)", "POST /deep/create",
                "GET  /deep/conversations", "GET /deep/history",
                "POST /deep/delete", "POST /deep/delete/all",
                "GET  /deep/models",
            ],
            "pixe": [
                "POST /pixe  (Perplexity AI; cookies optional)",
                "POST /pixe/create",
                "GET  /pixe/conversations", "GET /pixe/history",
                "POST /pixe/delete", "POST /pixe/delete/all",
                "GET  /pixe/modes", "GET /pixe/models",
            ],
            "hez": [
                "POST /hez  (chat.z.ai GLM-5-Turbo; needs token)",
                "POST /hez/create",
                "GET  /hez/conversations", "GET /hez/history",
                "POST /hez/delete", "POST /hez/delete/all",
                "GET  /hez/models", "GET /hez/upstream",
            ],
            "system": ["GET /healthz", "GET /"],
        },
        "gemini_models": list(GEMINI_MODELS.keys()),
    })


# -------- gemini --------
@app.post("/gemini")
def gemini_chat():
    """Chat with gemini.google.com.

    Body:
      message:         required
      mode:            "fast" (default) | "thinking" | "pro"
      conversation_id: optional, to continue a thread
      response_id, choice_id: optional (advanced — branch from a specific turn)
      cookies:         dict or "k=v;k=v" string. __Secure-1PSID required.
      account:         optional pool label to prefer (when using account pool)

    If `cookies` is omitted, the request routes through the registered
    account pool (round-robin with auto-failover on rate-limits).

    Response keeps only the conversation_id you need to continue. Caller is
    responsible for storing it.
    """
    body = _body()
    message = body.get("message")
    if not message:
        return jsonify({"error": "message is required"}), 400

    cookies = _cookies_from_request()
    use_pool = (
        REQUIRED_GEMINI_COOKIE not in cookies
        and len(_gemini_pool.labels()) > 0
    )

    if not use_pool:
        # Per-request cookies — original behaviour.
        cookies, err = _require_gemini_cookies()
        if err:
            return err

    mode = body.get("mode") or body.get("model") or "fast"
    cid  = body.get("conversation_id") or body.get("id")

    try:
        if use_pool:
            result = _gemini_pool.chat(
                message, model=mode, conversation_id=cid,
                response_id=body.get("response_id"),
                choice_id=body.get("choice_id"),
                prefer_label=body.get("account"),
            )
        else:
            client = _gemini_client(cookies)
            result = client.chat(
                message, model=mode, conversation_id=cid,
                response_id=body.get("response_id"),
                choice_id=body.get("choice_id"),
            )
    except GeminiError as e:
        return jsonify({"error": str(e)}), 502
    except Exception as e:
        return jsonify({"error": f"unexpected: {e}"}), 500

    return jsonify({
        "text": result.get("text", ""),
        "conversation_id": result.get("conversation_id"),
        "model": result.get("model"),
        "account": result.get("account"),
    })


# -------- gemini account pool --------
@app.post("/gemini/accounts/register")
def gemini_accounts_register():
    """Register one or more Gemini accounts into the server-side pool.

    Body shape (any of these works):
      { "accounts": [
          { "label": "main", "cookies": {...} },
          { "label": "backup", "cookies": {...}, "proxy": "http://..." }
      ]}
      OR a single account: { "label": "main", "cookies": {...} }

    Existing labels are replaced (use this to refresh expired cookies).
    """
    body = _body()
    items = body.get("accounts")
    if items is None and body.get("cookies"):
        items = [{"label": body.get("label"),
                  "cookies": body["cookies"],
                  "proxy": body.get("proxy")}]
    if not items or not isinstance(items, list):
        return jsonify({"error": "Send {\"accounts\": [{label, cookies, proxy?}, ...]}"}), 400

    added, errors = [], []
    for it in items:
        try:
            cookies = it.get("cookies")
            if isinstance(cookies, str):
                cookies = _parse_cookie_string(cookies)
            if not cookies or REQUIRED_GEMINI_COOKIE not in cookies:
                errors.append({"label": it.get("label"),
                               "error": f"missing {REQUIRED_GEMINI_COOKIE}"})
                continue
            proxy = it.get("proxy")
            if isinstance(proxy, str):
                proxy = {"https": proxy, "http": proxy}
            label = _gemini_pool.add(cookies=cookies, label=it.get("label"), proxy=proxy)
            added.append(label)
        except Exception as e:
            errors.append({"label": it.get("label"), "error": str(e)})

    return jsonify({
        "added": added,
        "errors": errors,
        "pool_size": len(_gemini_pool.labels()),
    })


@app.get("/gemini/accounts")
def gemini_accounts_list():
    """List pool accounts with throttle status (no secrets exposed)."""
    return jsonify({
        "count": len(_gemini_pool.labels()),
        "accounts": _gemini_pool.status(),
    })


@app.delete("/gemini/accounts/<label>")
def gemini_accounts_remove(label: str):
    ok = _gemini_pool.remove(label)
    return jsonify({"removed": ok, "label": label,
                    "pool_size": len(_gemini_pool.labels())}), (200 if ok else 404)


@app.post("/gemini/accounts/clear")
def gemini_accounts_clear():
    body = _body()
    if not body.get("confirm"):
        return jsonify({"error": "Pass {\"confirm\": true} to wipe the pool."}), 400
    n = _gemini_pool.clear()
    return jsonify({"cleared": n})


@app.post("/gemini/delete")
def gemini_delete():
    """Delete one Gemini conversation thread by id.

    Body: { "conversation_id": "c_xxx", "cookies": {...} }
    """
    cookies, err = _require_gemini_cookies()
    if err:
        return err
    body = _body()
    cid = body.get("conversation_id") or body.get("id")
    if not cid:
        return jsonify({"error": "conversation_id is required"}), 400
    try:
        ok = _gemini_client(cookies).delete_conversation(cid)
        return jsonify({"success": ok, "conversation_id": cid}), (200 if ok else 502)
    except GeminiError as e:
        return jsonify({"success": False, "error": str(e)}), 502


@app.post("/gemini/delete/all")
def gemini_delete_all():
    """Delete every Gemini conversation tracked by this server's client cache.

    Only touches conversations created/continued through this server (per
    __Secure-1PSID). Browser-only chats stay untouched. Pass
    {"confirm": true}.
    """
    cookies, err = _require_gemini_cookies()
    if err:
        return err
    body = _body()
    if not body.get("confirm"):
        return jsonify({
            "error": "Destructive. Pass {\"confirm\": true} to delete all tracked Gemini conversations.",
        }), 400
    try:
        result = _gemini_client(cookies).delete_all_conversations()
        return jsonify({"success": True, **result})
    except GeminiError as e:
        return jsonify({"success": False, "error": str(e)}), 502


@app.get("/gemini/conversations")
def gemini_conversations():
    """List the conversation ids this server is currently tracking for the
    caller's __Secure-1PSID. Useful before /gemini/delete/all."""
    cookies, err = _require_gemini_cookies()
    if err:
        return err
    ids = _gemini_client(cookies).known_conversations()
    return jsonify({"conversations": ids, "count": len(ids)})


# -------- chat --------
_MODE_ALIASES = {
    "think": "think_hard", "thinking": "think_hard", "hard": "think_hard",
    "reason": "think_hard", "reasoning": "think_hard", "think_hard": "think_hard",
    "fast": "think_fast", "instant": "think_fast", "quick": "think_fast",
    "think_fast": "think_fast",
}


def _normalize_mode(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return _MODE_ALIASES.get(str(value).strip().lower(), value)


@app.post("/meta/chat")
def chat():
    cookies, err = _require_cookies()
    if err: return err
    body = _body()
    message = body.get("message")
    if not message:
        return jsonify({"error": "message is required"}), 400
    client = _client(cookies)
    try:
        # Optional: switch mode (think_hard / think_fast) before sending the prompt.
        # Accepts shortcuts: "thinking", "instant", "fast", "hard", etc.
        mode = _normalize_mode(body.get("mode"))
        mode_result: Optional[Dict[str, Any]] = None
        if mode:
            cid = body.get("conversation_id") or body.get("id") or getattr(client, "conversation_id", None)
            if cid:
                mode_result = client.update_conversation_mode(cid, mode)

        result = client.prompt(
            message,
            new_conversation=bool(body.get("new_conversation", False)),
        )
        if mode_result is not None and isinstance(result, dict):
            result["mode_applied"] = {"mode": mode, "result": mode_result}
        return jsonify(result)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


def _set_mode(mode: str):
    cookies, err = _require_cookies()
    if err: return err
    body = _body()
    cid = body.get("id") or body.get("conversation_id")
    if not cid:
        return jsonify({"error": "id (conversation_id) is required"}), 400
    try:
        result = _client(cookies).update_conversation_mode(cid, mode)
        return jsonify(result), (200 if result.get("success") else 400)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.post("/meta/think")
def mode_think():
    """Switch a conversation to extended thinking mode (think_hard)."""
    return _set_mode("think_hard")


@app.post("/meta/instant")
def mode_instant():
    """Switch a conversation back to fast/instant mode (think_fast)."""
    return _set_mode("think_fast")


# -------- upload --------
@app.post("/meta/upload")
def upload():
    cookies, err = _require_cookies()
    if err: return err
    cleanup = False
    file_path: Optional[str] = None
    if "file" in request.files:
        f = request.files["file"]
        suffix = os.path.splitext(f.filename or "")[1] or ".jpg"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            f.save(tmp.name)
            file_path = tmp.name
        cleanup = True
    else:
        body = _body()
        file_path = body.get("file_path")
        if not file_path:
            return jsonify({"error": "Provide multipart 'file' or json 'file_path'"}), 400
    try:
        result = _client(cookies).upload_image(file_path)
        return jsonify(result)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500
    finally:
        if cleanup and file_path:
            try:
                os.unlink(file_path)
            except OSError:
                pass


# -------- image --------
@app.post("/meta/image")
def image():
    cookies, err = _require_cookies()
    if err: return err
    body = _body()
    prompt = body.get("prompt")
    if not prompt:
        return jsonify({"error": "prompt is required"}), 400
    try:
        result = _client(cookies).generate_image_new(
            prompt=prompt,
            orientation=body.get("orientation", "LANDSCAPE"),
        )
        return jsonify(result)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# -------- video --------
def _video_kwargs(body: Dict[str, Any]) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {"auto_poll": bool(body.get("auto_poll", True))}
    if body.get("media_ids"):
        kwargs["media_ids"] = body["media_ids"]
    if body.get("attachment_metadata"):
        kwargs["attachment_metadata"] = body["attachment_metadata"]
    return kwargs


@app.post("/meta/video")
def video():
    cookies, err = _require_cookies()
    if err: return err
    body = _body()
    prompt = body.get("prompt")
    if not prompt:
        return jsonify({"error": "prompt is required"}), 400
    try:
        result = _client(cookies).generate_video_new(prompt, **_video_kwargs(body))
        return jsonify(result)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.post("/meta/video/extend")
def video_extend():
    cookies, err = _require_cookies()
    if err: return err
    body = _body()
    media_id = body.get("media_id")
    if not media_id:
        return jsonify({"error": "media_id is required"}), 400
    try:
        return jsonify(_client(cookies).extend_video(media_id))
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


def _run_video_job(job_id: str, prompt: str, kwargs: Dict[str, Any], cookies: Dict[str, str]) -> None:
    try:
        result = _client(cookies).generate_video_new(prompt, **kwargs)
        with _jobs_lock:
            _jobs[job_id] = {"status": "completed", "result": result}
    except Exception as exc:
        with _jobs_lock:
            _jobs[job_id] = {"status": "failed", "error": str(exc)}


@app.post("/meta/video/async")
def video_async():
    cookies, err = _require_cookies()
    if err: return err
    body = _body()
    prompt = body.get("prompt")
    if not prompt:
        return jsonify({"error": "prompt is required"}), 400
    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _jobs[job_id] = {"status": "running"}
    threading.Thread(
        target=_run_video_job,
        args=(job_id, prompt, _video_kwargs(body), cookies),
        daemon=True,
    ).start()
    return jsonify({"job_id": job_id, "status": "running"})


@app.get("/meta/video/jobs/<job_id>")
def video_job(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        return jsonify({"error": "job not found"}), 404
    return jsonify({"job_id": job_id, **job})


# -------- delete --------
@app.post("/meta/delete")
def delete():
    cookies, err = _require_cookies()
    if err: return err
    body = _body()
    conversation_id = body.get("id") or body.get("conversation_id")
    if not conversation_id:
        return jsonify({"error": "id is required"}), 400
    try:
        result = _client(cookies).delete_conversation(conversation_id)
        return jsonify(result), (200 if result.get("success") else 400)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# -------- list conversations --------
@app.get("/meta/conversations")
@app.post("/meta/conversations")
def conversations():
    cookies, err = _require_cookies()
    if err: return err
    body = _body() if request.is_json else {}
    page_size = int(body.get("page_size") or request.args.get("page_size") or 50)
    max_pages = int(body.get("max_pages") or request.args.get("max_pages") or 50)
    try:
        result = _client(cookies).list_conversations(page_size=page_size, max_pages=max_pages)
        return jsonify(result), (200 if result.get("success") else 400)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# -------- delete all conversations --------
@app.post("/meta/delete/all")
def delete_all():
    cookies, err = _require_cookies()
    if err: return err
    body = _body()
    if not body.get("confirm"):
        return jsonify({
            "error": "Destructive action. Pass {\"confirm\": true} in the body to delete ALL conversations.",
        }), 400
    try:
        result = _client(cookies).delete_all_conversations()
        return jsonify(result), (200 if result.get("success") else 207)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# -------- rename conversation --------
@app.post("/meta/rename")
def rename_conversation():
    cookies, err = _require_cookies()
    if err: return err
    body = _body()
    cid = body.get("id") or body.get("conversation_id")
    title = body.get("title")
    if not cid or not title:
        return jsonify({"error": "id and title are required"}), 400
    try:
        result = _client(cookies).rename_conversation(cid, title)
        return jsonify(result), (200 if result.get("success") else 400)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# -------- pin / unpin --------
@app.post("/meta/pin")
def pin_conversation():
    cookies, err = _require_cookies()
    if err: return err
    body = _body()
    cid = body.get("id") or body.get("conversation_id")
    if not cid:
        return jsonify({"error": "id is required"}), 400
    try:
        result = _client(cookies).pin_conversation(cid, pinned=True)
        return jsonify(result), (200 if result.get("success") else 400)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.post("/meta/unpin")
def unpin_conversation():
    cookies, err = _require_cookies()
    if err: return err
    body = _body()
    cid = body.get("id") or body.get("conversation_id")
    if not cid:
        return jsonify({"error": "id is required"}), 400
    try:
        result = _client(cookies).pin_conversation(cid, pinned=False)
        return jsonify(result), (200 if result.get("success") else 400)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# -------- warmup (faster first reply) --------
@app.post("/meta/warmup")
def warmup():
    cookies, err = _require_cookies()
    if err: return err
    body = _body()
    cid = body.get("id") or body.get("conversation_id")
    if not cid:
        return jsonify({"error": "id is required"}), 400
    try:
        result = _client(cookies).warmup_conversation(cid)
        return jsonify(result), (200 if result.get("success") else 400)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# -------- stop generation --------
@app.post("/meta/stop")
def stop_message():
    cookies, err = _require_cookies()
    if err: return err
    body = _body()
    cid = body.get("id") or body.get("conversation_id")
    msg_id = body.get("message_id")
    if not cid:
        return jsonify({"error": "id (conversation_id) is required"}), 400
    try:
        result = _client(cookies).stop_message(cid, msg_id)
        return jsonify(result), (200 if result.get("success") else 400)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# -------- update mode (chat / imagine / etc) --------
@app.post("/meta/mode")
def update_mode():
    cookies, err = _require_cookies()
    if err: return err
    body = _body()
    cid = body.get("id") or body.get("conversation_id")
    mode = body.get("mode")
    if not cid or not mode:
        return jsonify({"error": "id and mode are required"}), 400
    try:
        result = _client(cookies).update_conversation_mode(cid, mode)
        return jsonify(result), (200 if result.get("success") else 400)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# -------- conversation starters --------
@app.get("/meta/starters")
@app.post("/meta/starters")
def starters():
    cookies, err = _require_cookies()
    if err: return err
    try:
        result = _client(cookies).get_conversation_starters()
        return jsonify(result), (200 if result.get("success") else 400)
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# -------- cookie diagnostics --------
def _probe_cookies(cookies: Dict[str, str]) -> Dict[str, Any]:
    """Hit a lightweight authenticated endpoint and report status.

    Uses the deleteConversation GraphQL doc with a bogus UUID. If cookies are
    valid the server returns HTTP 200 with a structured GraphQL response
    (success=false but no auth error). If cookies are invalid the server
    typically returns 401/403 or an HTML login page.
    """
    url = "https://www.meta.ai/api/graphql"
    headers = {
        "accept": "multipart/mixed, application/json",
        "content-type": "application/json",
        "origin": "https://www.meta.ai",
        "referer": "https://www.meta.ai/",
    }
    payload = {
        "doc_id": "ad35bda8475e29ba4264ef0d6cc0958a",
        "variables": {"input": {"id": "00000000-0000-0000-0000-000000000000"}},
    }
    try:
        resp = requests.post(url, headers=headers, cookies=cookies,
                             data=json.dumps(payload), timeout=20)
    except requests.RequestException as exc:
        return {"ok": False, "error": str(exc)}

    body_text = resp.text or ""
    parsed: Any = None
    try:
        parsed = resp.json()
    except ValueError:
        marker = body_text.find("{")
        if marker != -1:
            try:
                parsed = json.loads(body_text[marker:])
            except Exception:
                parsed = None

    delete_node: Dict[str, Any] = {}
    if isinstance(parsed, dict):
        delete_node = parsed.get("data", {}).get("deleteConversation", {}) or {}
    typename = delete_node.get("__typename")
    message = (delete_node.get("message") or "").lower()

    # Distinguish authenticated vs unauthenticated:
    #   unauth -> "You must be logged in to delete conversations"
    #   auth   -> "Conversation not found or you don't have permission..."
    not_logged_in = "logged in" in message or "log in" in message
    authenticated = bool(typename) and not not_logged_in

    return {
        "ok": authenticated,
        "status_code": resp.status_code,
        "graphql_typename": typename,
        "graphql_message": delete_node.get("message"),
        "snippet": body_text[:200] if not parsed else None,
    }


@app.post("/meta/cookies/check")
def cookies_check():
    """Diagnose which cookie(s) are needed/working.

    Tests:
      1. The full provided cookie set (baseline).
      2. Each cookie alone (which one is the auth/session token?).
      3. The full set minus one at a time (which one is required?).
    """
    cookies, err = _require_cookies()
    if err:
        return err

    results: Dict[str, Any] = {
        "cookies_received": sorted(cookies.keys()),
        "full_set": _probe_cookies(cookies),
        "each_alone": {},
        "leave_one_out": {},
    }

    for name, value in cookies.items():
        results["each_alone"][name] = _probe_cookies({name: value})

    if len(cookies) > 1:
        for name in cookies:
            subset = {k: v for k, v in cookies.items() if k != name}
            results["leave_one_out"][f"without_{name}"] = _probe_cookies(subset)

    # Summarize which cookies appear to be the auth token
    auth_carriers = [n for n, r in results["each_alone"].items() if r.get("ok")]
    required = [n.replace("without_", "")
                for n, r in results["leave_one_out"].items() if not r.get("ok")]
    results["summary"] = {
        "authenticated_with_full_set": results["full_set"].get("ok"),
        "cookies_that_authenticate_alone": auth_carriers,
        "cookies_that_appear_required": required,
    }
    return jsonify(results)


# ======================================================================
# ChatGPT routes
# ======================================================================
#
# Auth: every request must include EITHER:
#   - JSON body { "access_token": "<Bearer JWT from chatgpt.com>" }
#   - HTTP header  Authorization: Bearer <JWT>
#   - HTTP header  X-Chatgpt-Token: <JWT>
#   - JSON body { "cookies": "<cookie-string or dict of chatgpt.com cookies>" }
#     (the server will call /api/auth/session to obtain the Bearer token lazily)
#
# Pinned conversation:
#   - The server keeps one "pinned" conversation per access_token/session.
#   - By default, /chatgpt sends to the pinned conversation.  Pass
#     { "use_pinned": false } to start a fresh one.
#   - On 429 / rate-limit the server automatically creates a new conversation
#     and pins it, so the caller's next request continues seamlessly.
#
# Models:
#   "auto" (default / free)  →  "auto"   (ChatGPT picks gpt-4o or gpt-4o-mini)
#   "fast" / "instant"       →  "auto"
#   "thinking" / "o1"        →  "o1"     (requires Plus; falls back to "auto" on free)
#   "o3-mini"                →  "o3-mini"
#   "gpt-4o"                 →  "gpt-4o"
# ======================================================================


@app.post("/chatgpt")
def chatgpt_chat():
    """Send a message to ChatGPT.

    Body:
      {
        "message": "Hello!",
        "access_token": "<JWT>",           # or use cookies / Authorization header
        "cookies": {...},                   # alternative auth
        "model": "auto",                   # auto | fast | thinking | o1 | o3-mini | gpt-4o
        "conversation_id": "...",          # optional — override which conversation to use
        "use_pinned": true,                # default true; false = always new conversation
      }

    Response:
      {
        "text": "Hi! ...",
        "conversation_id": "...",
        "parent_message_id": "...",
        "model": "auto",
        "pinned_conversation_id": "..."    # currently pinned id for this session
      }
    """
    token, cookies, device_id, err = _chatgpt_auth()
    if err:
        return err
    body = _body()

    message = body.get("message") or body.get("prompt") or body.get("text")
    if not message:
        return jsonify({"error": "message is required"}), 400

    model = str(body.get("model") or body.get("mode") or "auto").strip()
    conversation_id = body.get("conversation_id") or body.get("id")
    use_pinned = bool(body.get("use_pinned", True))

    client = _chatgpt_client(token, cookies, device_id)
    try:
        result = client.chat(
            message,
            conversation_id=conversation_id,
            model=model,
            use_pinned=use_pinned,
        )
    except ChatGPTAuthError as e:
        return jsonify({"error": f"auth_error: {e}", "status_code": e.status_code}), 401
    except ChatGPTError as e:
        return jsonify({"error": str(e), "status_code": e.status_code}), 502
    except Exception as e:
        return jsonify({"error": f"unexpected: {e}"}), 500

    return jsonify(result)


@app.post("/chatgpt/pin")
def chatgpt_pin():
    """Pin a conversation so future /chatgpt requests use it automatically.

    Body: { "conversation_id": "...", "access_token": "..." }
    """
    token, cookies, device_id, err = _chatgpt_auth()
    if err:
        return err
    body = _body()
    cid = body.get("conversation_id") or body.get("id")
    if not cid:
        return jsonify({"error": "conversation_id is required"}), 400

    client = _chatgpt_client(token, cookies, device_id)
    try:
        ok = client.pin_conversation(cid, server_pin=bool(body.get("server_pin", True)))
        return jsonify({"pinned": ok, "conversation_id": cid,
                        "pinned_conversation_id": client.get_pinned_id()})
    except ChatGPTError as e:
        return jsonify({"error": str(e)}), 502


@app.post("/chatgpt/unpin")
def chatgpt_unpin():
    """Unpin the current conversation (local + optionally server-side).

    Body: { "conversation_id": "...", "access_token": "..." }
    """
    token, cookies, device_id, err = _chatgpt_auth()
    if err:
        return err
    body = _body()
    cid = body.get("conversation_id") or body.get("id")
    if not cid:
        return jsonify({"error": "conversation_id is required"}), 400

    client = _chatgpt_client(token, cookies, device_id)
    try:
        ok = client.unpin_conversation(cid)
        return jsonify({"unpinned": ok, "conversation_id": cid,
                        "pinned_conversation_id": client.get_pinned_id()})
    except ChatGPTError as e:
        return jsonify({"error": str(e)}), 502


@app.post("/chatgpt/delete")
def chatgpt_delete():
    """Soft-delete (hide) one conversation.

    Body: { "conversation_id": "...", "access_token": "..." }
    """
    token, cookies, device_id, err = _chatgpt_auth()
    if err:
        return err
    body = _body()
    cid = body.get("conversation_id") or body.get("id")
    if not cid:
        return jsonify({"error": "conversation_id is required"}), 400

    client = _chatgpt_client(token, cookies, device_id)
    try:
        ok = client.delete_conversation(cid)
        return jsonify({"success": ok, "conversation_id": cid,
                        "pinned_conversation_id": client.get_pinned_id()}), (200 if ok else 502)
    except ChatGPTError as e:
        return jsonify({"success": False, "error": str(e)}), 502


@app.post("/chatgpt/delete/all")
def chatgpt_delete_all():
    """Delete every conversation this server has tracked for this session.

    Body: { "access_token": "...", "confirm": true }
    """
    token, cookies, device_id, err = _chatgpt_auth()
    if err:
        return err
    body = _body()
    if not body.get("confirm"):
        return jsonify({
            "error": 'Destructive. Pass {"confirm": true} to delete all tracked ChatGPT conversations.',
        }), 400

    client = _chatgpt_client(token, cookies, device_id)
    try:
        result = client.delete_all_tracked()
        return jsonify({"success": True, **result,
                        "pinned_conversation_id": client.get_pinned_id()})
    except ChatGPTError as e:
        return jsonify({"success": False, "error": str(e)}), 502


@app.get("/chatgpt/conversations")
def chatgpt_conversations():
    """List tracked conversation ids for this session (server-known only).

    Query params or JSON body: access_token, cookies
    """
    token, cookies, device_id, err = _chatgpt_auth()
    if err:
        return err

    client = _chatgpt_client(token, cookies, device_id)
    ids = client.tracked_conversation_ids()
    return jsonify({
        "conversations": ids,
        "count": len(ids),
        "pinned_conversation_id": client.get_pinned_id(),
    })


@app.post("/chatgpt/create")
def chatgpt_create():
    """Start a brand-new conversation and pin it.

    Body:
      {
        "message": "Hello, start fresh!",
        "access_token": "...",
        "model": "auto",
        "pin": true     # default true — auto-pin the new conversation
      }
    """
    token, cookies, device_id, err = _chatgpt_auth()
    if err:
        return err
    body = _body()
    message = body.get("message") or body.get("prompt") or body.get("text")
    if not message:
        return jsonify({"error": "message is required"}), 400

    model = str(body.get("model") or body.get("mode") or "auto").strip()
    pin = bool(body.get("pin", True))

    client = _chatgpt_client(token, cookies, device_id)
    try:
        result = client.create_conversation(message, model=model)
        if pin and result.get("conversation_id"):
            client.pin_conversation(result["conversation_id"], server_pin=False)
        result["pinned_conversation_id"] = client.get_pinned_id()
        return jsonify(result)
    except ChatGPTAuthError as e:
        return jsonify({"error": f"auth_error: {e}", "status_code": e.status_code}), 401
    except ChatGPTError as e:
        return jsonify({"error": str(e), "status_code": e.status_code}), 502
    except Exception as e:
        return jsonify({"error": f"unexpected: {e}"}), 500


@app.get("/chatgpt/models")
def chatgpt_models():
    """List supported ChatGPT model aliases."""
    return jsonify({"models": CHATGPT_MODELS})


# ======================================================================
# Pi.ai routes
# ======================================================================
#
# Auth: cookies from pi.ai browser session.
#   Required:  __Secure-pi-session  (or __Host-session — same value)
#   Helpful:   __Secure-pi-auth-state, __cf_bm (Cloudflare, rotates ~30 min)
#
# Pass cookies as:
#   JSON body { "cookies": {"__Secure-pi-session": "...", ...} }
#   JSON body { "cookies": "cookie-string-from-browser" }
#
# Conversation continuity:
#   Pi.ai is fully stateful server-side — just keep passing the same
#   conversation_id. The server caches a PiClient per session so the
#   analytics IDs (eqDistinctId, eqSessionId) are stable across requests.
#
#   Pinned conversation:
#     /pi automatically uses the pinned conversation if use_pinned=true (default).
#     Pinning survives as long as the server process is alive.
# ======================================================================


@app.post("/pi")
def pi_chat():
    """Send a message to Pi.ai.

    Body:
      {
        "message": "Hello!",
        "cookies": {...},              # pi.ai session cookies (required)
        "conversation_id": "...",     # optional — override which conversation to use
        "use_pinned": true            # default true; false = always new conversation
      }

    Response:
      {
        "text": "Hi! ...",
        "conversation_id": "...",
        "sid": "...",
        "pinned_conversation_id": "..."
      }
    """
    cookies, err = _require_pi_cookies()
    if err:
        return err
    body = _body()

    message = body.get("message") or body.get("prompt") or body.get("text")
    if not message:
        return jsonify({"error": "message is required"}), 400

    conversation_id = body.get("conversation_id") or body.get("id")
    use_pinned = bool(body.get("use_pinned", True))

    client = _pi_client(cookies)
    try:
        result = client.chat(message, conversation_id=conversation_id, use_pinned=use_pinned)
        return jsonify(result)
    except PiAuthError as e:
        return jsonify({"error": f"auth_error: {e}", "status_code": e.status_code}), 401
    except PiRateLimitError as e:
        return jsonify({"error": "rate_limited", "detail": str(e)}), 429
    except PiError as e:
        return jsonify({"error": str(e), "status_code": e.status_code}), 502
    except Exception as e:
        return jsonify({"error": f"unexpected: {e}"}), 500


@app.post("/pi/create")
def pi_create():
    """Create a new Pi.ai conversation and pin it.

    Body: { "cookies": {...}, "pin": true }
    """
    cookies, err = _require_pi_cookies()
    if err:
        return err
    body = _body()
    pin = bool(body.get("pin", True))

    client = _pi_client(cookies)
    try:
        conv = client.create_conversation()
        cid = conv.get("sid") or conv.get("id")
        if pin and cid:
            client.pin_conversation(cid)
        return jsonify({
            "conversation": conv,
            "conversation_id": cid,
            "pinned_conversation_id": client.get_pinned_id(),
        })
    except PiAuthError as e:
        return jsonify({"error": f"auth_error: {e}"}), 401
    except PiError as e:
        return jsonify({"error": str(e)}), 502


@app.post("/pi/pin")
def pi_pin():
    """Pin a Pi.ai conversation.

    Body: { "conversation_id": "...", "cookies": {...} }
    """
    cookies, err = _require_pi_cookies()
    if err:
        return err
    body = _body()
    cid = body.get("conversation_id") or body.get("id")
    if not cid:
        return jsonify({"error": "conversation_id is required"}), 400

    client = _pi_client(cookies)
    client.pin_conversation(cid)
    return jsonify({"pinned": True, "conversation_id": cid,
                    "pinned_conversation_id": client.get_pinned_id()})


@app.post("/pi/unpin")
def pi_unpin():
    """Unpin the current Pi.ai conversation.

    Body: { "cookies": {...} }
    """
    cookies, err = _require_pi_cookies()
    if err:
        return err

    client = _pi_client(cookies)
    client.unpin_conversation()
    return jsonify({"unpinned": True, "pinned_conversation_id": client.get_pinned_id()})


@app.post("/pi/delete")
def pi_delete():
    """Delete a single Pi.ai conversation.

    Body: { "conversation_id": "...", "cookies": {...} }
    """
    cookies, err = _require_pi_cookies()
    if err:
        return err
    body = _body()
    cid = body.get("conversation_id") or body.get("id")
    if not cid:
        return jsonify({"error": "conversation_id is required"}), 400

    client = _pi_client(cookies)
    try:
        ok = client.delete_conversation(cid)
        return jsonify({"success": ok, "conversation_id": cid,
                        "pinned_conversation_id": client.get_pinned_id()}), (200 if ok else 502)
    except PiAuthError as e:
        return jsonify({"error": f"auth_error: {e}"}), 401
    except PiError as e:
        return jsonify({"error": str(e)}), 502


@app.post("/pi/delete/all")
def pi_delete_all():
    """Delete all Pi.ai conversations tracked by this server for this session.

    Body: { "cookies": {...}, "confirm": true }
    """
    cookies, err = _require_pi_cookies()
    if err:
        return err
    body = _body()
    if not body.get("confirm"):
        return jsonify({
            "error": 'Destructive. Pass {"confirm": true} to delete all tracked Pi.ai conversations.',
        }), 400

    client = _pi_client(cookies)
    try:
        result = client.delete_all_tracked()
        return jsonify({"success": True, **result,
                        "pinned_conversation_id": client.get_pinned_id()})
    except PiAuthError as e:
        return jsonify({"error": f"auth_error: {e}"}), 401
    except PiError as e:
        return jsonify({"error": str(e)}), 502


@app.get("/pi/conversations")
def pi_conversations():
    """List ALL Pi.ai conversations on the account (from server).

    Also shows which IDs this server is tracking locally.
    Query/body param: cookies
    """
    cookies, err = _require_pi_cookies()
    if err:
        return err
    body = _body()
    include_deleted = bool(body.get("include_deleted", False))

    client = _pi_client(cookies)
    try:
        all_convs = client.list_conversations(include_deleted=include_deleted)
        return jsonify({
            "conversations": all_convs,
            "count": len(all_convs),
            "tracked_ids": client.tracked_conversation_ids(),
            "pinned_conversation_id": client.get_pinned_id(),
        })
    except PiAuthError as e:
        return jsonify({"error": f"auth_error: {e}"}), 401
    except PiError as e:
        return jsonify({"error": str(e)}), 502


@app.get("/pi/history")
def pi_history():
    """Fetch chat history for a Pi.ai conversation.

    Query params: conversation_id (or id), limit (default 100)
    Body: { "conversation_id": "...", "cookies": {...} }
    """
    cookies, err = _require_pi_cookies()
    if err:
        return err
    body = _body()
    cid = (
        body.get("conversation_id") or body.get("id")
        or request.args.get("conversation_id") or request.args.get("id")
    )
    if not cid:
        return jsonify({"error": "conversation_id is required"}), 400
    limit = int(request.args.get("limit") or body.get("limit") or 100)

    client = _pi_client(cookies)
    try:
        messages = client.get_history(cid, limit=limit)
        return jsonify({"messages": messages, "count": len(messages), "conversation_id": cid})
    except PiAuthError as e:
        return jsonify({"error": f"auth_error: {e}"}), 401
    except PiError as e:
        return jsonify({"error": str(e)}), 502


@app.get("/pi/greeting")
def pi_greeting():
    """Fetch Pi's greeting message. Body/query: cookies"""
    cookies, err = _require_pi_cookies()
    if err:
        return err
    client = _pi_client(cookies)
    try:
        return jsonify(client.greeting())
    except PiError as e:
        return jsonify({"error": str(e)}), 502


@app.get("/pi/discover")
def pi_discover():
    """Fetch Pi's discover/topic suggestions. Body/query: cookies"""
    cookies, err = _require_pi_cookies()
    if err:
        return err
    client = _pi_client(cookies)
    try:
        return jsonify(client.discover())
    except PiError as e:
        return jsonify({"error": str(e)}), 502


# ===================== DeepAI (free, no cookies) =====================

_deepai_client_singleton: Optional[DeepAIClient] = None


def _deepai_client() -> DeepAIClient:
    global _deepai_client_singleton
    if _deepai_client_singleton is None:
        _deepai_client_singleton = DeepAIClient()
    return _deepai_client_singleton


@app.post("/deep")
def deepai_chat():
    """Chat with DeepAI (free 'standard' model). No cookies required.

    Body: {message, conversation_id?, model?, chat_style?, history?, stream?}
    """
    body = _body()
    msg = body.get("message")
    if not msg or not isinstance(msg, str):
        return jsonify({"error": "message is required"}), 400
    conv_id = body.get("conversation_id")
    model = body.get("model") or "standard"
    chat_style = body.get("chat_style") or "what-is-ai"
    history = body.get("history")
    stream = bool(body.get("stream"))

    client = _deepai_client()
    try:
        if stream:
            def gen():
                for chunk in client.chat_stream(
                    msg, conversation_id=conv_id, model=model,
                    chat_style=chat_style, history=history,
                ):
                    yield f"data: {json.dumps({'text': chunk})}\n\n"
                yield "data: [DONE]\n\n"
            return Response(gen(), mimetype="text/event-stream")
        result = client.chat(
            msg, conversation_id=conv_id, model=model,
            chat_style=chat_style, history=history,
        )
        return jsonify(result)
    except DeepAIError as e:
        return jsonify({"error": str(e), "status_code": e.status_code}), 502


@app.post("/deep/create")
def deepai_create():
    """Create a new conversation (just allocates a UUID server-side)."""
    cid = _deepai_client().create_conversation()
    return jsonify({"conversation_id": cid})


@app.get("/deep/conversations")
def deepai_conversations():
    return jsonify({"conversations": _deepai_client().list_conversations()})


@app.get("/deep/history")
def deepai_history():
    body = _body()
    cid = body.get("conversation_id") or request.args.get("conversation_id")
    if not cid:
        return jsonify({"error": "conversation_id is required"}), 400
    return jsonify({"conversation_id": cid, "messages": _deepai_client().get_history(cid)})


@app.post("/deep/delete")
def deepai_delete():
    body = _body()
    cid = body.get("conversation_id")
    if not cid:
        return jsonify({"error": "conversation_id is required"}), 400
    return jsonify({"deleted": _deepai_client().delete_conversation(cid)})


@app.post("/deep/delete/all")
def deepai_delete_all():
    body = _body()
    if not body.get("confirm"):
        return jsonify({"error": "confirm: true required"}), 400
    return jsonify({"deleted": _deepai_client().delete_all()})


@app.get("/deep/models")
def deepai_models():
    from deepai.client import MODELS as DEEPAI_MODELS
    return jsonify({"models": DEEPAI_MODELS, "default": "standard"})


# ===================== Perplexity ('pixeai') =====================

def _pixe_client(body: Dict[str, Any]) -> PixeAIClient:
    """Build a per-request client (so per-call cookies work)."""
    cookies = body.get("cookies")
    if isinstance(cookies, str):
        jar: Dict[str, str] = {}
        for part in cookies.split(";"):
            if "=" in part:
                k, v = part.split("=", 1)
                jar[k.strip()] = v.strip()
        cookies = jar
    return PixeAIClient(cookies=cookies if isinstance(cookies, dict) else None)


# Process-wide singleton just to back the local conversation registry across calls.
_pixe_singleton: Optional[PixeAIClient] = None


def _pixe_registry() -> PixeAIClient:
    global _pixe_singleton
    if _pixe_singleton is None:
        _pixe_singleton = PixeAIClient()
    return _pixe_singleton


@app.post("/pixe")
def pixe_chat():
    """Chat with Perplexity AI.

    Body: {message, conversation_id?, mode? (copilot|concise),
           model? (turbo), search_focus?, sources?, stream?, cookies?}
    """
    body = _body()
    msg = body.get("message") or body.get("query")
    if not msg or not isinstance(msg, str):
        return jsonify({"error": "message is required"}), 400

    conv_id = body.get("conversation_id")
    mode = body.get("mode") or "copilot"
    model = body.get("model") or "turbo"
    search_focus = body.get("search_focus") or "internet"
    sources = body.get("sources")
    stream = bool(body.get("stream"))

    # Use a per-request client (for cookies) but copy its conversation entry
    # back into the registry so /pixe/history works.
    client = _pixe_client(body)
    reg = _pixe_registry()
    if conv_id and conv_id in reg._conversations:
        client._conversations[conv_id] = reg._conversations[conv_id]

    try:
        if stream:
            def gen():
                for evt in client.ask_stream(
                    msg, conversation_id=conv_id, mode=mode, model=model,
                    search_focus=search_focus, sources=sources,
                ):
                    yield f"data: {json.dumps(evt)}\n\n"
                yield "data: [DONE]\n\n"
            return Response(gen(), mimetype="text/event-stream")
        result = client.ask(
            msg, conversation_id=conv_id, mode=mode, model=model,
            search_focus=search_focus, sources=sources,
        )
        # Sync local-registry copy so /pixe/history reflects the latest turn.
        cid = result.get("conversation_id")
        if cid and cid in client._conversations:
            reg._conversations[cid] = client._conversations[cid]
        return jsonify(result)
    except PixeAIError as e:
        return jsonify({"error": str(e), "status_code": e.status_code, "body": e.body}), 502


@app.post("/pixe/create")
def pixe_create():
    cid = _pixe_registry().create_conversation()
    return jsonify({"conversation_id": cid})


@app.get("/pixe/conversations")
def pixe_conversations():
    return jsonify({"conversations": _pixe_registry().list_conversations()})


@app.get("/pixe/history")
def pixe_history():
    body = _body()
    cid = body.get("conversation_id") or request.args.get("conversation_id")
    if not cid:
        return jsonify({"error": "conversation_id is required"}), 400
    return jsonify({"conversation_id": cid, "messages": _pixe_registry().get_history(cid)})


@app.post("/pixe/delete")
def pixe_delete():
    body = _body()
    cid = body.get("conversation_id")
    if not cid:
        return jsonify({"error": "conversation_id is required"}), 400
    return jsonify({"deleted": _pixe_registry().delete_conversation(cid)})


@app.post("/pixe/delete/all")
def pixe_delete_all():
    body = _body()
    if not body.get("confirm"):
        return jsonify({"error": "confirm: true required"}), 400
    return jsonify({"deleted": _pixe_registry().delete_all()})


@app.get("/pixe/modes")
def pixe_modes():
    from pixeai.client import MODES as PIXE_MODES, DEFAULT_MODE
    return jsonify({"modes": list(PIXE_MODES.keys()), "default": DEFAULT_MODE})


@app.get("/pixe/models")
def pixe_models():
    from pixeai.client import MODELS as PIXE_MODELS, DEFAULT_MODEL
    return jsonify({"models": list(PIXE_MODELS.keys()), "default": DEFAULT_MODEL})


# ===================== sourceHez (chat.z.ai) =====================

# Single shared client per token — so chat ids are reused (no spam create).
_hez_clients: Dict[str, SourceHezClient] = {}


def _hez_token_from_body(body: Dict[str, Any]) -> str:
    tok = body.get("token")
    if isinstance(tok, str) and tok:
        return tok
    cookies = body.get("cookies")
    if isinstance(cookies, str):
        for part in cookies.split(";"):
            if "=" in part:
                k, v = part.split("=", 1)
                if k.strip() == "token":
                    return v.strip()
    if isinstance(cookies, dict) and isinstance(cookies.get("token"), str):
        return cookies["token"]
    # GET routes: fall back to query string / Cookie header.
    qtok = request.args.get("token")
    if qtok:
        return qtok
    raw_cookie = request.headers.get("Cookie", "")
    for part in raw_cookie.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            if k.strip() == "token":
                return v.strip()
    return ""


def _hez_client(body: Dict[str, Any]) -> SourceHezClient:
    token = _hez_token_from_body(body)
    if not token:
        raise SourceHezError("token (or cookies.token) is required")
    if token not in _hez_clients:
        _hez_clients[token] = SourceHezClient(token=token)
    return _hez_clients[token]


@app.post("/hez")
def hez_chat():
    """Chat with chat.z.ai (GLM-5-Turbo).

    Body: {message, conversation_id?, model?, web_search?, thinking?,
           stream?, token? | cookies?}
    The same chat_id is reused for follow-ups within a conversation_id
    (no spamming /chats/new on every call).
    """
    body = _body()
    msg = body.get("message")
    if not msg or not isinstance(msg, str):
        return jsonify({"error": "message is required"}), 400
    try:
        client = _hez_client(body)
    except SourceHezError as e:
        return jsonify({"error": str(e)}), 401

    conv_id = body.get("conversation_id")
    model = body.get("model") or HEZ_DEFAULT_MODEL
    web_search = bool(body.get("web_search"))
    thinking = bool(body.get("thinking"))
    stream = bool(body.get("stream"))

    try:
        if stream:
            def gen():
                for evt in client.ask_stream(
                    msg, conversation_id=conv_id, model=model,
                    web_search=web_search, thinking=thinking,
                ):
                    yield f"data: {json.dumps(evt)}\n\n"
                yield "data: [DONE]\n\n"
            return Response(gen(), mimetype="text/event-stream")
        result = client.ask(
            msg, conversation_id=conv_id, model=model,
            web_search=web_search, thinking=thinking,
        )
        return jsonify(result)
    except SourceHezError as e:
        return jsonify({"error": str(e), "status_code": e.status_code, "body": e.body}), 502


@app.post("/hez/create")
def hez_create():
    body = _body()
    try:
        client = _hez_client(body)
    except SourceHezError as e:
        return jsonify({"error": str(e)}), 401
    return jsonify({"conversation_id": client.create_conversation()})


@app.get("/hez/conversations")
def hez_conversations():
    body = _body()
    try:
        client = _hez_client(body)
    except SourceHezError as e:
        return jsonify({"error": str(e)}), 401
    return jsonify({"conversations": client.list_conversations()})


@app.get("/hez/history")
def hez_history():
    body = _body()
    cid = body.get("conversation_id") or request.args.get("conversation_id")
    if not cid:
        return jsonify({"error": "conversation_id is required"}), 400
    try:
        client = _hez_client(body)
    except SourceHezError as e:
        return jsonify({"error": str(e)}), 401
    return jsonify({"conversation_id": cid, "messages": client.get_history(cid)})


@app.post("/hez/delete")
def hez_delete():
    body = _body()
    cid = body.get("conversation_id")
    if not cid:
        return jsonify({"error": "conversation_id is required"}), 400
    try:
        client = _hez_client(body)
    except SourceHezError as e:
        return jsonify({"error": str(e)}), 401
    return jsonify({"deleted": client.delete_conversation(cid, remote=bool(body.get("remote", True)))})


@app.post("/hez/delete/all")
def hez_delete_all():
    body = _body()
    if not body.get("confirm"):
        return jsonify({"error": "confirm: true required"}), 400
    try:
        client = _hez_client(body)
    except SourceHezError as e:
        return jsonify({"error": str(e)}), 401
    return jsonify({"deleted": client.delete_all(remote=bool(body.get("remote", True)))})


@app.get("/hez/models")
def hez_models():
    return jsonify({"models": list(HEZ_MODELS.keys()), "default": HEZ_DEFAULT_MODEL})


@app.get("/hez/upstream")
def hez_upstream():
    """List actual chats stored on chat.z.ai for this token."""
    body = _body()
    try:
        client = _hez_client(body)
    except SourceHezError as e:
        return jsonify({"error": str(e)}), 401
    page = int(request.args.get("page") or body.get("page") or 1)
    try:
        return jsonify({"page": page, "data": client.list_remote_chats(page=page)})
    except SourceHezError as e:
        return jsonify({"error": str(e), "status_code": e.status_code, "body": e.body}), 502


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
