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
  if (c.baseUrl.includes("openrouter")) { headers["HTTP-Referer"] = "https://nova-work-studio.app"; headers["X-Title"] = "Novster Work Studio"; }

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
    const attached = body.image && typeof body.image === "object"
      ? { data: String(body.image.data || ""), mime: String(body.image.mime || "") }
      : null;
    if (attached && (!attached.data || !attached.mime.startsWith("image/") || attached.data.length > 3000000)) {
      return NextResponse.json({ error: "That attached image could not be used — please choose a JPG or PNG photo and try again." }, { status: 400 });
    }
    if (c.baseUrl.includes("generativelanguage.googleapis.com")) {
      // Gemini native image generation (or edit, when an image is attached)
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${c.model}:generateContent?key=${encodeURIComponent(c.key)}`;
      const reqParts = attached
        ? [{ inlineData: { mimeType: attached.mime, data: attached.data } }, { text: prompt }]
        : [{ text: prompt }];
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: reqParts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
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
    if (attached) {
      // Image edit: POST multipart to /images/edits. Not every provider or
      // model supports it — if it is rejected, say so honestly instead of
      // silently falling back to a text-only generation.
      const form = new FormData();
      form.append("image", new Blob([Buffer.from(attached.data, "base64")], { type: attached.mime }), "image.jpg");
      form.append("prompt", prompt);
      form.append("model", c.model);
      form.append("n", "1");
      form.append("size", "1024x1024");
      const editRes = await fetch(`${c.baseUrl}/images/edits`, {
        method: "POST", headers: { Authorization: `Bearer ${c.key}` },
        body: form, signal: AbortSignal.timeout(120000),
      });
      const editText = await editRes.text();
      if (!editRes.ok) {
        return NextResponse.json({ error: editRes.status === 429 ? BUSY : "Image editing is not supported by the current image provider — try text-only generation instead." }, { status: 502 });
      }
      let editJson: { data?: { b64_json?: string; url?: string }[] } = {};
      try { editJson = JSON.parse(editText); } catch { return NextResponse.json({ error: "Provider returned no image data." }, { status: 502 }); }
      const editItem = editJson?.data?.[0];
      if (editItem?.b64_json) return NextResponse.json({ image: `data:image/png;base64,${editItem.b64_json}` });
      if (editItem?.url) return NextResponse.json({ image: editItem.url });
      return NextResponse.json({ error: "Provider returned no image data." }, { status: 502 });
    }
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
