import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, createSession, currentUser, toSafeUser, ensureSettings } from "@/lib/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await currentUser();
  return NextResponse.json({ user: me?.safe ?? null });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  await ensureSettings();

  if (action === "signup") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    const [exists] = await db.select().from(users).where(eq(users.email, email));
    if (exists) return NextResponse.json({ error: "An account with this email already exists. Please log in." }, { status: 409 });
    const [u] = await db.insert(users).values({ email, passwordHash: hashPassword(password), plan: "free" }).returning();
    const token = await createSession(u.id);
    const jar = await cookies();
    jar.set("nova_session", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 3600 });
    return NextResponse.json({ user: await toSafeUser(u) });
  }

  if (action === "login") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const [u] = await db.select().from(users).where(eq(users.email, email));
    if (!u || !verifyPassword(password, u.passwordHash)) return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
    const token = await createSession(u.id);
    const jar = await cookies();
    jar.set("nova_session", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 3600 });
    return NextResponse.json({ user: await toSafeUser(u) });
  }

  if (action === "logout") {
    const jar = await cookies();
    const token = jar.get("nova_session")?.value;
    if (token) await db.delete(sessions).where(eq(sessions.token, token));
    jar.delete("nova_session");
    return NextResponse.json({ ok: true });
  }

  if (action === "forgot") {
    // Honest: no email provider is configured in this build, so no fake reset email is claimed.
    return NextResponse.json({ ok: true, message: "Password reset by email is not configured by the owner yet. Contact support on WhatsApp from the Upgrade page, or create a new account. No reset email was sent." });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
