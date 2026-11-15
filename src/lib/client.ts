export type Plan = "guest" | "free" | "pro";
export type SafeUser = { id: number; email: string; plan: string; proUntil: string | null; createdAt: string; effectivePlan: "free" | "pro"; proExpired: boolean; isAdmin: boolean } | null;
export type Settings = Record<string, string>;

export function ls<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export function setLs(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
export function todayKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
export function maskKey(k: string) { if (!k) return "—"; return k.length <= 4 ? "••••" : `••••••••${k.slice(-4)}`; }
export function fmtDate(iso: string | null) { if (!iso) return "—"; return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
export function money(n: number) { return `Rs ${Math.round(n).toLocaleString()}`; }
export function download(name: string, content: string, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
export async function api(path: string, opts?: RequestInit) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

// Cloud-synced per-user collection (server when logged in, local cache always)
export async function loadCollection<T>(name: string, userId: number | null, fallback: T): Promise<T> {
  if (userId) {
    try {
      const { json } = await api(`/api/data/${encodeURIComponent(name)}`);
      if (json.data !== null && json.data !== undefined) { setLs(`nova:${userId}:${name}`, json.data); return json.data as T; }
    } catch {}
  }
  return ls<T>(userId ? `nova:${userId}:${name}` : `nova:guest:${name}`, fallback);
}
export async function saveCollection(name: string, userId: number | null, data: unknown) {
  setLs(userId ? `nova:${userId}:${name}` : `nova:guest:${name}`, data);
  if (userId) { try { await api(`/api/data/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify({ data }) }); } catch {} }
}

export type AIResult = { ok: true; text: string } | { ok: false; error: string };
// Central AI service: the server holds the owner's key. The client sends
// ONLY the messages — never a key, baseUrl or model.
export async function callAI(messages: { role: string; content: string }[]): Promise<AIResult> {
  const { json } = await api("/api/ai", { method: "POST", body: JSON.stringify({ action: "chat", messages }) });
  if (json.reply) return { ok: true, text: json.reply as string };
  return { ok: false, error: String(json.error || "AI call failed.") };
}

export const STARTER_PROMPTS = [
  { name: "App Builder", category: "Build", body: "Build a complete single-file HTML app for: {{idea}}. Audience: {{audience}}. Include clean design, all features working in one file, no placeholders.", vars: ["idea", "audience"] },
  { name: "Website Builder", category: "Build", body: "Create a modern landing page (single HTML file) for {{business}} in {{city}}. Style: {{style}}. Include hero, services, prices, WhatsApp contact button.", vars: ["business", "city", "style"] },
  { name: "Image Prompt", category: "Image", body: "Write a professional image-generation prompt for: {{subject}}. Style: {{style}}, lighting: {{lighting}}, ultra detailed, no text, no watermark.", vars: ["subject", "style", "lighting"] },
  { name: "YouTube / Reel Script (Urdu + English)", category: "Content", body: "Write a 60-second Reel/Shorts script about {{topic}} for {{audience}}. Give English version and Roman Urdu version, with hook in first 3 seconds and a call to action.", vars: ["topic", "audience"] },
  { name: "Excel Sheet Maker", category: "Sheets", body: "Design a spreadsheet for {{purpose}}. List exact column headers, 8 example rows, and the key formulas with explanations.", vars: ["purpose"] },
  { name: "CV Maker", category: "Career", body: "Write a professional CV for {{name}}, applying for {{job}}. Experience: {{experience}}. Skills: {{skills}}. Keep it one page, achievement-based.", vars: ["name", "job", "experience", "skills"] },
  { name: "Business WhatsApp Message", category: "Business", body: "Write a polite WhatsApp broadcast message for {{business}} about {{offer}}. Language: {{language}}. Short, friendly, with a clear call to action and no spammy wording.", vars: ["business", "offer", "language"] },
];
