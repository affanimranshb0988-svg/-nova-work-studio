"use client";
import { useEffect, useRef, useState } from "react";
import { callAI, ls, setLs, loadCollection, saveCollection, download, toCSV, STARTER_PROMPTS } from "@/lib/client";
import type { Ctx } from "./NovaApp";

function Head({ title, sub }: { title: string; sub: string }) {
  return <div className="mb-5"><h1 className="text-2xl font-extrabold text-white sm:text-3xl">{title}</h1><p className="mt-1 text-sm text-violet-200/70">{sub}</p></div>;
}
export function NoKeyNotice({ ctx }: { ctx: Ctx }) {
  // Central AI: users never need a key. This notice appears only while the
  // owner has not configured the central AI service yet.
  if (ctx.settings.ai_configured) return null;
  if (ctx.user?.isAdmin) return <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">⚠️ The central AI service is not configured yet — add your AI key in <button className="font-bold underline" onClick={() => ctx.goto("api")}>AI Service</button> so every user can chat. Until then, nobody gets AI replies.</div>;
  return <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">⚠️ AI service is being set up by the owner — please check back soon. Nova never invents answers.</div>;
}
export function LockScreen({ ctx, title, desc, free }: { ctx: Ctx; title: string; desc: string; free?: string }) {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <div className="text-5xl">🔒</div>
      <h2 className="mt-3 text-xl font-extrabold text-white">{title} is a Pro tool</h2>
      <p className="mt-2 text-sm leading-relaxed text-violet-200/75">{desc}</p>
      {free && <p className="mt-2 text-xs text-violet-300/70">{free}</p>}
      {!ctx.user
        ? <button className="btn-primary mt-5 w-full" onClick={() => window.location.reload()}>Sign up / Log in to unlock</button>
        : <button className="btn-primary mt-5 w-full" onClick={() => ctx.goto("pricing")}>Upgrade to Pro</button>}
      <button className="mt-3 text-sm text-violet-300 underline" onClick={() => ctx.goto("tools")}>← Back to Tools</button>
    </div>
  );
}

