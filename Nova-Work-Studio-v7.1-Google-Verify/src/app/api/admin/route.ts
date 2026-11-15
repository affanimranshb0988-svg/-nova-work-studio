import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { upgradeRequests, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { currentUser, getSettings, setSetting, extendPro, ensureSettings, toSafeUser, getAiConfig, maskSecret, getGlobalAiUsageToday } from "@/lib/server";

export const dynamic = "force-dynamic";

async function guard() {
  const me = await currentUser();
  if (!me) return { err: NextResponse.json({ error: "Login required" }, { status: 401 }) };
  if (!me.safe.isAdmin) return { err: NextResponse.json({ error: "Admin only. This area is restricted to the app owner." }, { status: 403 }) };
  return { me };
}

export async function GET() {
  const g = await guard(); if (g.err) return g.err;
  await ensureSettings();
  const reqs = await db.select().from(upgradeRequests).orderBy(desc(upgradeRequests.createdAt));
  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
  const safeUsers = await Promise.all(allUsers.map((u) => toSafeUser(u)));
  const raw = await getSettings();
  // Never send the raw owner keys to the browser — masked status only.
  const { owner_ai_key, owner_image_key, ...settings } = raw;
  const ai = await getAiConfig();
  return NextResponse.json({
    requests: reqs, users: safeUsers, settings,
    ai: {
      chatConfigured: !!ai.chat.key, chatMasked: maskSecret(ai.chat.key), chatBaseUrl: ai.chat.baseUrl, chatModel: ai.chat.model,
      imageConfigured: !!ai.image.key, imageMasked: maskSecret(ai.image.key), imageBaseUrl: ai.image.baseUrl, imageModel: ai.image.model,
      cap: ai.cap, callsToday: await getGlobalAiUsageToday(),
    },
  });
}

export async function POST(req: NextRequest) {
  const g = await guard(); if (g.err) return g.err;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "decide") {
    const id = Number(body.id);
    const approve = body.decision === "approve";
    const [r] = await db.select().from(upgradeRequests).where(eq(upgradeRequests.id, id));
    if (!r) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (r.status !== "pending") return NextResponse.json({ error: "This request was already decided." }, { status: 400 });
    await db.update(upgradeRequests).set({ status: approve ? "approved" : "rejected", decidedAt: new Date() }).where(eq(upgradeRequests.id, id));
    if (approve) {
      const [target] = await db.select().from(users).where(eq(users.id, r.userId));
      const days = r.planType === "yearly" ? 365 : 30;
      // Renewal rule: extend from the later of today or current pro_until
      const newUntil = extendPro(target?.proUntil ? new Date(target.proUntil) : null, days);
      await db.update(users).set({ plan: "pro", proUntil: newUntil }).where(eq(users.id, r.userId));
      return NextResponse.json({ ok: true, proUntil: newUntil.toISOString() });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "grantPro") {
    const userId = Number(body.userId);
    const [target] = await db.select().from(users).where(eq(users.id, userId));
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const newUntil = extendPro(target.proUntil ? new Date(target.proUntil) : null, 30);
    await db.update(users).set({ plan: "pro", proUntil: newUntil }).where(eq(users.id, userId));
    return NextResponse.json({ ok: true, proUntil: newUntil.toISOString() });
  }

  if (action === "removePro") {
    const userId = Number(body.userId);
    await db.update(users).set({ plan: "free", proUntil: null }).where(eq(users.id, userId));
    return NextResponse.json({ ok: true });
  }

  if (action === "settings") {
    const allowed = ["admin_email","price_monthly_pkr","price_yearly_pkr","price_monthly_usd","price_yearly_usd","jazzcash_number","jazzcash_title","easypaisa_number","easypaisa_title","gumroad_permalink","license_max_uses","support_whatsapp","limit_guest_chat","limit_free_chat","limit_free_prompts","limit_free_images","limit_free_whatsapp","limit_free_sheet","limit_free_projects","limit_free_databases","cloud_url","cloud_anon_key","owner_ai_base_url","owner_ai_model","owner_image_base_url","owner_image_model","ai_global_cap"];
    const incoming = (body.settings || {}) as Record<string, string>;
    for (const k of allowed) if (k in incoming) await setSetting(k, String(incoming[k] ?? ""));
    return NextResponse.json({ ok: true });
  }

  if (action === "aiKeys") {
    // Keys are write-only from the client: a non-empty value replaces the
    // stored key; an empty/absent value leaves it untouched.
    if (typeof body.chatKey === "string" && body.chatKey.trim()) await setSetting("owner_ai_key", body.chatKey.trim());
    if (typeof body.imageKey === "string" && body.imageKey.trim()) await setSetting("owner_image_key", body.imageKey.trim());
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
