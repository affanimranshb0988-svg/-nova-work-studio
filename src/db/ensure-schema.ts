import { sql } from "drizzle-orm";
import { db } from "@/db";

// The deployed database is reachable but its tables may not exist yet
// (the build ships no migrations). These CREATE TABLE IF NOT EXISTS
// statements mirror src/db/schema.ts exactly and run lazily, once per
// server process, before the first real query. Safe to run repeatedly.
const DDL = [
  sql`CREATE TABLE IF NOT EXISTS "users" (
    "id" SERIAL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "password_hash" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "pro_until" TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT now()
  )`,
  sql`CREATE TABLE IF NOT EXISTS "sessions" (
    "token" TEXT PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT now()
  )`,
  sql`CREATE TABLE IF NOT EXISTS "app_settings" (
    "key" TEXT PRIMARY KEY,
    "value" TEXT NOT NULL DEFAULT ''
  )`,
  sql`CREATE TABLE IF NOT EXISTS "upgrade_requests" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "user_email" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "sender_number" TEXT NOT NULL DEFAULT '',
    "plan_type" TEXT NOT NULL DEFAULT 'monthly',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP NOT NULL DEFAULT now(),
    "decided_at" TIMESTAMP
  )`,
  sql`CREATE TABLE IF NOT EXISTS "usage_counters" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "chat_count" INTEGER NOT NULL DEFAULT 0,
    "prompt_runs" INTEGER NOT NULL DEFAULT 0,
    "images_count" INTEGER NOT NULL DEFAULT 0,
    "whatsapp_count" INTEGER NOT NULL DEFAULT 0,
    "sheet_count" INTEGER NOT NULL DEFAULT 0
  )`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "usage_user_date" ON "usage_counters" ("user_id", "date")`,
  sql`CREATE TABLE IF NOT EXISTS "user_data" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "collection" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "updated_at" TIMESTAMP NOT NULL DEFAULT now()
  )`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "userdata_user_collection" ON "user_data" ("user_id", "collection")`,
  sql`CREATE TABLE IF NOT EXISTS "license_uses" (
    "key_hash" TEXT PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "product_permalink" TEXT NOT NULL DEFAULT '',
    "activated_at" TIMESTAMP NOT NULL DEFAULT now(),
    "days_granted" INTEGER NOT NULL DEFAULT 30
  )`,
  sql`CREATE TABLE IF NOT EXISTS "ai_usage_daily" (
    "date" TEXT PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 0
  )`,
];

let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const stmt of DDL) await db.execute(stmt);
    })().catch((err) => {
      // Do not cache a failure — the next request retries.
      ready = null;
      throw err;
    });
  }
  return ready;
}
