import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { upgradeRequests, users, licenseUses } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { currentUser, getSettings, extendPro, hashKey } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const rows = await db.select().from(upgradeRequests).where(eq(upgradeRequests.userId, me.user.id)).orderBy(desc(upgradeRequests.createdAt));
  return NextResponse.json({ requests: rows });
}

export async function POST(req: NextRequest) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "request");

  if (action === "request") {
    const method = String(body.method || "");
    const reference = String(body.reference || "").trim();
    const senderNumber = String(body.senderNumber || "").trim();
    const planType = body.planType === "yearly" ? "yearly" : "monthly";
    if (!["jazzcash", "easypaisa"].includes(method)) return NextResponse.json({ error: "Choose JazzCash or EasyPaisa." }, { status: 400 });
    if (reference.length < 4) return NextResponse.json({ error: "Enter the real Transaction ID from your payment receipt." }, { status: 400 });
    if (senderNumber.length < 7) return NextResponse.json({ error: "Enter the number you sent payment from." }, { status: 400 });
    const [row] = await db.insert(upgradeRequests).values({
      userId: me.user.id, userEmail: me.user.email, method, reference, senderNumber, planType, status: "pending",
    }).returning();
    return NextResponse.json({ ok: true, request: row, message: "Request received — approval usually within a few hours. You will see Pro active here once the owner approves. No payment is confirmed by this app until then." });
  }

  if (action === "license") {
    const licenseKey = String(body.licenseKey || "").trim();
    const planType = body.planType === "yearly" ? "yearly" : "monthly";
    if (!licenseKey) return NextResponse.json({ error: "Enter your license key." }, { status: 400 });
    const s = await getSettings();
    const permalink = (s.gumroad_permalink || "").trim();
    if (!permalink) return NextResponse.json({ error: "License activation is not set up yet — the owner has not added a Gumroad product in Admin → Settings." }, { status: 400 });
    const maxUses = Math.max(1, Number(s.license_max_uses || 1));
    const keyHash = hashKey(licenseKey);
    const [prior] = await db.select().from(licenseUses).where(eq(licenseUses.keyHash, keyHash));
    if (prior && prior.userId !== me.user.id) return NextResponse.json({ error: "This license key is already activated on another account." }, { status: 400 });
    if (prior && prior.userId === me.user.id) return NextResponse.json({ error: "This license key was already used on your account. Use Renew in Admin-approved flow or contact support." }, { status: 400 });

    // Real Gumroad verification — never activate on failure/timeout/offline
    let gumroadOk = false; let uses = 0; let detail = "";
    try {
      const form = new URLSearchParams({ product_permalink: permalink, license_key: licenseKey });
      const res = await fetch("https://api.gumroad.com/v2/licenses/verify", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(),
        signal: AbortSignal.timeout(15000),
      });
      const json = await res.json().catch(() => null);
      gumroadOk = !!(json && json.success === true);
      uses = Number(json?.purchase?.uses ?? json?.uses ?? 0);
      if (!gumroadOk) detail = String(json?.message || `Gumroad said the key is not valid (HTTP ${res.status}).`);
    } catch (e) {
      return NextResponse.json({ error: `Could not reach Gumroad to verify the key (${e instanceof Error ? e.message : "network error"}). Nothing was activated — check your connection and try again.` }, { status: 502 });
    }
    if (!gumroadOk) return NextResponse.json({ error: `License not verified. ${detail}` }, { status: 400 });
    if (uses > maxUses) return NextResponse.json({ error: `This key has been used ${uses} times, above the owner's allowed limit of ${maxUses}. It was refused.` }, { status: 400 });

    const days = planType === "yearly" ? 365 : 30;
    const newUntil = extendPro(me.user.proUntil ? new Date(me.user.proUntil) : null, days);
    await db.update(users).set({ plan: "pro", proUntil: newUntil }).where(eq(users.id, me.user.id));
    await db.insert(licenseUses).values({ keyHash, userId: me.user.id, productPermalink: permalink, daysGranted: days });
    await db.insert(upgradeRequests).values({ userId: me.user.id, userEmail: me.user.email, method: "license", reference: `license:${keyHash.slice(0, 8)}…`, senderNumber: "", planType, status: "approved", decidedAt: new Date() });
    return NextResponse.json({ ok: true, proUntil: newUntil.toISOString(), message: `License verified with Gumroad. Pro is active until ${newUntil.toLocaleDateString()}.` });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
