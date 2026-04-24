const STAFF_ROLES = new Set(["owner", "admin", "mod"]);

export function isUserVerified(u: any): boolean {
  if (!u) return false;

  const role = String((u as any).role || "user").toLowerCase();
  if (STAFF_ROLES.has(role)) return true;

  const v: any = (u as any).verified;
  if (v === true) return true;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    if (s === "true" || s === "1" || s === "yes" || s === "verified") return true;
  }
  if (typeof v === "number" && v === 1) return true;

  const ev: any = (u as any).emailVerified;
  if (ev === true || ev === 1 || ev === "true") return true;

  if ((u as any).verifiedAt && Number((u as any).verifiedAt) > 0) return true;

  return false;
}

export function filterVerified<T = any>(users: T[]): T[] {
  return users.filter(isUserVerified);
}
