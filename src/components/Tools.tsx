"use client";
import { useEffect, useMemo, useState } from "react";
import { callAI, loadCollection, saveCollection, download, toCSV, money } from "@/lib/client";
import type { Ctx } from "./NovaApp";
import { LockScreen, NoKeyNotice } from "./Sections";

type ToolDef = { id: string; name: string; benefit: string; tag: "PRO" | "FREE"; icon: string };
const TOOLS: ToolDef[] = [
  { id: "invoice", name: "Invoice & Khata", benefit: "Invoices, customer dues (khata) & WhatsApp reminders", tag: "PRO", icon: "🧾" },
  { id: "social", name: "Social Content Machine", benefit: "30-day content calendar for FB, Insta, TikTok, YouTube", tag: "PRO", icon: "📅" },
  { id: "cv", name: "CV Maker Pro", benefit: "Guided CV with 3 print-ready templates", tag: "PRO", icon: "📄" },
  { id: "whatsapp", name: "WhatsApp Business Kit", benefit: "Broadcasts, quick replies & click-to-chat links", tag: "FREE", icon: "💬" },
  { id: "youtube", name: "YouTube Growth Kit", benefit: "Titles, description, 25 tags & thumbnail ideas", tag: "PRO", icon: "▶️" },
  { id: "docai", name: "Document AI", benefit: "Summarize & ask questions about files, EN ↔ Urdu", tag: "PRO", icon: "📚" },
  { id: "sheetai", name: "Sheet AI", benefit: "Describe it → CSV sheet or exact Excel formula", tag: "FREE", icon: "📊" },
  { id: "planner", name: "Expense & Task Planner", benefit: "Daily expenses, tasks & monthly totals", tag: "FREE", icon: "✅" },
  { id: "voice", name: "Voice Studio", benefit: "Read text aloud (Urdu/English) & voice-to-text", tag: "PRO", icon: "🎙️" },
  { id: "imgprompt", name: "Image Prompt Studio", benefit: "Guided builder for pro image prompts", tag: "FREE", icon: "✨" },
];

export function ToolsHub({ ctx }: { ctx: Ctx }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!ctx.user) {
    return <div><h1 className="text-2xl font-extrabold text-white sm:text-3xl">🧰 Tools</h1><p className="mt-1 text-sm text-violet-200/70">10 daily-use tools. Most are Pro — your data saves to your account.</p>
      <div className="card mx-auto mt-6 max-w-lg p-8 text-center"><p className="text-5xl">🔒</p><h2 className="mt-3 text-xl font-extrabold text-white">Tools are locked for guests</h2><p className="mt-2 text-sm text-violet-200/75">Create a free account to use the free tools (WhatsApp Kit, Sheet AI, Planner, Image Prompt Studio) and see Pro tools.</p><button className="btn-primary mt-5 w-full" onClick={() => window.location.reload()}>Sign up / Log in</button></div></div>;
  }
  if (open) {
    const back = () => setOpen(null);
    const proLocked = TOOLS.find((t) => t.id === open)?.tag === "PRO" && !ctx.isPro;
    if (proLocked) return <div><button className="btn-ghost mb-4 text-sm" onClick={back}>← All Tools</button><LockScreen ctx={ctx} title={TOOLS.find((t) => t.id === open)?.name || "Tool"} desc={TOOLS.find((t) => t.id === open)?.benefit || ""} free="This tool does not run on Free — not even once. Upgrade to open it fully." /></div>;
    return <div><button className="btn-ghost mb-4 text-sm" onClick={back}>← All Tools</button>
      {open === "invoice" && <InvoiceTool ctx={ctx} />}{open === "social" && <SocialTool ctx={ctx} />}{open === "cv" && <CvTool ctx={ctx} />}
      {open === "whatsapp" && <WhatsAppTool ctx={ctx} />}{open === "youtube" && <YouTubeTool ctx={ctx} />}{open === "docai" && <DocTool ctx={ctx} />}
      {open === "sheetai" && <SheetTool ctx={ctx} />}{open === "planner" && <PlannerTool ctx={ctx} />}{open === "voice" && <VoiceTool ctx={ctx} />}
      {open === "imgprompt" && <ImgPromptTool ctx={ctx} />}</div>;
  }
  return (
    <div>
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">🧰 Tools</h1>
      <p className="mt-1 text-sm text-violet-200/70">{ctx.isPro ? "All 10 tools unlocked." : "Free tools work with daily limits · PRO tools show a lock screen."} Data saves to your account.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => (
          <button key={t.id} onClick={() => setOpen(t.id)} className="card p-5 text-left transition hover:ring-2 hover:ring-violet-500/50">
            <div className="flex items-start gap-3"><span className="text-3xl">{t.icon}</span>
              <span className={`ml-auto rounded-full px-2.5 py-1 text-[10px] font-extrabold ${t.tag === "PRO" ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white" : "bg-emerald-500/20 text-emerald-300"}`}>{t.tag}</span></div>
            <p className="mt-2 font-bold text-white">{t.name}</p><p className="mt-1 text-xs leading-relaxed text-violet-200/70">{t.benefit}</p>
            {t.tag === "PRO" && !ctx.isPro && <p className="mt-2 text-xs font-semibold text-fuchsia-300">🔒 Locked — tap to see Upgrade</p>}
          </button>
        ))}
      </div>
    </div>
  );
}

