import { db } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { users, sessions, appSettings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { scryptSync, randomBytes, timingSafeEqual, createHash } from "crypto";
import { cookies } from "next/headers";

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    const test = scryptSync(pw, salt, 64);
    return timingSafeEqual(test, Buffer.from(hash, "hex"));
  } catch { return false; }
}
export function hashKey(k: string) { return createHash("sha256").update(k.trim().toLowerCase()).digest("hex"); }

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettings);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}
export async function setSetting(key: string, value: string) {
  await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

export type SafeUser = { id: number; email: string; plan: string; proUntil: string | null; createdAt: string; effectivePlan: "free" | "pro"; proExpired: boolean; isAdmin: boolean };

export async function toSafeUser(u: typeof users.$inferSelect): Promise<SafeUser> {
  const settings = await getSettings();
  const adminEmail = (settings.admin_email || process.env.ADMIN_EMAIL || "").toLowerCase();
  const now = new Date();
  const proUntil = u.proUntil ? new Date(u.proUntil) : null;
  const isProRaw = u.plan === "pro";
  const expired = isProRaw && proUntil !== null && proUntil.getTime() < now.setHours(0, 0, 0, 0);
  const isAdmin = !!adminEmail && u.email.toLowerCase() === adminEmail;
  // The app owner (Admin) always gets Pro — no limits, no expiry.
  const effectivePlan: "free" | "pro" = isAdmin || (isProRaw && !expired) ? "pro" : "free";
  return {
    id: u.id, email: u.email, plan: u.plan,
    proUntil: u.proUntil ? new Date(u.proUntil).toISOString() : null,
    createdAt: new Date(u.createdAt).toISOString(),
    effectivePlan, proExpired: isAdmin ? false : !!expired,
    isAdmin,
  };
}

export async function currentUser(): Promise<{ user: typeof users.$inferSelect; safe: SafeUser } | null> {
  await ensureSchema();
  const jar = await cookies();
  const token = jar.get("nova_session")?.value;
  if (!token) return null;
  const [s] = await db.select().from(sessions).where(eq(sessions.token, token));
  if (!s || new Date(s.expiresAt).getTime() < Date.now()) return null;
  const [u] = await db.select().from(users).where(eq(users.id, s.userId));
  if (!u) return null;
  return { user: u, safe: await toSafeUser(u) };
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await db.insert(sessions).values({ token, userId, expiresAt });
  return token;
}

export function extendPro(current: Date | null, days: number): Date {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const base = current && new Date(current).getTime() > today.getTime() ? new Date(current) : today;
  const out = new Date(base); out.setDate(out.getDate() + days);
  return out;
}

export const DEFAULT_SETTINGS: Record<string, string> = {
  admin_email: "",
  price_monthly_pkr: "500",
  price_yearly_pkr: "4000",
  price_monthly_usd: "1.8",
  price_yearly_usd: "14",
  jazzcash_number: "",
  jazzcash_title: "",
  easypaisa_number: "",
  easypaisa_title: "",
  gumroad_permalink: "",
  license_max_uses: "1",
  support_whatsapp: "",
  limit_guest_chat: "5",
  limit_free_chat: "20",
  limit_free_prompts: "5",
  limit_free_images: "3",
  limit_free_whatsapp: "3",
  limit_free_sheet: "3",
  limit_free_projects: "2",
  limit_free_databases: "1",
  cloud_url: "",
  cloud_anon_key: "",
  // Central AI service (owner's keys — server-side only, never sent to clients)
  owner_ai_base_url: "https://openrouter.ai/api/v1",
  owner_ai_model: "openrouter/free",
  owner_ai_key: "",
  owner_image_base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
  owner_image_model: "gemini-2.5-flash-image",
  owner_image_key: "",
  ai_global_cap: "200",
};

export async function ensureSettings() {
  await ensureSchema();
  const existing = await getSettings();
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(k in existing)) await setSetting(k, v);
  }
}

/* ---------- Central AI service (owner key, server-side only) ---------- */
export type AiConfig = {
  chat: { baseUrl: string; model: string; key: string };
  image: { baseUrl: string; model: string; key: string };
  cap: number;
};

export async function getAiConfig(): Promise<AiConfig> {
  const s = await getSettings();
  const pick = (sv: string | undefined, ev: string | undefined, dflt = "") => {
    const a = (sv || "").trim(); if (a) return a;
    const b = (ev || "").trim(); if (b) return b;
    return dflt;
  };
  return {
    chat: {
      baseUrl: pick(s.owner_ai_base_url, process.env.OWNER_AI_BASE_URL, "https://openrouter.ai/api/v1").replace(/\/$/, ""),
      model: pick(s.owner_ai_model, process.env.OWNER_AI_MODEL, "openrouter/free"),
      key: pick(s.owner_ai_key, process.env.OWNER_AI_KEY),
    },
    image: {
      baseUrl: pick(s.owner_image_base_url, process.env.OWNER_IMAGE_BASE_URL, "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, ""),
      model: pick(s.owner_image_model, process.env.OWNER_IMAGE_MODEL, "gemini-2.5-flash-image"),
      key: pick(s.owner_image_key, process.env.OWNER_IMAGE_KEY),
    },
    cap: Math.max(0, parseInt(s.ai_global_cap || "200", 10) || 0),
  };
}

export function maskSecret(k: string) {
  if (!k) return "";
  return k.length <= 8 ? "••••••••" : `${k.slice(0, 4)}••••••••${k.slice(-4)}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function bumpGlobalAiUsage(): Promise<number> {
  // node-postgres driver: db.execute returns { rows: [...] }
  const res = (await db.execute(sql`INSERT INTO "ai_usage_daily" ("date", "count") VALUES (${todayStr()}, 1) ON CONFLICT ("date") DO UPDATE SET "count" = "ai_usage_daily"."count" + 1 RETURNING "count"`)) as unknown as { rows: { count: number }[] };
  return Number(res.rows?.[0]?.count ?? 1);
}

export async function getGlobalAiUsageToday(): Promise<number> {
  const res = (await db.execute(sql`SELECT "count" FROM "ai_usage_daily" WHERE "date" = ${todayStr()}`)) as unknown as { rows: { count: number }[] };
  return Number(res.rows?.[0]?.count ?? 0);
}
