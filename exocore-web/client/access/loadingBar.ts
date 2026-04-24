import axios from "axios";

let inflight = 0;
let bar: HTMLDivElement | null = null;
let hideTimer: number | null = null;
let progress = 0;
let trickleTimer: number | null = null;

function ensureBar(): HTMLDivElement {
  if (bar) return bar;
  const el = document.createElement("div");
  el.id = "exo-global-loader";
  el.style.cssText = [
    "position:fixed","top:0","left:0","height:2px","width:0%",
    "background:linear-gradient(90deg,#ffd400,#ffae00)",
    "box-shadow:0 0 8px rgba(255,212,0,0.6)",
    "z-index:2147483647","transition:width .2s ease,opacity .25s ease",
    "opacity:0","pointer-events:none",
  ].join(";");
  document.body.appendChild(el);
  bar = el;
  return el;
}

function setWidth(p: number) {
  const el = ensureBar();
  el.style.opacity = p > 0 && p < 100 ? "1" : (p >= 100 ? "1" : "0");
  el.style.width = `${Math.max(0, Math.min(100, p))}%`;
}

function start() {
  inflight++;
  if (inflight === 1) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    progress = 8;
    setWidth(progress);
    if (trickleTimer) clearInterval(trickleTimer);
    trickleTimer = window.setInterval(() => {
      if (progress < 85) {
        progress += (85 - progress) * 0.08;
        setWidth(progress);
      }
    }, 250);
  }
}

function done() {
  inflight = Math.max(0, inflight - 1);
  if (inflight === 0) {
    if (trickleTimer) { clearInterval(trickleTimer); trickleTimer = null; }
    progress = 100;
    setWidth(progress);
    hideTimer = window.setTimeout(() => {
      progress = 0;
      setWidth(0);
    }, 250);
  }
}

axios.interceptors.request.use(cfg => {
  // Skip noisy polling endpoints so we don't blink the bar constantly.
  const url = (cfg.url || "").toString();
  const skip =
    url.includes("/exocore/api/auth/token-verify") ||
    url.includes("/exocore/api/social/avatar") ||
    url.includes("/exocore/api/editor/projects/list");
  if (!skip) {
    (cfg as { _exoLoad?: boolean })._exoLoad = true;
    start();
  }
  return cfg;
});

axios.interceptors.response.use(
  res => {
    if ((res.config as { _exoLoad?: boolean })._exoLoad) done();
    return res;
  },
  err => {
    if (err?.config && (err.config as { _exoLoad?: boolean })._exoLoad) done();
    return Promise.reject(err);
  }
);
