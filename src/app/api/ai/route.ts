import { NextRequest, NextResponse } from "next/server";
import { currentUser, ensureSettings, getAiConfig, bumpGlobalAiUsage } from "@/lib/server";

export const dynamic = "force-dynamic";

const BUSY = "The AI service is busy right now (limit reached). Please try again later.";
const CAP_MSG = "Today's AI limit for the app is reached. Please try tomorrow.";

// Central AI service: ALL AI features run on the owner's single key, held
// server-side only (settings/env). Clients send ONLY messages or a prompt —
// never a key, baseUrl or model. Any such fields in the request are ignored.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "chat");
  await ensureSettings();
  const me = await currentUser();
  const isAdmin = !!me?.safe.isAdmin;
  const cfg = await getAiConfig();

  // The connection test is an owner tool now (it tests the central config).
  if (action === "test") {
    if (!isAdmin) return NextResponse.json({ ok: false, error: "Admin only." }, { status: 403 });
    const c = cfg.chat;
    if (!c.key) return NextResponse.json({ ok: false, error: "No chat API key configured yet. Add it in AI Service." });
    try {
      const res = await fetch(`${c.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.key}` },
        body: JSON.stringify({ model: c.model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 8 }),
        signal: AbortSignal.timeout(30000),
      });
      const text = await res.text();
      if (!res.ok) return NextResponse.json({ ok: false, error: res.status === 429 ? BUSY : `Provider returned HTTP ${res.status}: ${text.slice(0, 300)}` });
      return NextResponse.json({ ok: true, at: new Date().toLocaleString() });
    } catch (e) {
      return NextResponse.json({ ok: false, error: `Could not reach the AI provider: ${e instanceof Error ? e.message : "network error"}` });
    }
  }

  if (action !== "chat" && action !== "image") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const c = action === "image" ? cfg.image : cfg.chat;
  if (!c.key || !c.baseUrl || !c.model) {
    return NextResponse.json({
      error: isAdmin
        ? `AI service is not configured yet. Add the ${action === "image" ? "image" : "chat"} key in AI Service (Admin).`
        : "AI service is being set up by the owner — please check back soon.",
    }, { status: 503 });
  }

  // Global daily cap across ALL users (protects the owner's key). Admin exempt.
  if (!isAdmin && cfg.cap > 0) {
    const used = await bumpGlobalAiUsage();
    if (used > cfg.cap) return NextResponse.json({ error: CAP_MSG }, { status: 429 });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${c.key}` };
  if (c.baseUrl.includes("openrouter")) { headers["HTTP-Referer"] = "https://nova-work-studio.app"; headers["X-Title"] = "Nova Work Studio"; }

  try {
    if (action === "chat") {
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const res = await fetch(`${c.baseUrl}/chat/completions`, {
        method: "POST", headers,
        body: JSON.stringify({ model: c.model, messages }),
        signal: AbortSignal.timeout(90000),
      });
      const text = await res.text();
      if (!res.ok) return NextResponse.json({ error: res.status === 429 ? BUSY : `AI provider error (HTTP ${res.status}): ${text.slice(0, 400)}` }, { status: 502 });
      const json = JSON.parse(text);
      const reply = json?.choices?.[0]?.message?.content ?? "";
      if (!reply) return NextResponse.json({ error: "The AI provider returned an empty reply." }, { status: 502 });
      return NextResponse.json({ reply });
    }

    // action === "image"
    const prompt = String(body.prompt || "");
    if (c.baseUrl.includes("generativelanguage.googleapis.com")) {
      // Gemini native image generation
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${c.model}:generateContent?key=${encodeURIComponent(c.key)}`;
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
        signal: AbortSignal.timeout(120000),
      });
      const text = await res.text();
      if (!res.ok) return NextResponse.json({ error: res.status === 429 ? BUSY : `Image provider error (HTTP ${res.status}): ${text.slice(0, 400)}` }, { status: 502 });
      const json = JSON.parse(text);
      const parts = json?.candidates?.[0]?.content?.parts || [];
      const img = parts.find((p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData);
      if (!img) return NextResponse.json({ error: "The model replied without an image. The central image model may not be image-capable — the owner can change it in AI Service." }, { status: 502 });
      return NextResponse.json({ image: `data:${img.inlineData.mimeType};base64,${img.inlineData.data}` });
    }
    // OpenAI-compatible images endpoint
    const res = await fetch(`${c.baseUrl}/images/generations`, {
      method: "POST", headers,
      body: JSON.stringify({ model: c.model, prompt, n: 1, size: "1024x1024" }),
      signal: AbortSignal.timeout(120000),
    });
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ error: res.status === 429 ? BUSY : `Image provider error (HTTP ${res.status}): ${text.slice(0, 400)}` }, { status: 502 });
    const json = JSON.parse(text);
    const item = json?.data?.[0];
    if (item?.b64_json) return NextResponse.json({ image: `data:image/png;base64,${item.b64_json}` });
    if (item?.url) return NextResponse.json({ image: item.url });
    return NextResponse.json({ error: "Provider returned no image data." }, { status: 502 });
  } catch (e) {
    return NextResponse.json({ error: `Could not reach the AI provider: ${e instanceof Error ? e.message : "network error"}.` }, { status: 502 });
  }
}
