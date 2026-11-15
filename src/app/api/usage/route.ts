import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { usageCounters } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { currentUser, getSettings } from "@/lib/server";

export const dynamic = "force-dynamic";
type Field = "chatCount" | "promptRuns" | "imagesCount" | "whatsappCount" | "sheetCount";
const MAP: Record<string, Field> = { chat: "chatCount", prompts: "promptRuns", images: "imagesCount", whatsapp: "whatsappCount", sheet: "sheetCount" };

async function getRow(userId: number, date: string) {
  const [row] = await db.select().from(usageCounters).where(and(eq(usageCounters.userId, userId), eq(usageCounters.date, date)));
  if (row) return row;
  const [created] = await db.insert(usageCounters).values({ userId, date }).returning();
  return created;
}

export async function GET(req: NextRequest) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const date = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const row = await getRow(me.user.id, date);
  return NextResponse.json({ usage: row, limits: await limitMap() });
}

async function limitMap() {
  const s = await getSettings();
  return {
    guestChat: Number(s.limit_guest_chat || 5), freeChat: Number(s.limit_free_chat || 20),
    freePrompts: Number(s.limit_free_prompts || 5), freeImages: Number(s.limit_free_images || 3),
    freeWhatsapp: Number(s.limit_free_whatsapp || 3), freeSheet: Number(s.limit_free_sheet || 3),
    freeProjects: Number(s.limit_free_projects || 2), freeDatabases: Number(s.limit_free_databases || 1),
  };
}

// POST {kind, date} -> checks + increments server-side, enforces plan limits
export async function POST(req: NextRequest) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Login required", allowed: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind || "");
  const field = MAP[kind];
  if (!field) return NextResponse.json({ error: "Unknown counter" }, { status: 400 });
  const date = String(body.date || new Date().toISOString().slice(0, 10));
  const limits = await limitMap();
  const lim = kind === "chat" ? limits.freeChat : kind === "prompts" ? limits.freePrompts : kind === "images" ? limits.freeImages : kind === "whatsapp" ? limits.freeWhatsapp : limits.freeSheet;
  const row = await getRow(me.user.id, date);
  if (me.safe.effectivePlan !== "pro" && (row[field] as number) >= lim) {
    return NextResponse.json({ allowed: false, used: row[field], limit: lim, error: `Daily limit reached (${lim}/day on Free). Upgrade to Pro for unlimited.` });
  }
  const next = { ...row, [field]: (row[field] as number) + 1 };
  await db.update(usageCounters).set({ [field]: next[field] }).where(eq(usageCounters.id, row.id));
  return NextResponse.json({ allowed: true, used: next[field], limit: me.safe.effectivePlan === "pro" ? null : lim, usage: next });
}