/* ---------------- CHAT BOT ---------------- */
type Msg = { role: string; content: string };
type Chat = { id: string; title: string; msgs: Msg[]; updatedAt: number };
const newChatId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const autoTitle = (list: Msg[]) => { const f = list.find((m) => m.role === "user"); return f ? (f.content.length > 42 ? f.content.slice(0, 42) + "…" : f.content) : "New chat"; };
const isUrduText = (t: string) => { const u = (t.match(/[؀-ۿ]/g) || []).length; const total = t.replace(/\s/g, "").length || 1; return u / total >= 0.3; };
export function ChatSection({ ctx }: { ctx: Ctx }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showChats, setShowChats] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [memory, setMemory] = useState<string[]>([]);
  const [memInput, setMemInput] = useState("");
  const [showMem, setShowMem] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const uid = ctx.user?.id ?? null;
  const active = chats.find((c) => c.id === activeId) || null;
  const msgs = active?.msgs ?? [];

  useEffect(() => {
    loadCollection<string[]>("memory", uid, []).then(setMemory);
    loadCollection<Chat[]>("chats-v2", uid, []).then(async (saved) => {
      if (saved && saved.length) { setChats(saved); setActiveId(saved[0].id); return; }
      // Migrate the old single conversation (pre-v6) into the first chat — nothing is lost.
      const legacy = await loadCollection<Msg[]>("chat-history", uid, []);
      if (legacy && legacy.length) {
        const c: Chat = { id: newChatId(), title: autoTitle(legacy), msgs: legacy, updatedAt: Date.now() };
        setChats([c]); setActiveId(c.id); saveCollection("chats-v2", uid, [c]);
      }
    });
  }, [uid]); // eslint-disable-line
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const blocked = !ctx.isPro && ctx.plan === "guest" && ctx.guestChat >= Number(ctx.settings.limit_guest_chat || 5);
  const freeBlocked = !ctx.isPro && !!ctx.user && (ctx.usage.chat ?? 0) >= Number(ctx.settings.limit_free_chat || 20);

  const persistChats = (next: Chat[]) => { setChats(next); saveCollection("chats-v2", uid, next); };
  const writeMsgs = (targetId: string, next: Msg[]) => {
    const base = chats.some((c) => c.id === targetId) ? chats : [{ id: targetId, title: "New chat", msgs: [] as Msg[], updatedAt: Date.now() }, ...chats];
    persistChats(base.map((c) => c.id === targetId ? { ...c, msgs: next, title: c.title === "New chat" ? autoTitle(next) : c.title, updatedAt: Date.now() } : c));
  };
  const startNewChat = () => { const c: Chat = { id: newChatId(), title: "New chat", msgs: [], updatedAt: Date.now() }; persistChats([c, ...chats]); setActiveId(c.id); setShowChats(false); };
  const deleteChat = (id: string) => { if (typeof window !== "undefined" && !window.confirm("Delete this chat? This cannot be undone.")) return; const n = chats.filter((c) => c.id !== id); persistChats(n); if (activeId === id) setActiveId(n[0]?.id ?? null); };
  const renameChat = (id: string) => { const c = chats.find((x) => x.id === id); if (!c) return; const name = typeof window !== "undefined" ? window.prompt("Chat name:", c.title) : null; if (!name || !name.trim()) return; persistChats(chats.map((x) => x.id === id ? { ...x, title: name.trim().slice(0, 60) } : x)); };
  const visibleChats = chats.filter((c) => !query.trim() || c.title.toLowerCase().includes(query.trim().toLowerCase()));

  const send = async (text?: string) => {
    const content = (text ?? input).trim(); if (!content || busy) return;
    const chk = await ctx.bumpUsage("chat");
    if (!chk.allowed) { ctx.toast(chk.error || "Daily chat limit reached."); return; }
    const targetId = active ? active.id : newChatId();
    if (!active) setActiveId(targetId);
    const next = [...(active ? active.msgs : []), { role: "user", content }]; writeMsgs(targetId, next); setInput(""); setBusy(true);
    const sys = memory.length ? `Remember these facts about the user:\n${memory.map((m) => `- ${m}`).join("\n")}` : "";
    const res = await callAI([...(sys ? [{ role: "system", content: sys }] : []), ...next.slice(-14)]);
    setBusy(false);
    const done = res.ok ? [...next, { role: "assistant", content: res.text }] : [...next, { role: "assistant", content: `⚠️ ${res.error}` }];
    writeMsgs(targetId, done);
  };

  const delMsg = (idx: number) => { if (!active) return; writeMsgs(active.id, msgs.filter((_, x) => x !== idx)); };
  const clearChat = () => { if (!active) return; if (typeof window !== "undefined" && !window.confirm("Delete all messages in this chat? This cannot be undone.")) return; writeMsgs(active.id, []); ctx.toast("Chat cleared."); };

  const act = (m: Msg, a: string, idx?: number) => {
    if (a === "del" && typeof idx === "number") { delMsg(idx); return; }
    if (a === "copy") { navigator.clipboard?.writeText(m.content); ctx.toast("Copied."); }
    if (a === "read") { const u = new SpeechSynthesisUtterance(m.content); speechSynthesis.speak(u); }
    if (a === "regen") { const lastUser = [...msgs].reverse().find((x) => x.role === "user"); if (lastUser) send(lastUser.content); }
    if (a === "prompt") { const name = promptName(); if (name) { const all = ls<{ name: string; body: string; category: string; vars: string[]; starred?: boolean }[]>("nova:prompts", []); setLs("nova:prompts", [{ name, body: m.content, category: "Saved", vars: [] }, ...all]); ctx.toast("Saved as a Prompt."); } }
    if (a === "create") ctx.goto("create", m.content);
    if (a === "image") ctx.goto("image", m.content.slice(0, 400));
  };
  const promptName = () => (typeof window !== "undefined" ? window.prompt("Name this prompt:") : null);

  return (
    <div>
      <Head title="💬 Chat Bot" sub={ctx.isPro ? "Unlimited chat." : ctx.user ? `Free: ${ctx.usage.chat ?? 0}/${ctx.settings.limit_free_chat || 20} messages today.` : `Guest: ${ctx.guestChat}/${ctx.settings.limit_guest_chat || 5} messages.`} />
      <NoKeyNotice ctx={ctx} />
      <div className="card mb-4 p-3">
        <div className="flex items-center gap-2">
          <button className="btn-primary px-4 py-2 text-sm" onClick={startNewChat}>+ New Chat</button>
          <input className="inp flex-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats…" />
          <button className="btn-ghost whitespace-nowrap" onClick={() => setShowChats(!showChats)}>💬 Chats ({chats.length}) {showChats ? "▾" : "▸"}</button>
        </div>
        {showChats && (
          <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
            {visibleChats.length === 0 && <p className="py-3 text-center text-sm text-violet-200/60">No chats yet — start a New Chat.</p>}
            {visibleChats.map((c) => (
              <div key={c.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${c.id === activeId ? "bg-violet-500/25" : "bg-white/[0.04]"}`}>
                <button className="flex-1 truncate text-left text-sm text-violet-50" onClick={() => { setActiveId(c.id); setShowChats(false); }}>
                  {c.title} <span className="ml-1 text-[11px] text-violet-300/60">{new Date(c.updatedAt).toLocaleDateString()}</span>
                </button>
                <button className="text-violet-200" title="Rename" onClick={() => renameChat(c.id)}>✎</button>
                <button className="text-red-300" title="Delete chat" onClick={() => deleteChat(c.id)}>🗑</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card flex min-h-[55vh] flex-col p-4">
        {msgs.length > 0 && (
          <div className="mb-2 flex justify-end">
            <button onClick={clearChat} className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] text-violet-200 hover:bg-red-500/25">🗑 Clear chat</button>
          </div>
        )}
        <div className="flex-1 space-y-3 overflow-y-auto">
          {msgs.length === 0 && <div className="py-10 text-center text-sm text-violet-200/60">No messages yet — ask anything. Replies come from Nova&apos;s built-in AI service — no key needed.</div>}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div dir={isUrduText(m.content) ? "rtl" : undefined} className={`inline-block max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[80%] ${isUrduText(m.content) ? "text-right" : "text-left"} ${m.role === "user" ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-50"}`}>{m.content}</div>
              {m.role === "user" && (
                <div className="mt-1.5 flex justify-end">
                  <button onClick={() => delMsg(i)} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-violet-200 hover:bg-red-500/25">🗑 Delete</button>
                </div>
              )}
              {m.role === "assistant" && !m.content.startsWith("⚠️") && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[["copy", "📋 Copy"], ["read", "🔊 Read aloud"], ["regen", "🔄 Regenerate"], ["prompt", "⚡ Save as Prompt"], ["create", "🛠️ Open in Create"], ["image", "🎨 Generate Image"], ["del", "🗑 Delete"]].map(([a, l]) => (
                    <button key={a} onClick={() => act(m, a, i)} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-violet-200 hover:bg-violet-500/25">{l}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && <p className="text-sm text-violet-300">Nova is thinking with your AI key…</p>}
          <div ref={bottomRef} />
        </div>
        {(blocked || freeBlocked) ? (
          <div className="mt-4 rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4 text-center text-sm text-violet-100">
            {blocked ? <>Guest limit reached. <button className="font-bold underline" onClick={() => window.location.reload()}>Create a free account</button> to keep chatting.</> : <>Today&apos;s Free limit ({ctx.settings.limit_free_chat || 20}) is reached. <button className="font-bold underline" onClick={() => ctx.goto("pricing")}>Upgrade to Pro</button> for unlimited chat.</>}
          </div>
        ) : (
          <div className="mt-4 flex gap-2">
            <input className="inp flex-1" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type your message…" />
            <button className="btn-primary px-5" onClick={() => send()}>Send</button>
          </div>
        )}
      </div>
      <div className="card mt-4 p-4">
        <button className="text-sm font-bold text-white" onClick={() => setShowMem(!showMem)}>🧠 Memory {showMem ? "▾" : "▸"} <span className="font-normal text-violet-300/70">({memory.length} facts the AI remembers)</span></button>
        {showMem && <div className="mt-3">
          {memory.map((m, i) => <div key={i} className="flex items-center gap-2 py-1 text-sm text-violet-100"><span className="flex-1">• {m}</span><button className="text-red-300" onClick={() => { const n = memory.filter((_, x) => x !== i); setMemory(n); saveCollection("memory", uid, n); }}>✕</button></div>)}
          <div className="mt-2 flex gap-2"><input className="inp flex-1" value={memInput} onChange={(e) => setMemInput(e.target.value)} placeholder="e.g. My shop is in Lahore, I sell mobile accessories" /><button className="btn-ghost" onClick={() => {
            const v = memInput.trim(); if (!v) return;
            if (/key|password|card|cvc|pin/i.test(v)) { ctx.toast("⚠️ Never store passwords or API keys in Memory — not saved."); return; }
            const n = [...memory, v]; setMemory(n); saveCollection("memory", uid, n); setMemInput("");
          }}>Save fact</button></div>
          <p className="mt-2 text-[11px] text-violet-300/50">Never store passwords or API keys here.</p>
        </div>}
      </div>
    </div>
  );
}

/* ---------------- PROMPTS ---------------- */
type PromptItem = { name: string; body: string; category: string; vars: string[]; starred?: boolean };
export function PromptsSection({ ctx }: { ctx: Ctx }) {
  const [items, setItems] = useState<PromptItem[]>([]);
  const [fillFor, setFillFor] = useState<PromptItem | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [editor, setEditor] = useState<PromptItem | null>(null);
  const uid = ctx.user?.id ?? null;

  useEffect(() => {
    loadCollection<PromptItem[]>("prompts", uid, []).then((saved) => {
      const base = saved.length ? saved : STARTER_PROMPTS.map((s) => ({ ...s, starred: false }));
      setItems(base); if (!saved.length) saveCollection("prompts", uid, base);
    });
  }, [uid]); // eslint-disable-line
  const persist = (n: PromptItem[]) => { setItems(n); saveCollection("prompts", uid, n); };
  const filled = (p: PromptItem) => { let out = p.body; Object.entries(values).forEach(([k, v]) => { out = out.replaceAll(`{{${k}}}`, v || `{{${k}}}`); }); return out; };
  const guestsViewOnly = !ctx.user;

  const runTarget = async (p: PromptItem, target: "chat" | "create" | "image") => {
    const text = filled(p); setFillFor(null);
    if (target === "create") return ctx.goto("create", text);
    if (target === "image") return ctx.goto("image", text);
    const chk = await ctx.bumpUsage("prompts");
    if (!chk.allowed) { ctx.toast(chk.error || "Daily prompt limit reached."); return; }
    ctx.goto("chat", text); ctx.toast("Prompt sent to Chat Bot — press Send there, or it is in the input via Create flow.");
    setLs("nova:pendingChat", text);
  };

  return (
    <div>
      <Head title="⚡ Prompts" sub={guestsViewOnly ? "Guests can view only — sign up to run prompts." : ctx.isPro ? "Unlimited runs." : `Free: ${ctx.usage.prompts ?? 0}/${ctx.settings.limit_free_prompts || 5} runs today.`} />
      <div className="mb-4 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => setEditor({ name: "", body: "", category: "Custom", vars: [] })}>+ New Prompt</button>
        <button className="btn-ghost" onClick={() => download("nova-prompts.json", JSON.stringify(items, null, 2), "application/json")}>Export JSON</button>
        <label className="btn-ghost cursor-pointer">Import JSON<input type="file" accept=".json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const arr = JSON.parse(await f.text()); if (Array.isArray(arr)) { persist([...items, ...arr]); ctx.toast("Imported."); } } catch { ctx.toast("That file is not valid prompts JSON."); } }} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((p, i) => (
          <div key={i} className="card p-4">
            <div className="flex items-start gap-2"><p className="flex-1 font-bold text-white">{p.name}</p>
              <button onClick={() => { const n = [...items]; n[i] = { ...p, starred: !p.starred }; persist(n); }}>{p.starred ? "⭐" : "☆"}</button></div>
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-violet-200/70">{p.body}</p>
            <p className="mt-2 text-[11px] text-violet-300/60">{p.category} · variables: {p.vars.length ? p.vars.map((v) => `{{${v}}}`).join(", ") : "none"}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button disabled={guestsViewOnly} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40" onClick={() => { setValues({}); setFillFor(p); }}>Run…</button>
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEditor({ ...p })}>Edit</button>
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => persist([{ ...p, name: `${p.name} (copy)` }, ...items])}>Duplicate</button>
              <button className="btn-ghost px-3 py-1.5 text-xs text-red-300" onClick={() => persist(items.filter((_, x) => x !== i))}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {fillFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setFillFor(null)}>
          <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-extrabold text-white">Run: {fillFor.name}</h3>
            <p className="mt-1 text-xs text-violet-200/70">Fill the variables first — the prompt runs only after this step.</p>
            {fillFor.vars.map((v) => <div key={v} className="mt-3"><label className="lbl">{`{{${v}}}`}</label><input className="inp" value={values[v] || ""} onChange={(e) => setValues({ ...values, [v]: e.target.value })} /></div>)}
            {fillFor.vars.length === 0 && <p className="mt-3 text-sm text-violet-200/70">This prompt has no variables.</p>}
            <div className="mt-4 rounded-xl bg-black/30 p-3 text-xs whitespace-pre-wrap text-violet-100">{filled(fillFor)}</div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button className="btn-primary py-2 text-sm" onClick={() => runTarget(fillFor, "chat")}>Run in Chat Bot</button>
              <button className="btn-ghost py-2 text-sm" onClick={() => runTarget(fillFor, "create")}>Run in Create</button>
              <button className="btn-ghost py-2 text-sm" onClick={() => runTarget(fillFor, "image")}>Run in Image</button>
            </div>
          </div>
        </div>
      )}

      {editor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setEditor(null)}>
          <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-extrabold text-white">{editor.name ? "Edit Prompt" : "New Prompt"}</h3>
            <label className="lbl mt-3">Name</label><input className="inp" value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} />
            <label className="lbl mt-3">Category</label><input className="inp" value={editor.category} onChange={(e) => setEditor({ ...editor, category: e.target.value })} />
            <label className="lbl mt-3">Prompt body — use {"{{variables}}"}</label><textarea className="inp min-h-28" value={editor.body} onChange={(e) => { const vars = [...new Set([...e.target.value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))]; setEditor({ ...editor, body: e.target.value, vars }); }} />
            <p className="mt-1 text-[11px] text-violet-300/60">Detected variables: {editor.vars.join(", ") || "none"}</p>
            <div className="mt-4 flex gap-2"><button className="btn-primary flex-1" onClick={() => { if (!editor.name.trim() || !editor.body.trim()) { ctx.toast("Name and body are required."); return; } const idx = items.findIndex((x) => x.name === editor.name); if (idx >= 0) { const n = [...items]; n[idx] = editor; persist(n); } else persist([editor, ...items]); setEditor(null); }}>Save Prompt</button><button className="btn-ghost" onClick={() => setEditor(null)}>Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- CREATE ---------------- */
type Project = { id: string; name: string; kind: string; prompt: string; content: string; versions: string[]; updatedAt: string };
export function CreateSection({ ctx }: { ctx: Ctx }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [promptText, setPromptText] = useState(ctx.carryPrompt || "");
  const [kind, setKind] = useState("website");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<Project | null>(null);
  const uid = ctx.user?.id ?? null;
  useEffect(() => { loadCollection<Project[]>("projects", uid, []).then(setProjects); if (ctx.carryPrompt) { setPromptText(ctx.carryPrompt); ctx.setCarryPrompt(""); } }, [uid]); // eslint-disable-line
  const persist = (n: Project[]) => { setProjects(n); saveCollection("projects", uid, n); };

  const generate = async () => {
    if (!ctx.user) { ctx.toast("Create is locked for guests — sign up free."); return; }
    if (!ctx.isPro && !current && projects.length >= Number(ctx.settings.limit_free_projects || 2)) { ctx.toast(`Free plan allows ${ctx.settings.limit_free_projects || 2} projects. Upgrade to Pro for unlimited.`); ctx.goto("pricing"); return; }
    if (!promptText.trim()) { ctx.toast("Describe what to create first."); return; }
    setBusy(true);
    const instr = kind === "website"
      ? "Return ONLY one complete single-file HTML document (with inline CSS/JS) for this request. No markdown fences, no explanation:\n"
      : kind === "document" ? "Write a complete, ready-to-use document for this request:\n" : "Return ONLY CSV data (header row + rows) for this request. No explanation:\n";
    const res = await callAI([{ role: "user", content: instr + promptText }]);
    setBusy(false);
    if (!res.ok) { ctx.toast(res.error); return; }
    const content = res.text.replace(/^```(?:html|csv)?\n?/, "").replace(/```$/, "");
    const proj: Project = current
      ? { ...current, content, versions: [current.content, ...current.versions].slice(0, 5), updatedAt: new Date().toISOString() }
      : { id: Date.now().toString(), name: promptText.slice(0, 42) || "Untitled", kind, prompt: promptText, content, versions: [], updatedAt: new Date().toISOString() };
    setCurrent(proj);
    persist(current ? projects.map((p) => (p.id === proj.id ? proj : p)) : [proj, ...projects]);
    ctx.toast("Generated with your AI key and saved.");
  };

  const zipProject = async (p: Project) => {
    const { default: JSZip } = await import("jszip").catch(() => ({ default: null as never }));
    if (!JSZip) { ctx.toast("ZIP library unavailable — use Download instead."); return; }
    const zip = new JSZip();
    zip.file(p.kind === "website" ? "index.html" : p.kind === "sheet" ? "sheet.csv" : "document.txt", p.content);
    zip.file("README.md", `# ${p.name}\n\nCreated with Novster Work Studio 2.0.\nPrompt: ${p.prompt}\n`);
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${p.name.replace(/\W+/g, "-")}.zip`; a.click();
  };

  if (!ctx.user) return <div><Head title="🛠️ Create" sub="Generate websites, documents and sheets — saved per account." /><div className="card p-8 text-center"><p className="text-4xl">🔒</p><p className="mt-2 font-bold text-white">Create is locked for guests</p><p className="mt-1 text-sm text-violet-200/70">Sign up free to create up to {ctx.settings.limit_free_projects || 2} projects.</p><button className="btn-primary mt-4" onClick={() => window.location.reload()}>Sign up / Log in</button></div></div>;

  return (
    <div>
      <Head title="🛠️ Create" sub={ctx.isPro ? "Unlimited projects." : `Free: ${projects.length}/${ctx.settings.limit_free_projects || 2} projects.`} />
      <NoKeyNotice ctx={ctx} />
      <div className="card p-4">
        <div className="flex flex-wrap gap-2">{[["website", "🌐 Website / App"], ["document", "📄 Document"], ["sheet", "📊 CSV Sheet"]].map(([k, l]) => <button key={k} onClick={() => setKind(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${kind === k ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-200"}`}>{l}</button>)}</div>
        <textarea className="inp mt-3 min-h-24" value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="Describe what to build — e.g. a booking page for my barber shop in Karachi with prices and WhatsApp button" />
        <button disabled={busy} className="btn-primary mt-3" onClick={generate}>{busy ? "Generating with your AI key…" : current ? "Regenerate (new version)" : "Generate"}</button>
        {current && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2"><p className="flex-1 font-bold text-white">{current.name}</p>
              <button className="btn-ghost text-xs" onClick={() => download(current.kind === "website" ? "index.html" : current.kind === "sheet" ? "sheet.csv" : "document.txt", current.content)}>Download</button>
              <button className="btn-ghost text-xs" onClick={() => zipProject(current)}>Download .zip</button>
              <button className="btn-ghost text-xs" onClick={() => { setLs("nova:deployProject", current); ctx.goto("deploy"); }}>Go to Deploy →</button>
            </div>
            {current.kind === "website"
              ? <iframe title="preview" className="mt-3 h-[480px] w-full rounded-xl bg-white" sandbox="allow-scripts" srcDoc={current.content} />
              : <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 text-xs text-violet-100">{current.content}</pre>}
            {current.versions.length > 0 && <p className="mt-2 text-[11px] text-violet-300/60">{current.versions.length} older version(s) kept. <button className="underline" onClick={() => { const v = current.versions[0]; const n = { ...current, content: v, versions: current.versions.slice(1) }; setCurrent(n); persist(projects.map((p) => p.id === n.id ? n : p)); }}>Restore latest older version</button></p>}
          </div>
        )}
      </div>
      <h3 className="mb-2 mt-6 font-bold text-white">My Projects</h3>
      {projects.length === 0 && <p className="text-sm text-violet-200/60">No projects yet — generate your first one above.</p>}
      <div className="grid gap-3 sm:grid-cols-2">{projects.map((p) => (
        <div key={p.id} className="card p-4"><p className="font-bold text-white">{p.name}</p><p className="text-xs text-violet-300/70">{p.kind} · {new Date(p.updatedAt).toLocaleString()}</p>
          <div className="mt-3 flex gap-1.5"><button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => { setCurrent(p); setKind(p.kind); setPromptText(p.prompt); }}>Open</button>
          <button className="btn-ghost px-3 py-1.5 text-xs text-red-300" onClick={() => persist(projects.filter((x) => x.id !== p.id))}>Delete</button></div></div>
      ))}</div>
    </div>
  );
}

/* ---------------- IMAGE GENERATE ---------------- */
export function ImageSection({ ctx }: { ctx: Ctx }) {
  const [promptText, setPromptText] = useState(ctx.carryPrompt || "");
  const [busy, setBusy] = useState(false);
  const [img, setImg] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<{ prompt: string; image: string }[]>([]);
  const uid = ctx.user?.id ?? null;
  useEffect(() => { if (ctx.carryPrompt) { setPromptText(ctx.carryPrompt); ctx.setCarryPrompt(""); } loadCollection<{ prompt: string; image: string }[]>("image-history-meta", uid, []).then(setHistory); }, [uid]); // eslint-disable-line

  const generate = async () => {
    if (!ctx.user) { ctx.toast("Image Generate is locked for guests — sign up free."); return; }
    if (!promptText.trim()) { setError("Describe the image first."); return; }
    const chk = await ctx.bumpUsage("images");
    if (!chk.allowed) { setError(chk.error || "Daily image limit reached."); return; }
    setBusy(true); setError(""); setImg("");
    const { api } = await import("@/lib/client");
    const { json } = await api("/api/ai", { method: "POST", body: JSON.stringify({ action: "image", prompt: promptText }) });
    setBusy(false);
    if (json.image) { setImg(json.image); const h = [{ prompt: promptText, image: json.image }, ...history].slice(0, 6); setHistory(h); saveCollection("image-history-meta", uid, h); }
    else setError(String(json.error || "Image generation failed."));
  };

  if (!ctx.user) return <div><Head title="🎨 Image Generate" sub="Real images from Nova's built-in image service." /><div className="card p-8 text-center"><p className="text-4xl">🔒</p><p className="mt-2 font-bold text-white">Locked for guests</p><button className="btn-primary mt-4" onClick={() => window.location.reload()}>Sign up / Log in</button></div></div>;

  return (
    <div>
      <Head title="🎨 Image Generate" sub={ctx.isPro ? "Unlimited (subject to your provider quota)." : `Free: ${ctx.usage.images ?? 0}/${ctx.settings.limit_free_images || 3} images today.`} />
      {!ctx.settings.ai_image_configured && <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{ctx.user?.isAdmin ? <>The central image service is not configured yet — add the Gemini image key in <button className="font-bold underline" onClick={() => ctx.goto("api")}>AI Service</button>. Nothing will be faked here.</> : <>The image service is being set up by the owner — please check back soon. Nothing will be faked here.</>}</div>}
      <div className="card p-4">
        <textarea className="inp min-h-20" value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="Describe the image — e.g. a bright mobile shop banner, Pakistani market, morning light" />
        <button disabled={busy} className="btn-primary mt-3" onClick={generate}>{busy ? "Generating real image…" : "Generate Image"}</button>
        {error && <p className="mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p>}
        {img && <div className="mt-4"><img src={img} alt="AI generated" className="w-full rounded-2xl" /><a className="btn-ghost mt-3 inline-block text-sm" href={img} download="nova-image.png">Download image</a></div>}
      </div>
      {history.length > 0 && <><h3 className="mb-2 mt-6 font-bold text-white">Recent (this account)</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{history.map((h, i) => <img key={i} src={h.image} alt={h.prompt} title={h.prompt} className="aspect-square w-full rounded-xl object-cover" />)}</div></>}
    </div>
  );
}

/* ---------------- DATABASE ---------------- */
type Row = Record<string, string>;
type Table = { id: string; name: string; columns: string[]; rows: Row[] };
export function DatabaseSection({ ctx }: { ctx: Ctx }) {
  const [tables, setTables] = useState<Table[]>([]);
  const [desc, setDesc] = useState("");
  const [sel, setSel] = useState<Table | null>(null);
  const [cloudOk, setCloudOk] = useState<boolean | null>(null);
  const uid = ctx.user?.id ?? null;
  useEffect(() => { loadCollection<Table[]>("mytables", uid, []).then(setTables); fetch("/api/health").then((r) => setCloudOk(r.ok)).catch(() => setCloudOk(false)); }, [uid]); // eslint-disable-line
  const persist = (n: Table[]) => { setTables(n); saveCollection("mytables", uid, n); if (sel) setSel(n.find((t) => t.id === sel.id) || null); };

  const createFromWords = () => {
    if (!ctx.user) { ctx.toast("Database is locked for guests."); return; }
    if (!ctx.isPro && tables.length >= Number(ctx.settings.limit_free_databases || 1)) { ctx.toast("Free plan: 1 database. Upgrade to Pro for unlimited."); ctx.goto("pricing"); return; }
    // plain-words parse: "a table for customers with name, phone, balance"
    const m = desc.toLowerCase().match(/for\s+(\w+).*?with\s+(.+)/);
    const name = m ? m[1] : (desc.trim().split(/\s+/)[0] || "mytable");
    const cols = m ? m[2].split(/[,\s]+/).filter(Boolean) : ["name", "value"];
    persist([{ id: Date.now().toString(), name, columns: cols, rows: [] }, ...tables]); setDesc("");
    ctx.toast(`Table “${name}” created with columns: ${cols.join(", ")}`);
  };

  if (!ctx.user) return <div><Head title="🗄️ Database" sub="App Cloud status + your own data tables." /><div className="card p-8 text-center"><p className="text-4xl">🔒</p><p className="mt-2 font-bold text-white">Locked for guests</p><button className="btn-primary mt-4" onClick={() => window.location.reload()}>Sign up / Log in</button></div></div>;

  return (
    <div>
      <Head title="🗄️ Database" sub="Two separate parts: the App Cloud (accounts & plans) and My Data (your tables)." />
      <div className="card mb-4 p-4 text-sm">
        <p className="font-bold text-white">(a) App Cloud status</p>
        <p className="mt-1 text-violet-200/75">Connection: {cloudOk === null ? "checking…" : cloudOk ? <span className="text-emerald-300">Connected — accounts, plans, usage counters and your synced data live here (read-only info for normal users).</span> : <span className="text-red-300">Not reachable right now.</span>}</p>
        <p className="text-violet-200/60">Signed in as {ctx.user.email} · Plan: {ctx.isPro ? "Pro" : "Free"} · Data below syncs to your account across devices.</p>
      </div>
      <div className="card p-4">
        <p className="font-bold text-white">(b) My Data — create a table in plain words</p>
        <div className="mt-2 flex gap-2"><input className="inp flex-1" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="a table for customers with name, phone, balance" /><button className="btn-primary" onClick={createFromWords}>Create Table</button></div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-ghost text-xs" onClick={() => download("nova-backup.json", JSON.stringify(tables, null, 2), "application/json")}>Backup (Export JSON)</button>
          <label className="btn-ghost cursor-pointer text-xs">Restore (Import JSON)<input type="file" accept=".json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const arr = JSON.parse(await f.text()); if (Array.isArray(arr)) { persist(arr); ctx.toast("Restored."); } } catch { ctx.toast("Invalid backup file."); } }} /></label>
          <button className="btn-ghost text-xs text-red-300" onClick={() => { if (window.confirm("Delete ALL your tables? This cannot be undone.")) persist([]); }}>Delete All</button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">{tables.map((t) => <button key={t.id} onClick={() => setSel(t)} className="card p-4 text-left"><p className="font-bold capitalize text-white">{t.name}</p><p className="text-xs text-violet-300/70">{t.columns.join(" · ")}</p><p className="text-xs text-violet-300/70">{t.rows.length} rows</p></button>)}</div>
      {tables.length === 0 && <p className="mt-3 text-sm text-violet-200/60">No tables yet — create your first one in plain words above.</p>}
      {sel && (
        <div className="card mt-4 overflow-x-auto p-4">
          <div className="flex flex-wrap gap-2"><p className="flex-1 font-bold capitalize text-white">{sel.name}</p>
            <button className="btn-ghost text-xs" onClick={() => { const row: Row = {}; sel.columns.forEach((c) => (row[c] = "")); persist(tables.map((t) => t.id === sel.id ? { ...t, rows: [...t.rows, row] } : t)); }}>+ Add Row</button>
            <button className="btn-ghost text-xs" onClick={() => download(`${sel.name}.csv`, toCSV(sel.rows), "text/csv")}>Export CSV</button>
            <label className="btn-ghost cursor-pointer text-xs">Import CSV<input type="file" accept=".csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const lines = (await f.text()).trim().split("\n"); const heads = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "")); const rows = lines.slice(1).map((l) => { const cells = l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")); const r: Row = {}; heads.forEach((h, i) => (r[h] = cells[i] || "")); return r; }); persist(tables.map((t) => t.id === sel.id ? { ...t, columns: heads, rows: [...t.rows, ...rows] } : t)); ctx.toast(`Imported ${rows.length} rows.`); }} /></label>
            <button className="btn-ghost text-xs text-red-300" onClick={() => persist(tables.filter((t) => t.id !== sel.id))}>Delete Table</button>
          </div>
          <table className="mt-3 w-full min-w-[480px] text-sm"><thead><tr>{sel.columns.map((c) => <th key={c} className="border-b border-violet-500/20 px-2 py-2 text-left capitalize text-violet-200">{c}</th>)}<th className="border-b border-violet-500/20" /></tr></thead>
            <tbody>{sel.rows.map((r, ri) => <tr key={ri}>{sel.columns.map((c) => <td key={c} className="border-b border-white/5 px-1 py-1"><input className="w-full bg-transparent px-1 py-1 text-violet-50 outline-none focus:bg-white/5" value={r[c] || ""} onChange={(e) => { const rows = sel.rows.map((x, xi) => xi === ri ? { ...x, [c]: e.target.value } : x); persist(tables.map((t) => t.id === sel.id ? { ...t, rows } : t)); }} /></td>)}<td><button className="text-red-300" onClick={() => persist(tables.map((t) => t.id === sel.id ? { ...t, rows: t.rows.filter((_, xi) => xi !== ri) } : t))}>✕</button></td></tr>)}</tbody></table>
          {sel.rows.length === 0 && <p className="py-4 text-center text-sm text-violet-200/60">No rows yet — add your first row.</p>}
        </div>
      )}
    </div>
  );
}