function THead({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return <div className="mb-4"><h1 className="text-2xl font-extrabold text-white">{icon} {title}</h1><p className="mt-1 text-sm text-violet-200/70">{sub}</p></div>;
}
const LangPicker = ({ lang, setLang }: { lang: string; setLang: (s: string) => void }) => (
  <div className="flex gap-1.5">{["English", "Urdu", "Roman Urdu"].map((l) => <button key={l} onClick={() => setLang(l)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${lang === l ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-200"}`}>{l}</button>)}</div>
);

/* 1 — INVOICE & KHATA */
type Cust = { id: string; name: string; phone: string };
type InvItem = { name: string; qty: number; rate: number };
type Invoice = { id: string; no: string; customerId: string; items: InvItem[]; discount: number; taxPct: number; date: string };
type Entry = { id: string; customerId: string; type: "given" | "paid"; amount: number; note: string; date: string };
export function invoiceTotal(inv: Invoice) { const sub = inv.items.reduce((s, i) => s + i.qty * i.rate, 0); return { sub, total: Math.max(0, (sub - inv.discount) * (1 + inv.taxPct / 100)) }; }

function InvoiceTool({ ctx }: { ctx: Ctx }) {
  const uid = ctx.user?.id ?? null;
  const [biz, setBiz] = useState(""); const [customers, setCustomers] = useState<Cust[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]); const [entries, setEntries] = useState<Entry[]>([]);
  const [cName, setCName] = useState(""); const [cPhone, setCPhone] = useState("");
  const [selCust, setSelCust] = useState(""); const [items, setItems] = useState<InvItem[]>([{ name: "", qty: 1, rate: 0 }]);
  const [discount, setDiscount] = useState(0); const [tax, setTax] = useState(0);
  const [amt, setAmt] = useState(""); const [eType, setEType] = useState<"given" | "paid">("given"); const [note, setNote] = useState("");
  const [printInv, setPrintInv] = useState<Invoice | null>(null);

  useEffect(() => { (async () => {
    setBiz(await loadCollection("khata:biz", uid, "")); setCustomers(await loadCollection("khata:customers", uid, []));
    setInvoices(await loadCollection("khata:invoices", uid, [])); setEntries(await loadCollection("khata:entries", uid, []));
  })(); }, [uid]); // eslint-disable-line
  const saveAll = (c = customers, i = invoices, e = entries, b = biz) => { saveCollection("khata:customers", uid, c); saveCollection("khata:invoices", uid, i); saveCollection("khata:entries", uid, e); saveCollection("khata:biz", uid, b); };
  const balance = (cid: string) => entries.filter((e) => e.customerId === cid).reduce((s, e) => s + (e.type === "given" ? e.amount : -e.amount), 0);
  const preview = useMemo(() => { const sub = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0); return { sub, total: Math.max(0, (sub - discount) * (1 + tax / 100)) }; }, [items, discount, tax]);

  const createInvoice = () => {
    if (!selCust) { ctx.toast("Select a customer first (add one below if needed)."); return; }
    if (!items.some((i) => i.name && i.rate > 0)) { ctx.toast("Add at least one item with name and rate."); return; }
    const inv: Invoice = { id: Date.now().toString(), no: `INV-${invoices.length + 1}`, customerId: selCust, items, discount, taxPct: tax, date: new Date().toLocaleDateString() };
    const t = invoiceTotal(inv).total;
    const entry: Entry = { id: `${Date.now()}e`, customerId: selCust, type: "given", amount: Math.round(t), note: `Invoice ${inv.no}`, date: inv.date };
    const ni = [inv, ...invoices], ne = [entry, ...entries];
    setInvoices(ni); setEntries(ne); saveAll(customers, ni, ne);
    setItems([{ name: "", qty: 1, rate: 0 }]); setDiscount(0); setTax(0);
    ctx.toast(`Invoice ${inv.no} saved — ${money(t)} added to the customer's khata (given).`);
  };

  return (
    <div>
      <THead icon="🧾" title="Invoice & Khata" sub="Totals are calculated in code — never by AI. Balances update automatically." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <label className="lbl">Your business name (shown on invoice)</label>
          <div className="flex gap-2"><input className="inp flex-1" value={biz} onChange={(e) => setBiz(e.target.value)} placeholder="e.g. Khan Mobile Shop" /><button className="btn-ghost" onClick={() => saveAll(customers, invoices, entries, biz)}>Save</button></div>
          <h3 className="mt-5 font-bold text-white">Customers</h3>
          <div className="mt-2 flex gap-2"><input className="inp flex-1" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Name" /><input className="inp flex-1" value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="Phone (03xx…)" /><button className="btn-primary" onClick={() => { if (!cName.trim()) return; const n = [{ id: Date.now().toString(), name: cName, phone: cPhone }, ...customers]; setCustomers(n); saveAll(n); setCName(""); setCPhone(""); }}>Add</button></div>
          <div className="mt-3 space-y-1.5">{customers.map((c) => <div key={c.id} className="flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2 text-sm"><span className="flex-1 text-violet-50">{c.name} <span className="text-violet-300/60">{c.phone}</span></span><span className={`font-bold ${balance(c.id) > 0 ? "text-amber-300" : "text-emerald-300"}`}>{money(balance(c.id))}</span></div>)}
          {customers.length === 0 && <p className="text-sm text-violet-200/60">No customers yet — add your first one.</p>}</div>

          <h3 className="mt-5 font-bold text-white">Khata entry (given / paid)</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select className="inp" value={selCust} onChange={(e) => setSelCust(e.target.value)}><option value="">Select customer…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select className="inp" value={eType} onChange={(e) => setEType(e.target.value as "given" | "paid")}><option value="given">Given (udhaar diya)</option><option value="paid">Paid (wasool)</option></select>
            <input className="inp" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Amount" /><input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" />
          </div>
          <button className="btn-ghost mt-2 w-full" onClick={() => { const a = Number(amt); if (!selCust || !a) { ctx.toast("Select customer and amount."); return; } const ne = [{ id: Date.now().toString(), customerId: selCust, type: eType, amount: a, note, date: new Date().toLocaleDateString() }, ...entries]; setEntries(ne); saveAll(customers, invoices, ne); setAmt(""); setNote(""); ctx.toast("Khata entry saved — balance updated."); }}>Save Entry</button>
        </div>

        <div className="card p-4">
          <h3 className="font-bold text-white">New Invoice</h3>
          <select className="inp mt-2" value={selCust} onChange={(e) => setSelCust(e.target.value)}><option value="">Customer…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          {items.map((it, i) => <div key={i} className="mt-2 grid grid-cols-[1fr_70px_90px_30px] gap-2">
            <input className="inp" value={it.name} placeholder="Item" onChange={(e) => setItems(items.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))} />
            <input className="inp" type="number" value={it.qty} placeholder="Qty" onChange={(e) => setItems(items.map((x, xi) => xi === i ? { ...x, qty: Number(e.target.value) } : x))} />
            <input className="inp" type="number" value={it.rate} placeholder="Rate" onChange={(e) => setItems(items.map((x, xi) => xi === i ? { ...x, rate: Number(e.target.value) } : x))} />
            <button className="text-red-300" onClick={() => setItems(items.filter((_, xi) => xi !== i))}>✕</button></div>)}
          <button className="btn-ghost mt-2 text-xs" onClick={() => setItems([...items, { name: "", qty: 1, rate: 0 }])}>+ Add item</button>
          <div className="mt-3 grid grid-cols-2 gap-2"><div><label className="lbl">Discount (Rs)</label><input className="inp" type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
          <div><label className="lbl">Tax %</label><input className="inp" type="number" value={tax} onChange={(e) => setTax(Number(e.target.value))} /></div></div>
          <div className="mt-3 rounded-xl bg-black/30 p-3 text-sm text-violet-100">Subtotal: <b>{money(preview.sub)}</b> · Discount: −{money(discount)} · Tax: {tax}%<br /><span className="text-base font-extrabold text-white">Total: {money(preview.total)}</span> <span className="text-[11px] text-violet-300/60">(calculated in code)</span></div>
          <button className="btn-primary mt-3 w-full" onClick={createInvoice}>Save Invoice + Add to Khata</button>
        </div>
      </div>

      <div className="card mt-4 p-4">
        <div className="flex flex-wrap items-center gap-2"><h3 className="flex-1 font-bold text-white">📋 Who owes me (dues list)</h3>
          <button className="btn-ghost text-xs" onClick={() => download("khata.csv", toCSV(customers.map((c) => ({ customer: c.name, phone: c.phone, balance: balance(c.id) }))), "text/csv")}>Export CSV</button>
          <button className="btn-ghost text-xs" onClick={() => download("invoices.csv", toCSV(invoices.map((v) => ({ no: v.no, customer: customers.find((c) => c.id === v.customerId)?.name || "", date: v.date, total: Math.round(invoiceTotal(v).total) }))), "text/csv")}>Invoices CSV</button></div>
        {customers.filter((c) => balance(c.id) > 0).map((c) => { const msg = `Assalam-o-Alaikum ${c.name}, umeed hai aap khairiyat se hain. ${biz ? biz + " ki taraf se " : ""}arz hai ke aap ke zimme ${money(balance(c.id))} baqaya hain. Meharbani farma kar adaigi kar dein. Shukriya!`; return (
          <div key={c.id} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-black/25 px-3 py-2 text-sm"><span className="flex-1 text-violet-50">{c.name} — <b className="text-amber-300">{money(balance(c.id))}</b></span>
            <a className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white" target="_blank" rel="noreferrer" href={`https://wa.me/${c.phone.replace(/\D/g, "").replace(/^0/, "92")}?text=${encodeURIComponent(msg)}`}>WhatsApp Reminder</a></div> ); })}
        {customers.filter((c) => balance(c.id) > 0).length === 0 && <p className="mt-2 text-sm text-violet-200/60">No outstanding dues. 🎉</p>}
        <h3 className="mt-5 font-bold text-white">Invoices</h3>
        {invoices.map((v) => <div key={v.id} className="mt-2 flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2 text-sm"><span className="flex-1 text-violet-50">{v.no} · {customers.find((c) => c.id === v.customerId)?.name || "?"} · {v.date}</span><b className="text-white">{money(invoiceTotal(v).total)}</b><button className="btn-ghost px-3 py-1 text-xs" onClick={() => setPrintInv(v)}>Print / PDF</button></div>)}
        {invoices.length === 0 && <p className="mt-1 text-sm text-violet-200/60">No invoices yet — create your first one.</p>}
      </div>

      {printInv && <div className="fixed inset-0 z-50 overflow-auto bg-black/80 p-4" onClick={() => setPrintInv(null)}><div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between"><div><h2 className="text-2xl font-extrabold">{biz || "My Business"}</h2><p className="text-sm text-slate-500">{printInv.no} · {printInv.date}</p></div><p className="text-xl font-bold">INVOICE</p></div>
        <p className="mt-4 text-sm">Bill to: <b>{customers.find((c) => c.id === printInv.customerId)?.name}</b> {customers.find((c) => c.id === printInv.customerId)?.phone}</p>
        <table className="mt-4 w-full text-sm"><thead><tr className="border-b"><th className="py-2 text-left">Item</th><th>Qty</th><th>Rate</th><th className="text-right">Amount</th></tr></thead>
        <tbody>{printInv.items.map((i, x) => <tr key={x} className="border-b"><td className="py-2">{i.name}</td><td className="text-center">{i.qty}</td><td className="text-center">{i.rate}</td><td className="text-right">{i.qty * i.rate}</td></tr>)}</tbody></table>
        <div className="mt-4 text-right text-sm"><p>Subtotal: {money(invoiceTotal(printInv).sub)}</p><p>Discount: −{money(printInv.discount)} · Tax: {printInv.taxPct}%</p><p className="text-lg font-extrabold">Total: {money(invoiceTotal(printInv).total)}</p></div>
        <div className="mt-6 flex gap-2 print:hidden"><button className="btn-primary" onClick={() => window.print()}>Print / Save PDF</button><button className="btn-ghost !text-slate-700 ring-1 ring-slate-300" onClick={() => setPrintInv(null)}>Close</button></div>
      </div></div>}
    </div>
  );
}

/* 2 — SOCIAL CONTENT MACHINE */
type Day = { day: number; idea: string; caption: string; hashtags: string; done: boolean };
function SocialTool({ ctx }: { ctx: Ctx }) {
  const uid = ctx.user?.id ?? null;
  const [niche, setNiche] = useState(""); const [platforms, setPlatforms] = useState<string[]>(["Instagram", "Facebook"]);
  const [lang, setLang] = useState("Roman Urdu"); const [days, setDays] = useState<Day[]>([]); const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { loadCollection<Day[]>("social:calendar", uid, []).then(setDays); }, [uid]); // eslint-disable-line
  const persist = (d: Day[]) => { setDays(d); saveCollection("social:calendar", uid, d); };
  const togglePlat = (p: string) => setPlatforms(platforms.includes(p) ? platforms.filter((x) => x !== p) : [...platforms, p]);

  const gen = async () => {
    if (!niche.trim()) { setErr("Enter your niche first (e.g. ladies suits shop, mobile accessories)."); return; }
    setBusy("all"); setErr("");
    const res = await callAI([{ role: "user", content: `Create a 30-day social media content calendar for a Pakistani business. Niche: ${niche}. Platforms: ${platforms.join(", ")}. Caption language: ${lang}. Return ONLY a JSON array of 30 objects with keys: idea, caption, hashtags. Each day: one post/Reel idea, a ready caption, and hashtags string. No markdown, only JSON.` }]);
    setBusy("");
    if (!res.ok) { setErr(res.error); return; }
    try { const arr = JSON.parse(res.text.replace(/```json|```/g, "").trim()); const mapped: Day[] = arr.slice(0, 30).map((d: { idea: string; caption: string; hashtags: string }, i: number) => ({ day: i + 1, idea: String(d.idea || ""), caption: String(d.caption || ""), hashtags: String(d.hashtags || ""), done: false })); persist(mapped); ctx.toast("30-day calendar generated and saved."); }
    catch { setErr("The AI reply was not valid calendar JSON. Try Regenerate — nothing was saved."); }
  };
  const regenDay = async (d: Day) => {
    setBusy(`d${d.day}`);
    const res = await callAI([{ role: "user", content: `For niche "${niche || "Pakistani small business"}", give ONE fresh content idea with caption (${lang}) and hashtags. Reply in exactly 3 lines:\nIDEA: ...\nCAPTION: ...\nTAGS: ...` }]);
    setBusy("");
    if (!res.ok) { setErr(res.error); return; }
    const pick = (k: string) => (res.text.match(new RegExp(`${k}:\\s*(.+)`))?.[1] || "").trim();
    persist(days.map((x) => x.day === d.day ? { ...x, idea: pick("IDEA") || x.idea, caption: pick("CAPTION") || x.caption, hashtags: pick("TAGS") || x.hashtags } : x));
  };

  return <div><THead icon="📅" title="Social Content Machine" sub="A saved 30-day calendar — mark days Done, regenerate any day." /><NoKeyNotice ctx={ctx} />
    <div className="card p-4"><label className="lbl">Your niche / business</label><input className="inp" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. homemade food delivery in Lahore" />
      <div className="mt-3 flex flex-wrap items-center gap-2">{["Facebook", "Instagram", "TikTok", "YouTube"].map((p) => <button key={p} onClick={() => togglePlat(p)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${platforms.includes(p) ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-200"}`}>{p}</button>)}<LangPicker lang={lang} setLang={setLang} /></div>
      <button disabled={!!busy} className="btn-primary mt-3" onClick={gen}>{busy === "all" ? "Generating 30 days…" : "Generate 30-Day Calendar"}</button>
      {err && <p className="mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}</div>
    {days.length === 0 && <p className="mt-4 text-sm text-violet-200/60">No calendar yet — generate your first one above.</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{days.map((d) => (
      <div key={d.day} className={`card p-4 ${d.done ? "opacity-60 ring-1 ring-emerald-500/40" : ""}`}>
        <div className="flex items-center gap-2"><span className="rounded-full bg-violet-600 px-2.5 py-0.5 text-xs font-bold text-white">Day {d.day}</span>{d.done && <span className="text-xs font-bold text-emerald-300">DONE ✓</span>}
          <button className="ml-auto text-xs text-violet-300 underline" disabled={!!busy} onClick={() => regenDay(d)}>{busy === `d${d.day}` ? "…" : "Regenerate"}</button></div>
        <p className="mt-2 text-sm font-semibold text-white">{d.idea}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-violet-200/80" dir={lang === "Urdu" ? "rtl" : "ltr"}>{d.caption}</p>
        <p className="mt-1 text-[11px] text-fuchsia-300/80">{d.hashtags}</p>
        <button className={`mt-3 w-full rounded-xl py-2 text-xs font-bold ${d.done ? "bg-white/[0.07] text-violet-100" : "bg-emerald-600 text-white"}`} onClick={() => persist(days.map((x) => x.day === d.day ? { ...x, done: !x.done } : x))}>{d.done ? "Mark not done" : "Mark Done"}</button>
      </div>))}</div></div>;
}

/* 3 — CV MAKER */
function CvTool({ ctx }: { ctx: Ctx }) {
  const uid = ctx.user?.id ?? null;
  const empty = { name: "", title: "", phone: "", email: "", city: "", summary: "", education: "", experience: "", skills: "" };
  const [f, setF] = useState(empty); const [tpl, setTpl] = useState(0); const [saved, setSaved] = useState<typeof empty[]>([]);
  useEffect(() => { loadCollection<typeof empty[]>("cvs", uid, []).then(setSaved); }, [uid]); // eslint-disable-line
  const save = () => { if (!f.name.trim()) { ctx.toast("Enter at least your name."); return; } const n = [f, ...saved.filter((s) => s.name !== f.name)]; setSaved(n); saveCollection("cvs", uid, n); ctx.toast("CV saved to your account."); };
  const lines = (s: string) => s.split("\n").filter(Boolean);
  const wrapCls = ["bg-white text-slate-900", "bg-[#101c3a] text-white", "bg-[#f6f0e6] text-slate-900"][tpl];

  return <div><THead icon="📄" title="CV Maker Pro" sub="The print view contains exactly what you enter — nothing is invented." />
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        {(["name", "title", "phone", "email", "city"] as const).map((k) => <div key={k} className="mt-2"><label className="lbl capitalize">{k}</label><input className="inp" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>)}
        {(["summary", "education", "experience", "skills"] as const).map((k) => <div key={k} className="mt-3"><label className="lbl capitalize">{k} (one per line)</label><textarea className="inp min-h-20" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>)}
        <div className="mt-3 flex gap-1.5">{["Classic", "Midnight", "Warm"].map((t, i) => <button key={t} onClick={() => setTpl(i)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${tpl === i ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-200"}`}>{t}</button>)}</div>
        <div className="mt-3 flex gap-2"><button className="btn-primary flex-1" onClick={save}>Save CV</button><button className="btn-ghost" onClick={() => window.print()}>Print / PDF</button></div>
        {saved.length > 0 && <div className="mt-3">{saved.map((s, i) => <button key={i} className="btn-ghost mr-1.5 mt-1.5 text-xs" onClick={() => setF(s)}>Open: {s.name}</button>)}</div>}
      </div>
      <div className={`rounded-3xl p-7 shadow-xl print:shadow-none ${wrapCls}`}>
        <h2 className="text-3xl font-extrabold">{f.name || "Your Name"}</h2><p className="font-semibold opacity-80">{f.title}</p>
        <p className="mt-1 text-sm opacity-70">{[f.phone, f.email, f.city].filter(Boolean).join(" · ")}</p>
        {f.summary && <><h3 className="mt-5 font-extrabold uppercase tracking-wide">Summary</h3><p className="mt-1 whitespace-pre-wrap text-sm">{f.summary}</p></>}
        {f.experience && <><h3 className="mt-5 font-extrabold uppercase tracking-wide">Experience</h3>{lines(f.experience).map((l, i) => <p key={i} className="mt-1 text-sm">• {l}</p>)}</>}
        {f.education && <><h3 className="mt-5 font-extrabold uppercase tracking-wide">Education</h3>{lines(f.education).map((l, i) => <p key={i} className="mt-1 text-sm">• {l}</p>)}</>}
        {f.skills && <><h3 className="mt-5 font-extrabold uppercase tracking-wide">Skills</h3><div className="mt-1 flex flex-wrap gap-1.5">{f.skills.split(/[,\n]/).filter(Boolean).map((s, i) => <span key={i} className="rounded-full bg-black/10 px-2.5 py-1 text-xs font-semibold">{s.trim()}</span>)}</div></>}
      </div>
    </div></div>;
}

/* 4 — WHATSAPP KIT */
function WhatsAppTool({ ctx }: { ctx: Ctx }) {
  const [kindMsg, setKindMsg] = useState("Sale offer"); const [biz, setBiz] = useState(""); const [detail, setDetail] = useState("");
  const [lang, setLang] = useState("Roman Urdu"); const [out, setOut] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [num, setNum] = useState(""); const [prefill, setPrefill] = useState("");
  const templates = [
    { n: "Order confirmation", t: "Assalam-o-Alaikum! Your order has been confirmed. Total: Rs ___ . We will message you when it is dispatched. Shukriya for shopping with us!" },
    { n: "Delivery update", t: "Good news! Your order is out for delivery and will reach you today. Please keep Rs ___ ready. For help reply to this message." },
    { n: "Eid offer", t: "Eid Mubarak! Special Eid offer at our shop — up to ___% off for a limited time. Visit us or reply to order. JazakAllah!" },
    { n: "Payment reminder (soft)", t: "Assalam-o-Alaikum, a gentle reminder about your pending balance of Rs ___ . Please clear it when convenient. Thank you!" },
  ];
  const waLink = num ? `https://wa.me/${num.replace(/\D/g, "").replace(/^0/, "92")}?text=${encodeURIComponent(prefill)}` : "";

  const gen = async () => {
    const chk = await ctx.bumpUsage("whatsapp");
    if (!chk.allowed) { setErr(chk.error || "Daily limit reached."); return; }
    setBusy(true); setErr("");
    const res = await callAI([{ role: "user", content: `Write ONE WhatsApp broadcast message. Type: ${kindMsg}. Business: ${biz || "our shop"}. Details: ${detail}. Language: ${lang}. Short, friendly, no spammy wording, with one clear call to action. Only the message.` }]);
    setBusy(false);
    if (res.ok) setOut(res.text); else setErr(res.error);
  };

  return <div><THead icon="💬" title="WhatsApp Business Kit" sub={ctx.isPro ? "Unlimited generations." : `Free: ${ctx.usage.whatsapp ?? 0}/${ctx.settings.limit_free_whatsapp || 3} generations today.`} /><NoKeyNotice ctx={ctx} />
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <label className="lbl">Message type</label><div className="flex flex-wrap gap-1.5">{["Sale offer", "New arrival", "Eid offer", "Order confirmation", "Delivery update"].map((k) => <button key={k} onClick={() => setKindMsg(k)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${kindMsg === k ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-200"}`}>{k}</button>)}</div>
        <label className="lbl mt-3">Business name</label><input className="inp" value={biz} onChange={(e) => setBiz(e.target.value)} />
        <label className="lbl mt-3">Offer / details</label><textarea className="inp" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="e.g. 20% off all suits till Sunday" />
        <div className="mt-3"><LangPicker lang={lang} setLang={setLang} /></div>
        <button disabled={busy} className="btn-primary mt-3 w-full" onClick={gen}>{busy ? "Writing…" : "Generate Message"}</button>
        {err && <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}
        {out && <div className="mt-3 rounded-xl bg-black/30 p-3"><p className="whitespace-pre-wrap text-sm text-violet-50" dir={lang === "Urdu" ? "rtl" : "ltr"}>{out}</p><div className="mt-2 flex gap-1.5"><button className="btn-ghost text-xs" onClick={() => { navigator.clipboard?.writeText(out); ctx.toast("Copied."); }}>Copy</button><a className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(out)}`}>Share on WhatsApp</a></div></div>}
        <h3 className="mt-5 font-bold text-white">Quick-reply library</h3>
        {templates.map((t) => <div key={t.n} className="mt-2 rounded-xl bg-black/25 p-3"><p className="text-xs font-bold text-violet-200">{t.n}</p><p className="mt-1 text-sm text-violet-50">{t.t}</p><button className="btn-ghost mt-2 text-xs" onClick={() => { navigator.clipboard?.writeText(t.t); ctx.toast("Template copied."); }}>Copy</button></div>)}
      </div>
      <div className="card h-fit p-4">
        <h3 className="font-bold text-white">🔗 Click-to-chat link generator</h3>
        <label className="lbl mt-3">Customer number</label><input className="inp" value={num} onChange={(e) => setNum(e.target.value)} placeholder="03xx xxxxxxx or 92…" />
        <label className="lbl mt-3">Prefilled message</label><textarea className="inp" value={prefill} onChange={(e) => setPrefill(e.target.value)} placeholder="Assalam-o-Alaikum, I want to order…" />
        {waLink && <div className="mt-3 rounded-xl bg-black/30 p-3"><p className="break-all text-xs text-emerald-300">{waLink}</p><div className="mt-2 flex gap-1.5"><button className="btn-ghost text-xs" onClick={() => { navigator.clipboard?.writeText(waLink); ctx.toast("Link copied."); }}>Copy link</button><a className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white" target="_blank" rel="noreferrer" href={waLink}>Open chat</a></div></div>}
      </div>
    </div></div>;
}

/* 5 — YOUTUBE KIT */
function YouTubeTool({ ctx }: { ctx: Ctx }) {
  const [topic, setTopic] = useState(""); const [niche, setNiche] = useState(""); const [lang, setLang] = useState("Roman Urdu");
  const [out, setOut] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const gen = async () => {
    if (!topic.trim()) { setErr("Enter a video topic."); return; }
    setBusy(true); setErr("");
    const res = await callAI([{ role: "user", content: `YouTube growth pack. Video topic: ${topic}. Channel niche: ${niche || topic}. Language style: ${lang}. Give EXACTLY these sections:\n## 10 Title Options (numbered)\n## Full Description (with chapters placeholder like 00:00 Intro)\n## 25 Tags (comma-separated, copy-ready block)\n## 3 Thumbnail Text Ideas\n## 10 Video Ideas for this niche` }]);
    setBusy(false); if (res.ok) setOut(res.text); else setErr(res.error);
  };
  return <div><THead icon="▶️" title="YouTube Growth Kit" sub="Titles, description, 25 tags, thumbnail text & video ideas in one run." /><NoKeyNotice ctx={ctx} />
    <div className="card p-4"><label className="lbl">Video topic</label><input className="inp" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. How to start a mobile accessories shop" />
      <label className="lbl mt-3">Channel niche</label><input className="inp" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. small business tips Pakistan" />
      <div className="mt-3"><LangPicker lang={lang} setLang={setLang} /></div>
      <button disabled={busy} className="btn-primary mt-3" onClick={gen}>{busy ? "Building kit…" : "Generate Growth Kit"}</button>
      {err && <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}
      {out && <div className="mt-3 rounded-xl bg-black/30 p-4"><pre className="whitespace-pre-wrap text-sm leading-relaxed text-violet-50">{out}</pre><button className="btn-ghost mt-3 text-xs" onClick={() => { navigator.clipboard?.writeText(out); ctx.toast("Copied."); }}>Copy all</button></div>}
    </div></div>;
}

/* 6 — DOCUMENT AI */
function DocTool({ ctx }: { ctx: Ctx }) {
  const [text, setText] = useState(""); const [fileName, setFileName] = useState(""); const [mode, setMode] = useState("Summary");
  const [question, setQuestion] = useState(""); const [out, setOut] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const onFile = async (f: File | undefined) => {
    if (!f) return; setFileName(f.name); setErr("");
    if (f.type.startsWith("text") || /\.(txt|md|csv|json)$/i.test(f.name)) { setText((await f.text()).slice(0, 24000)); return; }
    if (f.type === "application/pdf" || f.type.startsWith("image")) { setErr(`“${f.name}” is a ${f.type === "application/pdf" ? "PDF" : "image"}. This viewer reads text files in-browser. For PDF/image reading, paste the text below — image reading needs a vision-capable model on the AI service, and Nova will not pretend to read a file it cannot.`); return; }
    setErr("Unsupported file type. Use .txt/.md/.csv, or paste the document text below.");
  };
  const run = async () => {
    if (!text.trim()) { setErr("Upload a text file or paste document text first."); return; }
    setBusy(true); setErr("");
    const prompts: Record<string, string> = {
      Summary: `Summarize this document clearly with headings:\n\n${text}`,
      "Key points": `List the key points of this document as bullets:\n\n${text}`,
      "Q&A": `Answer this question using ONLY the document. If the answer is not in the document, say so honestly. Question: ${question}\n\nDocument:\n${text}`,
      "Translate EN→Urdu": `Translate this document to natural Urdu (Urdu script):\n\n${text}`,
      "Translate Urdu→EN": `Translate this document to natural English:\n\n${text}`,
    };
    const res = await callAI([{ role: "user", content: prompts[mode] }]);
    setBusy(false); if (res.ok) setOut(res.text); else setErr(res.error);
  };
  return <div><THead icon="📚" title="Document AI" sub="Summary, key points, Q&A and English ↔ Urdu translation — from Nova's AI service." /><NoKeyNotice ctx={ctx} />
    <div className="card p-4">
      <label className="btn-ghost inline-block cursor-pointer text-sm">📎 Upload .txt / .md / .csv<input type="file" accept=".txt,.md,.csv,.json,.pdf,image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} /></label>
      {fileName && <span className="ml-2 text-sm text-violet-200">{fileName}</span>}
      <textarea className="inp mt-3 min-h-40" value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste the document text here" />
      <div className="mt-3 flex flex-wrap gap-1.5">{["Summary", "Key points", "Q&A", "Translate EN→Urdu", "Translate Urdu→EN"].map((m) => <button key={m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${mode === m ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-200"}`}>{m}</button>)}</div>
      {mode === "Q&A" && <input className="inp mt-3" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Your question about the document" />}
      <button disabled={busy} className="btn-primary mt-3" onClick={run}>{busy ? "Working…" : `Run: ${mode}`}</button>
      {err && <p className="mt-2 rounded-xl bg-amber-500/15 px-3 py-2 text-sm text-amber-100">{err}</p>}
      {out && <div className="mt-3 rounded-xl bg-black/30 p-4"><p className="whitespace-pre-wrap text-sm leading-relaxed text-violet-50" dir={/Urdu/.test(mode) ? "rtl" : "ltr"}>{out}</p><button className="btn-ghost mt-2 text-xs" onClick={() => { navigator.clipboard?.writeText(out); ctx.toast("Copied."); }}>Copy</button></div>}
    </div></div>;
}

/* 7 — SHEET AI */
function SheetTool({ ctx }: { ctx: Ctx }) {
  const [mode, setMode] = useState<"csv" | "formula">("csv"); const [desc, setDesc] = useState("");
  const [out, setOut] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const run = async () => {
    if (!desc.trim()) { setErr("Describe the sheet or calculation first."); return; }
    const chk = await ctx.bumpUsage("sheet");
    if (!chk.allowed) { setErr(chk.error || "Daily limit reached."); return; }
    setBusy(true); setErr("");
    const promptText = mode === "csv"
      ? `Create spreadsheet data for: ${desc}. Return ONLY CSV (header row + at least 8 realistic example rows). No explanation, no markdown fences.`
      : `Give the exact Excel/Google Sheets formula for this calculation: ${desc}. Format:\nFORMULA: <the formula>\nEXPLANATION: <plain-language explanation of each part>\nEXAMPLE: <one worked example>`;
    const res = await callAI([{ role: "user", content: promptText }]);
    setBusy(false); if (res.ok) setOut(res.text.replace(/```csv|```/g, "").trim()); else setErr(res.error);
  };
  return <div><THead icon="📊" title="Sheet AI" sub={ctx.isPro ? "Unlimited." : `Free: ${ctx.usage.sheet ?? 0}/${ctx.settings.limit_free_sheet || 3} per day.`} /><NoKeyNotice ctx={ctx} />
    <div className="card p-4">
      <div className="flex gap-1.5"><button onClick={() => setMode("csv")} className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === "csv" ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-200"}`}>Describe → CSV sheet</button><button onClick={() => setMode("formula")} className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === "formula" ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-200"}`}>Describe → Formula</button></div>
      <textarea className="inp mt-3 min-h-24" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={mode === "csv" ? "e.g. monthly expenses sheet with date, item, category, amount" : "e.g. sum of column C only where column B says Lahore"} />
      <button disabled={busy} className="btn-primary mt-3" onClick={run}>{busy ? "Working…" : mode === "csv" ? "Generate CSV" : "Get Formula"}</button>
      {err && <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}
      {out && <div className="mt-3 rounded-xl bg-black/30 p-4"><pre className="overflow-x-auto whitespace-pre-wrap text-sm text-violet-50">{out}</pre>
        <div className="mt-2 flex gap-1.5">{mode === "csv" && <button className="btn-primary px-4 py-2 text-xs" onClick={() => download("nova-sheet.csv", out, "text/csv")}>Download CSV (opens in Excel)</button>}<button className="btn-ghost text-xs" onClick={() => { navigator.clipboard?.writeText(out); ctx.toast("Copied."); }}>Copy</button></div></div>}
    </div></div>;
}

/* 8 — EXPENSE & TASK PLANNER */
type Expense = { id: string; amount: number; category: string; note: string; date: string };
type Task = { id: string; title: string; due: string; done: boolean };
function PlannerTool({ ctx }: { ctx: Ctx }) {
  const uid = ctx.user?.id ?? null;
  const [expenses, setExpenses] = useState<Expense[]>([]); const [tasks, setTasks] = useState<Task[]>([]);
  const [amt, setAmt] = useState(""); const [cat, setCat] = useState("Food"); const [note, setNote] = useState("");
  const [title, setTitle] = useState(""); const [due, setDue] = useState("");
  useEffect(() => { (async () => { setExpenses(await loadCollection("planner:expenses", uid, [])); setTasks(await loadCollection("planner:tasks", uid, [])); })(); }, [uid]); // eslint-disable-line
  const today = new Date().toISOString().slice(0, 10); const month = today.slice(0, 7);
  const todayTotal = expenses.filter((e) => e.date === today).reduce((s, e) => s + e.amount, 0);
  const monthExpenses = expenses.filter((e) => e.date.startsWith(month));
  const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const byCat = useMemo(() => { const m: Record<string, number> = {}; monthExpenses.forEach((e) => (m[e.category] = (m[e.category] || 0) + e.amount)); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [expenses]); // eslint-disable-line
  const saveE = (n: Expense[]) => { setExpenses(n); saveCollection("planner:expenses", uid, n); };
  const saveT = (n: Task[]) => { setTasks(n); saveCollection("planner:tasks", uid, n); };

  return <div><THead icon="✅" title="Expense & Task Planner" sub="Free forever — the daily habit tool. Saved to your account." />
    <div className="grid grid-cols-3 gap-3"><div className="card p-4 text-center"><p className="text-xs text-violet-300/70">Today</p><p className="text-xl font-extrabold text-white">{money(todayTotal)}</p></div>
      <div className="card p-4 text-center"><p className="text-xs text-violet-300/70">This month</p><p className="text-xl font-extrabold text-white">{money(monthTotal)}</p></div>
      <div className="card p-4 text-center"><p className="text-xs text-violet-300/70">Open tasks</p><p className="text-xl font-extrabold text-white">{tasks.filter((t) => !t.done).length}</p></div></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="card p-4"><h3 className="font-bold text-white">Add expense</h3>
        <div className="mt-2 grid grid-cols-2 gap-2"><input className="inp" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Amount (Rs)" />
          <select className="inp" value={cat} onChange={(e) => setCat(e.target.value)}>{["Food", "Transport", "Bills", "Shopping", "Health", "Business", "Other"].map((c) => <option key={c}>{c}</option>)}</select></div>
        <input className="inp mt-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
        <button className="btn-primary mt-2 w-full" onClick={() => { const a = Number(amt); if (!a) { ctx.toast("Enter an amount."); return; } saveE([{ id: Date.now().toString(), amount: a, category: cat, note, date: today }, ...expenses]); setAmt(""); setNote(""); ctx.toast("Expense saved."); }}>Save Expense</button>
        {byCat.length > 0 && <div className="mt-4"><p className="text-xs font-bold text-violet-200">This month by category</p>{byCat.map(([c, v]) => <div key={c} className="mt-1.5 flex items-center gap-2 text-sm"><span className="w-24 text-violet-100">{c}</span><div className="h-2 flex-1 rounded bg-white/10"><div className="h-2 rounded bg-violet-500" style={{ width: `${Math.min(100, (v / Math.max(1, monthTotal)) * 100)}%` }} /></div><span className="text-violet-200">{money(v)}</span></div>)}</div>}
        <div className="mt-4 max-h-56 space-y-1 overflow-auto">{expenses.slice(0, 30).map((e) => <div key={e.id} className="flex gap-2 rounded-lg bg-black/25 px-3 py-1.5 text-sm"><span className="flex-1 text-violet-100">{e.date} · {e.category}{e.note ? ` · ${e.note}` : ""}</span><b className="text-white">{money(e.amount)}</b><button className="text-red-300" onClick={() => saveE(expenses.filter((x) => x.id !== e.id))}>✕</button></div>)}
        {expenses.length === 0 && <p className="text-sm text-violet-200/60">No expenses yet — add your first one.</p>}</div></div>
      <div className="card h-fit p-4"><h3 className="font-bold text-white">Tasks</h3>
        <div className="mt-2 flex gap-2"><input className="inp flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" /><input className="inp w-40" type="date" value={due} onChange={(e) => setDue(e.target.value)} /><button className="btn-primary" onClick={() => { if (!title.trim()) return; saveT([{ id: Date.now().toString(), title, due, done: false }, ...tasks]); setTitle(""); }}>Add</button></div>
        <div className="mt-3 space-y-1.5">{tasks.map((t) => <div key={t.id} className="flex items-center gap-2 rounded-lg bg-black/25 px-3 py-2 text-sm"><input type="checkbox" checked={t.done} onChange={() => saveT(tasks.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} /><span className={`flex-1 ${t.done ? "text-violet-300/50 line-through" : "text-violet-50"}`}>{t.title}</span>{t.due && <span className="text-xs text-violet-300/70">{t.due}</span>}<button className="text-red-300" onClick={() => saveT(tasks.filter((x) => x.id !== t.id))}>✕</button></div>)}
        {tasks.length === 0 && <p className="text-sm text-violet-200/60">No tasks yet.</p>}</div></div>
    </div></div>;
}

/* 9 — VOICE STUDIO */
function VoiceTool({ ctx }: { ctx: Ctx }) {
  const [text, setText] = useState(""); const [rate, setRate] = useState(1); const [lang, setLang] = useState("ur-PK");
  const [transcript, setTranscript] = useState(""); const [note, setNote] = useState("");
  const speak = () => {
    if (!text.trim()) return;
    const u = new SpeechSynthesisUtterance(text); u.rate = rate; u.lang = lang;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  };
  const listen = () => {
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => { lang: string; onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void; onerror: () => void; start: () => void } }).webkitSpeechRecognition;
    if (!SR) { setNote("Voice-to-text is not supported in this browser, and your AI provider transcription is not connected here. Use Chrome on Android for built-in voice typing — Nova will not fake a transcript."); return; }
    const rec = new SR(); rec.lang = lang;
    rec.onresult = (e) => setTranscript(e.results[0][0].transcript);
    rec.onerror = () => setNote("Voice recognition failed on this device — nothing was transcribed.");
    rec.start(); setNote("Listening… speak now.");
  };
  return <div><THead icon="🎙️" title="Voice Studio" sub="Read text aloud with the device voice (Urdu + English), plus voice notes to text." />
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4"><h3 className="font-bold text-white">(a) Read aloud</h3>
        <textarea className="inp mt-2 min-h-32" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste text — English or Urdu" dir="auto" />
        <div className="mt-3 flex flex-wrap items-center gap-2">{[["ur-PK", "Urdu voice"], ["en-US", "English voice"]].map(([l, n]) => <button key={l} onClick={() => setLang(l)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${lang === l ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-200"}`}>{n}</button>)}
          <label className="text-xs text-violet-200">Speed {rate}×</label><input type="range" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => setRate(Number(e.target.value))} /></div>
        <div className="mt-3 flex gap-2"><button className="btn-primary flex-1" onClick={speak}>▶ Read Aloud</button><button className="btn-ghost" onClick={() => speechSynthesis.cancel()}>Stop</button></div></div>
      <div className="card h-fit p-4"><h3 className="font-bold text-white">(b) Voice note → text</h3>
        <p className="mt-1 text-sm text-violet-200/70">Uses your device&apos;s speech recognition where available. If your AI provider supports transcription it can be wired in by the owner — otherwise Nova says so honestly.</p>
        <button className="btn-primary mt-3" onClick={listen}>🎙️ Start Listening</button>
        {note && <p className="mt-2 rounded-xl bg-violet-500/10 px-3 py-2 text-sm text-violet-100">{note}</p>}
        {transcript && <div className="mt-3 rounded-xl bg-black/30 p-3"><p className="text-sm text-violet-50" dir="auto">{transcript}</p><button className="btn-ghost mt-2 text-xs" onClick={() => { navigator.clipboard?.writeText(transcript); ctx.toast("Copied."); }}>Copy transcript</button></div>}</div>
    </div></div>;
}

/* 10 — IMAGE PROMPT STUDIO */
function ImgPromptTool({ ctx }: { ctx: Ctx }) {
  const [subject, setSubject] = useState(""); const [style, setStyle] = useState("Photorealistic"); const [lighting, setLighting] = useState("Golden hour"); const [ratio, setRatio] = useState("16:9 landscape");
  const out = subject.trim() ? `${subject}, ${style.toLowerCase()} style, ${lighting.toLowerCase()} lighting, ${ratio} composition, ultra detailed, sharp focus, professional quality, no text, no watermark` : "";
  return <div><THead icon="✨" title="Image Prompt Studio" sub="Guided builder that writes a professional image prompt — free." />
    <div className="card p-4">
      <label className="lbl">Subject</label><input className="inp" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. a small mobile shop in a Pakistani bazaar" />
      <label className="lbl mt-4">Style</label><div className="flex flex-wrap gap-1.5">{["Photorealistic", "Cinematic", "Anime", "3D render", "Watercolor", "Minimal flat illustration", "Product photography"].map((s) => <button key={s} onClick={() => setStyle(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${style === s ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-200"}`}>{s}</button>)}</div>
      <label className="lbl mt-4">Lighting</label><div className="flex flex-wrap gap-1.5">{["Golden hour", "Soft studio", "Neon night", "Bright daylight", "Moody dramatic"].map((s) => <button key={s} onClick={() => setLighting(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${lighting === s ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-200"}`}>{s}</button>)}</div>
      <label className="lbl mt-4">Ratio</label><div className="flex flex-wrap gap-1.5">{["16:9 landscape", "1:1 square", "9:16 portrait (Reels)", "4:5 Instagram"].map((s) => <button key={s} onClick={() => setRatio(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${ratio === s ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-200"}`}>{s}</button>)}</div>
      {out ? <div className="mt-4 rounded-xl bg-black/30 p-4"><p className="text-sm leading-relaxed text-violet-50">{out}</p>
        <div className="mt-3 flex gap-2"><button className="btn-ghost text-xs" onClick={() => { navigator.clipboard?.writeText(out); ctx.toast("Prompt copied."); }}>Copy prompt</button>
        <button className="btn-primary px-4 py-2 text-xs" onClick={() => ctx.goto("image", out)}>Open in Image Generate →</button></div></div>
        : <p className="mt-4 text-sm text-violet-200/60">Type a subject to build your prompt.</p>}
    </div></div>;
}
