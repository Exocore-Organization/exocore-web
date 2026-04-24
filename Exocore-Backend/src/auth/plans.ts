import { Request, Response } from "express";
import axios from "axios";
import {
  getAllUsers, getUserFolder, writeUserDb, isCacheReady,
  uploadImagePublic, UserData,
} from "../services/drive";
import {
  addPayment, listPending, listForUser, listAll, getPayment,
  updatePayment, Payment,
} from "../services/paymentsStore";
import { awardAchievement, addXp } from "../services/xpService";
import { appendAudit } from "../services/auditStore";

const PLAN_BASE_PHP = 100;
const PLAN_DURATION_DAYS = 90;

const COUNTRY_TO_CCY: Record<string, string> = {
  PH: "PHP", US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", JP: "JPY",
  KR: "KRW", CN: "CNY", IN: "INR", ID: "IDR", SG: "SGD", MY: "MYR",
  TH: "THB", VN: "VND", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR",
  NL: "EUR", BE: "EUR", PT: "EUR", IE: "EUR", BR: "BRL", MX: "MXN",
  AR: "ARS", ZA: "ZAR", AE: "AED", SA: "SAR", TR: "TRY", RU: "RUB",
  PL: "PLN", SE: "SEK", NO: "NOK", DK: "DKK", CH: "CHF", NZ: "NZD",
  HK: "HKD", TW: "TWD", PK: "PKR", BD: "BDT", EG: "EGP", IL: "ILS",
};

interface FxCacheEntry { rate: number; ts: number }
const fxCache = new Map<string, FxCacheEntry>();
const FX_TTL_MS = 6 * 60 * 60 * 1000; // 6h

async function getRateFromPHP(targetCcy: string): Promise<number> {
  if (targetCcy === "PHP") return 1;
  const key = targetCcy.toUpperCase();
  const cached = fxCache.get(key);
  if (cached && Date.now() - cached.ts < FX_TTL_MS) return cached.rate;
  try {
    const r = await axios.get(`https://api.frankfurter.app/latest`, {
      params: { from: "PHP", to: key }, timeout: 5000,
    });
    const rate = Number(r.data?.rates?.[key]);
    if (Number.isFinite(rate) && rate > 0) {
      fxCache.set(key, { rate, ts: Date.now() });
      return rate;
    }
  } catch (e: any) {
    console.warn("[plans] fx fetch failed:", e?.message);
  }
  return 1;
}

async function userByToken(token: string): Promise<UserData | null> {
  if (!token) return null;
  return (await getAllUsers()).find(u => u.token === token) ?? null;
}

