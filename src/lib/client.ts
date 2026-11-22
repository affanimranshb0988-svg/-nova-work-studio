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
// Server saves are chained per collection so rapid writes (user message,
// then AI reply) can never land out of order and roll the cloud copy
// backwards to an older snapshot.
// Returns true only when the server accepted the save (HTTP ok + {ok:true}).
// A failed save used to be swallowed silently (catch {}) while the next
// mount reloaded the old server copy — so a deleted chat came back with no
// explanation. Now: one retry, a 20s timeout so a hung request cannot stall
// the queue forever, and a boolean result so the UI can confirm or restore.
const saveQueues = new Map<string, Promise<boolean>>();
export async function saveCollection(name: string, userId: number | null, data: unknown): Promise<boolean> {
  setLs(userId ? `nova:${userId}:${name}` : `nova:guest:${name}`, data);
  if (!userId) return true;
  const key = `${userId}:${name}`;
  const prev = saveQueues.get(key) ?? Promise.resolve(true);
  const next = prev.then(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      try {
        const { res, json } = await api(`/api/data/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify({ data }), signal: ctrl.signal });
        if (res.ok && json && json.ok) return true;
      } catch {}
      finally { clearTimeout(timer); }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 700));
    }
    return false;
  });
  saveQueues.set(key, next);
  return next;
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
  { name: "App Builder", category: "Build", v: 2, body: `You are an expert no-code web app developer. Build a complete single-file HTML app for this idea: {{idea}}. Target audience: {{audience}} (assume a Pakistani small-business user with a basic phone or laptop and limited English).
Follow these steps:
1. Plan the app in 3-5 core features that solve the user's main problem — no extra features.
2. Build everything in ONE single HTML file: embedded CSS in <style> and JavaScript in <script>, no external files.
3. Design: clean, modern, mobile-first layout; big readable buttons; Urdu + English labels where helpful.
4. Every button and feature must actually work with real JavaScript — no fake buttons, no "coming soon", no placeholder text like "lorem ipsum".
5. Data must save in the browser (localStorage) so the user's work is not lost on refresh.
Output: the complete HTML file only, ready to open in a browser. At the end, add a short 5-line note in simple English explaining how to use the app.`, vars: ["idea", "audience"] },
  { name: "Website Builder", category: "Build", v: 2, body: `You are a professional web designer who builds landing pages for Pakistani small businesses. Create a modern, mobile-first landing page as a single HTML file for: {{business}}, based in {{city}}. Style: {{style}}.
Follow these steps:
1. Hero section: business name, one clear headline in simple words, one short line about what the business does, and a WhatsApp contact button.
2. Services section: 4-6 services with a one-line benefit for each.
3. Prices section: a simple price list (use "Contact for price" where the price is not given).
4. Trust section: why customers should choose this business (experience, quality, honest prices).
5. Contact section: WhatsApp button, phone number placeholder, city name, and opening hours.
Design rules: clean layout, fast-loading, big readable text, works perfectly on a mobile phone, all buttons working, no placeholder images (use simple colours and icons). Output: the complete single HTML file only, plus a 3-line note on how to change the phone number and prices.`, vars: ["business", "city", "style"] },
  { name: "Image Prompt", category: "Image", v: 2, body: `You are an expert AI image prompt writer. Write a professional image-generation prompt for this subject: {{subject}}. Style: {{style}}. Lighting: {{lighting}}.
Rules for the prompt:
1. Describe the subject in vivid detail: what it is, its colours, materials, and setting.
2. Add composition: camera angle, framing, and what is in the foreground and background.
3. Add mood and atmosphere in one line.
4. Add quality words: ultra detailed, sharp focus, realistic, high resolution.
5. End with: "no text, no watermark, no logo".
Output format: give ONE final ready-to-copy prompt in a single paragraph, then a short 3-item list of quick variations (different angle, different background, different mood).`, vars: ["subject", "style", "lighting"] },
  { name: "YouTube / Reel Script (Urdu + English)", category: "Content", v: 2, body: `You are a professional short-video scriptwriter for Pakistani YouTube Shorts and Instagram Reels. Write a 60-second Reel/Shorts script about: {{topic}}. Audience: {{audience}}.
Follow these steps:
1. HOOK (first 3 seconds): one surprising line that makes the viewer stop scrolling.
2. MAIN PART (about 40 seconds): explain the topic in 3 short, simple points — one idea per point, everyday examples, no difficult words.
3. ENDING (last 10 seconds): one practical takeaway the viewer can use today, plus a call to action (like, follow, comment).
Output: give the FULL script TWICE — first the complete English version, then the complete Roman Urdu version (Urdu written in English letters). Each version must have the hook, the 3 points, and the call to action clearly marked with timings (0-3s, 3-45s, 45-60s). Keep every sentence short and natural, like spoken words, not written essay style.`, vars: ["topic", "audience"] },
  { name: "Excel Sheet Maker", category: "Sheets", v: 2, body: `You are an Excel expert who builds practical spreadsheets for Pakistani small businesses. Design a complete spreadsheet for this purpose: {{purpose}}.
Follow these steps:
1. List the exact column headers — every column must have a clear purpose, no extra columns.
2. Add 8 realistic example rows using Pakistani context (rupees, local names, local items where relevant).
3. Add the key formulas for totals, averages, and any due/balance calculations — write each formula exactly as it goes in the cell, with a one-line plain-English explanation of what it does.
4. Add one practical tip: how to sort, filter, or check the sheet daily.
Output format: first the column headers as a list, then the 8 example rows as a table, then the formulas with explanations, then the daily-use tip. Keep all money in PKR (Rs).`, vars: ["purpose"] },
  { name: "CV Maker", category: "Career", v: 2, body: `You are a professional CV writer who helps Pakistani job seekers get interviews. Write a professional one-page CV for: {{name}}, applying for the job of {{job}}. Experience: {{experience}}. Skills: {{skills}}.
Follow these steps:
1. Header: full name, phone, email, and city — clean and easy to read.
2. Professional summary: 2-3 lines showing what the person can do for the employer, not just what they want.
3. Experience: list each job with dates, employer, and 2-3 bullet points starting with strong action words, showing RESULTS (numbers, amounts, improvements) wherever possible.
4. Skills: only skills relevant to this job, grouped neatly.
5. Education: brief, newest first.
Quality rules: one page only, honest wording (never invent experience), achievement-based (show what was delivered, not just duties), simple professional formatting, no photo, no fancy fonts. Output: the complete CV, ready to copy into Word.`, vars: ["name", "job", "experience", "skills"] },
  { name: "Business WhatsApp Message", category: "Business", v: 2, body: `You are a marketing writer for Pakistani small businesses. Write a polite WhatsApp broadcast message for: {{business}} about this offer: {{offer}}. Language: {{language}}.
Follow these steps:
1. Start with a warm greeting and the business name in the first line.
2. Explain the offer in 2-3 short lines: what the customer gets, the price or discount, and until when it is valid.
3. Add ONE clear call to action (reply to order, visit the shop, or tap the link) — not three different actions.
4. Keep the tone friendly and respectful, like a trusted local shopkeeper, never pushy.
Quality rules: short enough to read in 10 seconds, no spammy words (no "FREE FREE FREE", no "hurry hurry"), no ALL CAPS shouting, no fake urgency, and at most one relevant emoji per line. Output: the final message only, ready to copy-paste into WhatsApp.`, vars: ["business", "offer", "language"] },
];