/* ---------------- DEPLOY ---------------- */
type Check = { label: string; ok: boolean | null; detail: string };
export function DeploySection({ ctx }: { ctx: Ctx }) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);
  const project = ls<{ name: string; kind: string; content: string; prompt: string } | null>("nova:deployProject", null);

  const runChecks = async () => {
    setBusy(true);
    const out: Check[] = [];
    const probe = async (url: string) => { try { const r = await fetch(url, { method: "GET" }); return r; } catch { return null; } };
    const home = await probe("/"); out.push({ label: "Home page returns 200", ok: !!home && home.ok, detail: home ? `HTTP ${home.status}` : "no response" });
    const man = await probe("/manifest.json");
    let manOk = false, manDetail = "unreachable";
    if (man) { try { const j = await man.json(); manOk = j.name === "Novster Work Studio" && j.short_name === "Novster" && j.display === "standalone"; manDetail = manOk ? "name/short_name/display correct" : "fields incorrect"; } catch { manDetail = "invalid JSON"; } }
    out.push({ label: "Manifest valid", ok: !!(man && man.ok && manOk), detail: manDetail });
    let swOk = false; try { const reg = await navigator.serviceWorker?.getRegistration(); swOk = !!reg?.active; } catch {}
    out.push({ label: "Service worker registered & active", ok: swOk, detail: swOk ? "active" : "not active yet — reload once" });
    for (const [path, size] of [["/icons/icon-192.png", 192], ["/icons/icon-512.png", 512], ["/icons/icon-maskable-512.png", 512], ["/icons/apple-touch-icon.png", 180]] as const) {
      const r = await probe(path);
      let measured = 0;
      if (r && r.ok) { try { const buf = await (await fetch(path)).arrayBuffer(); const v = new DataView(buf); measured = v.getUint32(16); } catch {} }
      out.push({ label: `${path} exact ${size}px`, ok: !!(r && r.ok && measured === size), detail: r ? `HTTP ${r.status}, measured ${measured || "?"}px` : "no response" });
    }
    const off = await probe("/offline.html"); out.push({ label: "Offline page returns 200", ok: !!off && off.ok, detail: off ? `HTTP ${off.status}` : "no response" });
    const swFile = await probe("/sw.js"); out.push({ label: "/sw.js returns 200", ok: !!swFile && swFile.ok, detail: swFile ? `HTTP ${swFile.status}` : "no response" });
    setChecks(out); setBusy(false);
  };
  useEffect(() => { runChecks(); }, []); // eslint-disable-line

  const install = async () => {
    const dp = ctx.installPrompt as unknown as { prompt?: () => Promise<void> } | null;
    if (dp?.prompt) { await dp.prompt(); return; }
    ctx.toast(/iphone|ipad/i.test(navigator.userAgent) ? "iOS: tap Share → Add to Home Screen to install Novster." : "Install prompt not available yet — use the browser menu → Install app / Add to Home Screen.");
  };

  const exportZip = async () => {
    if (!project) { ctx.toast("Open a project in Create → “Go to Deploy” first."); return; }
    const { default: JSZip } = await import("jszip").catch(() => ({ default: null as never }));
    if (!JSZip) { ctx.toast("ZIP library unavailable."); return; }
    const zip = new JSZip();
    zip.file(project.kind === "website" ? "index.html" : project.kind === "sheet" ? "sheet.csv" : "document.txt", project.content);
    zip.file("README.md", `# ${project.name} — Deploy Guide\n\nCreated with Novster Work Studio 2.0.\n\n## Publish anywhere\n1. Netlify Drop: drag this folder at app.netlify.com/drop\n2. Vercel: run \"npx vercel\" in this folder\n3. GitHub Pages: push index.html to a repo and enable Pages\n\nNova does not invent a live URL — your host will give you the real one after publishing.\n`);
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "deploy-ready.zip"; a.click();
  };

  return (
    <div>
      <Head title="🚀 Deploy" sub="Honest publishing: real install checks + a deploy-ready ZIP. No fake URLs, ever." />
      {!ctx.isPro && ctx.user && <div className="mb-4 rounded-2xl border border-violet-400/25 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">Free plan: ZIP export is included. The guided publish flow is a Pro feature — the ZIP itself works the same everywhere.</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center gap-2"><h3 className="flex-1 font-extrabold text-white">📲 App Install checks (live)</h3><button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={runChecks}>{busy ? "Checking…" : "Re-run"}</button></div>
          <div className="mt-3 space-y-2">{checks.map((c, i) => <div key={i} className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2 text-sm"><span>{c.ok === null ? "⏳" : c.ok ? "✅" : "❌"}</span><span className="flex-1 text-violet-50">{c.label}</span><span className="text-xs text-violet-300/70">{c.detail}</span></div>)}</div>
          <button className="btn-primary mt-4 w-full" onClick={install}>Install App</button>
          <p className="mt-2 text-[11px] text-violet-300/60">After the first visit, Nova opens from cache with the network off and shows the app shell / offline page — never a browser error.</p>
        </div>
        <div className="card p-5">
          <h3 className="font-extrabold text-white">📦 Project publish</h3>
          {project ? <><p className="mt-2 text-sm text-violet-200/80">Carried over from Create: <b className="text-white">{project.name}</b> ({project.kind})</p>
            <button className="btn-primary mt-3 w-full" onClick={exportZip}>Download Deploy-Ready ZIP (+ README)</button>
            <p className="mt-3 text-sm leading-relaxed text-violet-200/70">The ZIP is the deliverable. Publish it on Netlify Drop, Vercel or GitHub Pages (steps inside the README) — your host returns the real public URL. <b className="text-white">Deploy state inside Nova is local to this device</b>; Nova never invents a live URL.</p></>
            : <p className="mt-2 text-sm text-violet-200/70">No project carried over yet. Go to <button className="underline" onClick={() => ctx.goto("create")}>Create</button>, generate a project, then tap “Go to Deploy”.</p>}
          <div className="mt-4 rounded-xl bg-black/25 p-3 text-xs leading-relaxed text-violet-200/70">Guests: view only. Free: ZIP export. Pro: ZIP + guided publish flow (same ZIP, plus step-by-step host walkthrough above).</div>
        </div>
      </div>
    </div>
  );
}