async function userByName(username: string): Promise<UserData | null> {
  if (!username) return null;
  return (await getAllUsers()).find(u => u.username === username) ?? null;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** GET /exocore/api/plans/catalog?token=... */
export async function catalogHandler(req: Request, res: Response) {
  try {
    const token = String(req.query.token || "");
    const me = token ? await userByToken(token) : null;
    const country = String(me?.country || req.query.country || "PH").toUpperCase();
    const targetCcy = COUNTRY_TO_CCY[country] || "PHP";
    const rate = await getRateFromPHP(targetCcy);
    const localPrice = Math.round(PLAN_BASE_PHP * rate * 100) / 100;
    return res.json({
      success: true,
      plans: [{
        id: "exo",
        name: "EXO PLAN",
        durationDays: PLAN_DURATION_DAYS,
        basePricePHP: PLAN_BASE_PHP,
        localCurrency: targetCcy,
        localPrice,
        fxRate: rate,
      }],
      payment: {
        gcash: {
          name: "JO*N ST**E C.",
          number: "09996440303",
          qrPayload: "00020101021127830012com.p2pqrpay0111GXCHPHM2XXX02089996440303152170200000006560417DWQM4TK3JDO6HMZ8K5204601653036085802PH5913JO*N ST**E C.6008Inayawan610412346304C55B",
        },
        gotyme: {
          name: "Johnsteve Costaños",
          number: "0177 1620 9059",
        },
      },
      me: me ? { plan: me.plan || "free", planExpiresAt: me.planExpiresAt || null, pendingPaymentId: me.pendingPaymentId || null } : null,
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** POST /exocore/api/plans/submit  multipart  fields: token, plan, method, note? + file */
export async function submitPaymentHandler(req: Request, res: Response) {
  try {
    if (!isCacheReady()) return res.status(503).json({ success: false, message: "warming up" });
    const token = String((req.body?.token ?? req.query.token ?? "")).trim();
    const plan = String((req.body?.plan ?? "exo")).trim();
    const method = (String(req.body?.method ?? "gcash").trim() as Payment["method"]);
    const note = String(req.body?.note ?? "").slice(0, 300);
    if (plan !== "exo") return res.status(400).json({ success: false, message: "unknown plan" });
    const me = await userByToken(token);
    if (!me) return res.status(401).json({ success: false, message: "invalid token" });
    if (me.pendingPaymentId) {
      return res.status(409).json({ success: false, message: "you already have a pending payment" });
    }
    const folderId = await getUserFolder(me.username);
    if (!folderId) return res.status(404).json({ success: false, message: "folder missing" });

    const id = newId("pay");
    let proofUrl: string | null = null;
    let proofFileId: string | null = null;
    const file = (req as any).file as { buffer: Buffer } | undefined;
    if (file?.buffer) {
      try {
        const fid = await uploadImagePublic(folderId, `payment_${id}.png`, file.buffer);
        if (fid) {
          proofFileId = fid;
          proofUrl = `https://drive.google.com/thumbnail?id=${fid}&sz=w1600`;
        }
      } catch (e: any) {
        console.warn("[plans] proof upload failed:", e?.message);
      }
    }
    const country = String(me.country || "PH").toUpperCase();
    const targetCcy = COUNTRY_TO_CCY[country] || "PHP";
    const rate = await getRateFromPHP(targetCcy);
    const amount = Math.round(PLAN_BASE_PHP * rate * 100) / 100;

    const pay: Payment = {
      id, ts: Date.now(), username: me.username, email: me.email,
      plan, amount, currency: targetCcy, method,
      proofUrl, proofFileId, note, status: "pending",
    };
    addPayment(pay);
    await writeUserDb(folderId, { ...me, pendingPaymentId: id });
    return res.json({ success: true, payment: pay });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** GET /exocore/api/plans/me?token=... → user's payments + plan state */
export async function myPaymentsHandler(req: Request, res: Response) {
  try {
    const token = String(req.query.token || "");
    const me = await userByToken(token);
    if (!me) return res.status(401).json({ success: false, message: "invalid token" });
    return res.json({
      success: true,
      plan: me.plan || "free",
      planExpiresAt: me.planExpiresAt || null,
      pendingPaymentId: me.pendingPaymentId || null,
      payments: listForUser(me.username),
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** GET /exocore/api/plans/pending?token=... (owner only) */
export async function listPendingHandler(req: Request, res: Response) {
  try {
    const token = String(req.query.token || "");
    const me = await userByToken(token);
    if (!me) return res.status(401).json({ success: false, message: "invalid token" });
    if (me.role !== "owner") return res.status(403).json({ success: false, message: "owner only" });
    const status = String(req.query.status || "pending");
    const all = status === "all" ? listAll() : listPending();
    return res.json({ success: true, payments: all });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** POST /exocore/api/plans/decide  { token, paymentId, decision: "approve"|"reject", reason? } (owner only) */
export async function decidePaymentHandler(req: Request, res: Response) {
  try {
    const { token, paymentId, decision, reason } = (req.body || {}) as {
      token?: string; paymentId?: string; decision?: "approve" | "reject"; reason?: string;
    };
    if (!token || !paymentId || !decision) {
      return res.status(400).json({ success: false, message: "token/paymentId/decision required" });
    }
    const me = await userByToken(token);
    if (!me) return res.status(401).json({ success: false, message: "invalid token" });
    if (me.role !== "owner") return res.status(403).json({ success: false, message: "owner only" });
    const pay = getPayment(paymentId);
    if (!pay) return res.status(404).json({ success: false, message: "not found" });
    if (pay.status !== "pending") return res.status(400).json({ success: false, message: "already decided" });

    const target = await userByName(pay.username);
    if (!target) return res.status(404).json({ success: false, message: "user not found" });
    const folderId = await getUserFolder(target.username);
    if (!folderId) return res.status(404).json({ success: false, message: "folder missing" });

    if (decision === "approve") {
      updatePayment(paymentId, { status: "approved", decidedAt: Date.now(), decidedBy: me.username });
      const now = Date.now();
      const baseExpiry = (typeof target.planExpiresAt === "number" && target.planExpiresAt > now)
        ? target.planExpiresAt : now;
      const newExpiry = baseExpiry + PLAN_DURATION_DAYS * 86400 * 1000;
      const updatedTarget = { ...target, plan: "exo" as const, planExpiresAt: newExpiry, pendingPaymentId: null };
      await writeUserDb(folderId, updatedTarget);
      // Phase 5: award supporter + bonus XP. Phase 6: audit.
      try { await awardAchievement(updatedTarget, "paid_supporter"); } catch {}
      try { await addXp(updatedTarget, "payment_approved"); } catch {}
      appendAudit({ by: me.username, action: "payment:approve", target: paymentId, meta: { username: target.username, expiresAt: newExpiry } });
      return res.json({ success: true, payment: getPayment(paymentId), planExpiresAt: newExpiry });
    } else if (decision === "reject") {
      updatePayment(paymentId, { status: "rejected", decidedAt: Date.now(), decidedBy: me.username, reason });
      await writeUserDb(folderId, { ...target, pendingPaymentId: null });
      appendAudit({ by: me.username, action: "payment:reject", target: paymentId, meta: { username: target.username, reason } });
      return res.json({ success: true, payment: getPayment(paymentId) });
    }
    return res.status(400).json({ success: false, message: "invalid decision" });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}
