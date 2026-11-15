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
  const [existing] = await db.select().from(userData).where(and(eq(userData.userId, me.user.id), eq(userData.collection, collection)));
  if (existing) {
    await db.update(userData).set({ data, updatedAt: new Date() }).where(eq(userData.id, existing.id));
  } else {
    await db.insert(userData).values({ userId: me.user.id, collection, data });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ collection: string }> }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { collection } = await ctx.params;
  await db.delete(userData).where(and(eq(userData.userId, me.user.id), eq(userData.collection, collection)));
  return NextResponse.json({ ok: true });
}
