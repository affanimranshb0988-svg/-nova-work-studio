import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userData } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { currentUser } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ collection: string }> }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { collection } = await ctx.params;
  const [row] = await db.select().from(userData).where(and(eq(userData.userId, me.user.id), eq(userData.collection, collection)));
  return NextResponse.json({ data: row?.data ?? null, updatedAt: row?.updatedAt ?? null });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ collection: string }> }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { collection } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const data = body.data ?? null;
  // Optimistic concurrency for delete-path saves: the client sends the
  // revision (updatedAt) it last loaded. If another instance saved a newer
  // list since — e.g. a second tab/PWA holding the old list — reject with
  // 409 instead of silently overwriting that newer list (which is how a
  // deleted chat came back). Plain saves omit baseUpdatedAt and behave
  // exactly as before.
  const baseUpdatedAt = typeof body.baseUpdatedAt === "string" && body.baseUpdatedAt ? body.baseUpdatedAt : null;
  const [existing] = await db.select().from(userData).where(and(eq(userData.userId, me.user.id), eq(userData.collection, collection)));
  if (existing && baseUpdatedAt) {
    const storedMs = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
    const baseMs = new Date(baseUpdatedAt).getTime();
    if (!Number.isNaN(baseMs) && storedMs > baseMs) {
      return NextResponse.json({ ok: false, error: "stale", updatedAt: existing.updatedAt instanceof Date ? existing.updatedAt.toISOString() : existing.updatedAt }, { status: 409 });
    }
  }
  const now = new Date();
  if (existing) {
    await db.update(userData).set({ data, updatedAt: now }).where(eq(userData.id, existing.id));
  } else {
    await db.insert(userData).values({ userId: me.user.id, collection, data });
  }
  return NextResponse.json({ ok: true, updatedAt: now.toISOString() });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ collection: string }> }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { collection } = await ctx.params;
  await db.delete(userData).where(and(eq(userData.userId, me.user.id), eq(userData.collection, collection)));
  return NextResponse.json({ ok: true });
}
