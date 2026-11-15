import { pgTable, serial, text, timestamp, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  plan: text("plan").notNull().default("free"), // free | pro
  proUntil: timestamp("pro_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
});

export const upgradeRequests = pgTable("upgrade_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  method: text("method").notNull(), // jazzcash | easypaisa | license
  reference: text("reference").notNull(),
  senderNumber: text("sender_number").notNull().default(""),
  planType: text("plan_type").notNull().default("monthly"), // monthly | yearly
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at"),
});

export const usageCounters = pgTable("usage_counters", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD user-local
  chatCount: integer("chat_count").notNull().default(0),
  promptRuns: integer("prompt_runs").notNull().default(0),
  imagesCount: integer("images_count").notNull().default(0),
  whatsappCount: integer("whatsapp_count").notNull().default(0),
  sheetCount: integer("sheet_count").notNull().default(0),
}, (t) => [uniqueIndex("usage_user_date").on(t.userId, t.date)]);

export const userData = pgTable("user_data", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  collection: text("collection").notNull(),
  data: jsonb("data").notNull().default([]),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("userdata_user_collection").on(t.userId, t.collection)]);

export const licenseUses = pgTable("license_uses", {
  keyHash: text("key_hash").primaryKey(),
  userId: integer("user_id").notNull(),
  productPermalink: text("product_permalink").notNull().default(""),
  activatedAt: timestamp("activated_at").defaultNow().notNull(),
  daysGranted: integer("days_granted").notNull().default(30),
});
