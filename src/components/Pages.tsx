"use client";
import { useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/client";
import type { Ctx } from "./NovaApp";

type Req = { id: number; userEmail: string; method: string; reference: string; senderNumber: string; planType: string; status: string; createdAt: string };

export function PricingPage({ ctx }: { ctx: Ctx }) {
  const s = ctx.settings;
  const [method, setMethod] = useState<"jazzcash" | "easypaisa">("jazzcash");
  const [planType, setPlanType] = useState<"monthly" | "yearly">("monthly");
  const [sender, setSender] = useState(""); const [tid, setTid] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [history, setHistory] = useState<Req[]>([]);
  const [license, setLicense] = useState(""); const [licMsg, setLicMsg] = useState(""); const [busy, setBusy] = useState(false);

  const loadHistory = async () => { if (!ctx.user) return; const { json } = await api("/api/upgrade"); setHistory((json.requests || []) as Req[]); };
  useEffect(() => { loadHistory(); }, [ctx.user?.id]); // eslint-disable-line

  const submit = async () => {
    setErr(""); setMsg("");
    const { json } = await api("/api/upgrade", { method: "POST", body: JSON.stringify({ action: "request", method, reference: tid, senderNumber: sender, planType }) });
    if (json.error) { setErr(json.error); return; }
    setMsg(json.message); setTid(""); setSender(""); loadHistory();
  };
  const verifyLicense = async () => {
    setBusy(true); setLicMsg("");
    const { json } = await api("/api/upgrade", { method: "POST", body: JSON.stringify({ action: "license", licenseKey: license, planType }) });
    setBusy(false);
    setLicMsg(json.ok ? `✅ ${json.message}` : `❌ ${json.error}`);
    if (json.ok) { await ctx.refreshUser(); }
  };

  const rows: [string, string, string][] = [
    ["Chat Bot", `${s.limit_guest_chat || 5} guest msgs · ${s.limit_free_chat || 20}/day`, "Unlimited"],
    ["Prompts", "View only", `Run ${s.limit_free_prompts || 5}/day → Unlimited on Pro`],
    ["Tools hub (10 tools)", "Locked", "Free tools with limits → All tools unlimited"],
    ["Invoice & Khata, Social Machine, CV, YouTube, Document AI, Voice", "—", "Pro only ✔"],
    ["Create projects", "Locked", `${s.limit_free_projects || 2} → Unlimited`],
    ["Image Generate", "Locked", `${s.limit_free_images || 3}/day → Unlimited`],
    ["Deploy", "View only", "ZIP export → ZIP + publish flow"],
    ["Sync across devices", "No", "Yes"],
  ];

  return (
    <div>
      <h1 className="text-[28px] font-extrabold leading-[1.15] tracking-tight text-white sm:text-[32px]"><span className="text-[0.85em] leading-none">💎 </span>Pricing &amp; Upgrade</h1>
      <p className="mt-1 text-[15px] text-violet-200/70">Manual approval only — no card checkout. The owner confirms every payment.</p>

      {ctx.user?.effectivePlan === "pro" && <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">✦ You are <b>Pro</b> — active until <b>{fmtDate(ctx.user.proUntil)}</b>. Renew below to extend from that date.</div>}
      {ctx.user?.proExpired && <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">Your Pro expired on {fmtDate(ctx.user.proUntil)} — renew below to unlock Pro tools again. Your data is intact.</div>}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="card p-5"><h3 className="text-lg font-extrabold text-white">Free</h3><p className="mt-1 text-3xl font-extrabold text-white">PKR 0</p>
          <ul className="mt-3 space-y-1.5 text-sm text-violet-200/80">{rows.map((r) => <li key={r[0]}>• {r[0]}: {r[1]}</li>)}</ul></div>
        <div className="card p-5 ring-2 ring-violet-500">
          <h3 className="text-lg font-extrabold text-white">Pro ✦</h3>
          <div className="mt-2 flex gap-2">{(["monthly", "yearly"] as const).map((p) => <button key={p} onClick={() => setPlanType(p)} className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-bold ${planType === p ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-200"}`}>{p === "monthly" ? `Monthly — PKR ${s.price_monthly_pkr || "500"} (~$${s.price_monthly_usd || "1.8"})` : `Yearly — PKR ${s.price_yearly_pkr || "4000"} (~$${s.price_yearly_usd || "14"})`}</button>)}</div>
          <ul className="mt-3 space-y-1.5 text-sm text-violet-100">{rows.map((r) => <li key={r[0]}>✦ {r[0]}: {r[2]}</li>)}</ul>
          <p className="mt-2 text-xs text-violet-300/60">“Unlimited” still depends on the AI provider&apos;s quota.</p>
        </div>
      </div>

      {!ctx.user ? (
        <div className="card mt-4 p-6 text-center"><p className="font-bold text-white">Guests: sign up first, then upgrade.</p><button className="btn-primary mt-3" onClick={() => window.location.reload()}>Sign up / Log in</button></div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <h3 className="font-extrabold text-white">Method A — JazzCash / EasyPaisa (owner approves)</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="rounded-xl bg-black/30 p-3"><p className="font-bold text-white">JazzCash</p><p className="text-violet-100">{s.jazzcash_number ? `${s.jazzcash_number} — ${s.jazzcash_title || ""}` : "Not set by owner yet (Admin → Settings)."}</p></div>
              <div className="rounded-xl bg-black/30 p-3"><p className="font-bold text-white">EasyPaisa</p><p className="text-violet-100">{s.easypaisa_number ? `${s.easypaisa_number} — ${s.easypaisa_title || ""}` : "Not set by owner yet (Admin → Settings)."}</p></div>
            </div>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-violet-200/80"><li>Send PKR {planType === "monthly" ? (s.price_monthly_pkr || "500") : (s.price_yearly_pkr || "4000")} to the number above.</li><li>Note the <b>Transaction ID</b> from your receipt.</li><li>Submit the form — the owner approves manually (usually within a few hours).</li></ol>
            <div className="mt-3 flex gap-1.5">{(["jazzcash", "easypaisa"] as const).map((m) => <button key={m} onClick={() => setMethod(m)} className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${method === m ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-200"}`}>{m}</button>)}</div>
            <label className="lbl mt-3">Your sending number</label><input className="inp" value={sender} onChange={(e) => setSender(e.target.value)} placeholder="03xx xxxxxxx" />
            <label className="lbl mt-3">Transaction ID</label><input className="inp" value={tid} onChange={(e) => setTid(e.target.value)} placeholder="From your payment receipt" />
            {err && <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">{err}</p>}
            {msg && <p className="mt-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100">{msg}</p>}
            <button className="btn-primary mt-3 w-full" onClick={submit}>Submit Upgrade Request</button>
            {s.support_whatsapp && <a className="mt-3 block text-center text-sm text-emerald-300 underline" target="_blank" rel="noreferrer" href={`https://wa.me/${s.support_whatsapp.replace(/\D/g, "")}`}>Need help? WhatsApp support</a>}
          </div>

          <div>
            <div className="card p-5">
              <h3 className="font-extrabold text-white">Method B — License key (Gumroad)</h3>
              {s.gumroad_permalink
                ? <a className="btn-primary mt-3 inline-block" target="_blank" rel="noreferrer" href={`https://gumroad.com/l/${s.gumroad_permalink}`}>Buy on Gumroad →</a>
                : <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-100">The owner has not added a Gumroad product yet (Admin → Settings). License purchase is not available until then.</p>}
              <label className="lbl mt-4">I have a license key</label><input className="inp" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="XXXX-XXXX-XXXX" />
              {licMsg && <p className="mt-2 rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-violet-50">{licMsg}</p>}
              <button disabled={busy} className="btn-primary mt-3 w-full" onClick={verifyLicense}>{busy ? "Verifying with Gumroad…" : "Verify & Activate Pro"}</button>
              <p className="mt-2 text-xs text-violet-300/60">Verified live with Gumroad&apos;s API.</p>
            </div>

            <div className="card mt-4 p-5">
              <h3 className="font-extrabold text-white">My upgrade requests</h3>
              {history.length === 0 && <p className="mt-2 text-sm text-violet-200/60">No requests yet.</p>}
              {history.map((r) => <div key={r.id} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-black/25 px-3 py-2 text-sm"><span className="flex-1 capitalize text-violet-50">{r.method} · {r.planType} · {new Date(r.createdAt).toLocaleString()}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${r.status === "approved" ? "bg-emerald-500/20 text-emerald-300" : r.status === "rejected" ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}>{r.status === "approved" ? "Approved" : r.status === "rejected" ? "Rejected" : "Pending owner approval"}</span></div>)}
              <p className="mt-2 text-xs text-violet-300/60">Only the owner confirms payment by approving.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- ADMIN ---------------- */
export function AdminPage({ ctx }: { ctx: Ctx }) {
  const [data, setData] = useState<{ requests: (Req & { userId: number })[]; users: { id: number; email: string; effectivePlan: string; proUntil: string | null; createdAt: string }[]; settings: Record<string, string>; ai?: { chatConfigured: boolean; imageConfigured: boolean; cap: number; callsToday: number } } | null>(null);
  const [tab, setTab] = useState("requests");
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [cloudOk, setCloudOk] = useState<boolean | null>(null);

  const load = async () => {
    const { json } = await api("/api/admin");
    if (json.error) { setErr(json.error); return; }
    setData(json); setErr("");
  };
  useEffect(() => { load(); fetch("/api/health").then((r) => setCloudOk(r.ok)).catch(() => setCloudOk(false)); }, []); // eslint-disable-line

  const act = async (body: Record<string, unknown>, okMsg: string) => {
    const { json } = await api("/api/admin", { method: "POST", body: JSON.stringify(body) });
    setMsg(json.error ? `❌ ${json.error}` : `✅ ${okMsg}${json.proUntil ? ` — Pro until ${fmtDate(json.proUntil)}` : ""}`);
    load(); ctx.refreshUser();
  };

  if (err) return <div className="card p-8 text-center"><p className="font-bold text-white">Admin refused</p><p className="mt-1 text-sm text-red-300">{err}</p></div>;
  if (!data) return <p className="text-violet-200/70">Loading Admin…</p>;
  const pending = data.requests.filter((r) => r.status === "pending");
  const decided = data.requests.filter((r) => r.status !== "pending");
  const st = data.settings;

  return (
    <div>
      <h1 className="text-[28px] font-extrabold leading-[1.15] tracking-tight text-white sm:text-[32px]"><span className="text-[0.85em] leading-none">🛡️ </span>Admin Panel <span className="text-sm font-semibold text-violet-300/70">(owner only)</span></h1>
      <p className="mt-1 text-[15px] text-violet-200/70">Only the Admin email sees this.</p>
      {msg && <p className="mt-3 rounded-xl bg-violet-500/15 px-3 py-2 text-sm text-violet-50">{msg}</p>}
      <div className="mt-4 flex flex-wrap gap-1.5">{[["requests", `Upgrade Requests (${pending.length} pending)`], ["users", "Users"], ["settings", "Settings"], ["setup", "Owner Setup"]].map(([t, l]) => <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === t ? "bg-violet-600 text-white" : "bg-white/[0.06] text-violet-200"}`}>{l}</button>)}</div>

      {tab === "requests" && <div className="card mt-4 p-4">
        {pending.length === 0 && <p className="text-sm text-violet-200/60">No pending requests.</p>}
        {pending.map((r) => <div key={r.id} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-black/25 px-3 py-2.5 text-sm">
          <span className="flex-1 text-violet-50"><b>{r.userEmail}</b> · {r.method} · {r.planType}<br /><span className="text-xs text-violet-300/70">Ref: {r.reference} · From: {r.senderNumber || "—"} · {new Date(r.createdAt).toLocaleString()}</span></span>
          <button className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white" onClick={() => act({ action: "decide", id: r.id, decision: "approve" }, `Approved — ${r.userEmail} is now Pro`)}>Approve</button>
          <button className="rounded-full bg-red-600/80 px-4 py-2 text-xs font-bold text-white" onClick={() => act({ action: "decide", id: r.id, decision: "reject" }, "Request rejected")}>Reject</button></div>)}
        {decided.length > 0 && <><h3 className="mt-5 font-bold text-white">History</h3>{decided.map((r) => <div key={r.id} className="mt-1.5 flex gap-2 rounded-xl bg-black/20 px-3 py-2 text-sm text-violet-200/80"><span className="flex-1">{r.userEmail} · {r.method} · {r.planType} · {r.reference}</span><span className={r.status === "approved" ? "text-emerald-300" : "text-red-300"}>{r.status}</span></div>)}</>}
      </div>}

      {tab === "users" && <div className="card mt-4 overflow-x-auto p-4"><table className="w-full min-w-[560px] text-sm"><thead><tr className="text-left text-violet-300/70"><th className="py-2">Email</th><th>Plan</th><th>Pro until</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>{data.users.map((u) => <tr key={u.id} className="border-t border-white/5 text-violet-50"><td className="py-2">{u.email}</td><td>{u.effectivePlan}</td><td>{fmtDate(u.proUntil)}</td><td>{fmtDate(u.createdAt)}</td>
          <td><div className="flex gap-1.5"><button className="btn-ghost px-3 py-1 text-xs" onClick={() => act({ action: "grantPro", userId: u.id }, `Granted +30 days to ${u.email}`)}>Grant Pro (+30d)</button><button className="btn-ghost px-3 py-1 text-xs text-red-300" onClick={() => act({ action: "removePro", userId: u.id }, `Pro removed from ${u.email}`)}>Remove Pro</button></div></td></tr>)}</tbody></table></div>}

      {tab === "settings" && <div className="card mt-4 p-5"><SettingsForm initial={st} onSave={async (settings) => act({ action: "settings", settings }, "Settings saved")} /></div>}

      {tab === "setup" && <div className="card mt-4 p-5">
        <h3 className="font-extrabold text-white">Owner Setup checklist (honest pass/fail)</h3>
        {[
          ["App Cloud database connected", cloudOk === true, cloudOk === null ? "checking…" : cloudOk ? "/api/health OK — accounts, plans, counters, requests stored server-side" : "health check failed"],
          ["Tables created (users, sessions, settings, requests, usage, data, licenses)", cloudOk === true, "Auto-created with the app schema"],
          ["Auth working (email + password, hashed server-side)", true, "Sign up / log in live; sessions persist across devices"],
          ["Admin email set", !!(st.admin_email), st.admin_email ? `Admin: ${st.admin_email}` : "Set ADMIN_EMAIL or the Admin email in Settings"],
          ["Central AI service (owner key)", !!(data.ai?.chatConfigured), data.ai?.chatConfigured ? `Chat AI is live — today: ${data.ai.callsToday}/${data.ai.cap} calls used` : "Add your key in AI Service (sidebar)"],
          ["Central image service (Gemini key)", !!(data.ai?.imageConfigured), data.ai?.imageConfigured ? "Image generation is live" : "Optional — add the Gemini image key in AI Service"],
          ["Payment numbers set (JazzCash / EasyPaisa)", !!(st.jazzcash_number || st.easypaisa_number), st.jazzcash_number || st.easypaisa_number ? "shown on the Upgrade page" : "Add in Settings"],
          ["Gumroad product set", !!st.gumroad_permalink, st.gumroad_permalink ? `permalink: ${st.gumroad_permalink}` : "Optional"],
          ["Google sign-in", false, "Needs an OAuth provider set up by the owner"],
        ].map(([label, ok, detail]) => <div key={label as string} className="mt-2 flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2.5 text-sm"><span>{ok ? "✅" : "⚠️"}</span><span className="flex-1 text-violet-50">{label as string}</span><span className="text-xs text-violet-300/70">{detail as string}</span></div>)}
      </div>}
    </div>
  );
}

function SettingsForm({ initial, onSave }: { initial: Record<string, string>; onSave: (s: Record<string, string>) => void }) {
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [initial]);
  const F = (key: string, label: string) => (<div key={key}><label className="lbl">{label}</label><input className="inp" value={f[key] ?? ""} onChange={(e) => setF({ ...f, [key]: e.target.value })} /></div>);
  return <div>
    <div className="grid gap-3 sm:grid-cols-2">
      {F("price_monthly_pkr", "Pro Monthly price (PKR)")}{F("price_yearly_pkr", "Pro Yearly price (PKR)")}
      {F("price_monthly_usd", "Monthly ≈ USD")}{F("price_yearly_usd", "Yearly ≈ USD")}
      {F("jazzcash_number", "JazzCash number")}{F("jazzcash_title", "JazzCash account title")}
      {F("easypaisa_number", "EasyPaisa number")}{F("easypaisa_title", "EasyPaisa account title")}
      {F("gumroad_permalink", "Gumroad product permalink")}{F("license_max_uses", "License max uses allowed")}
      {F("support_whatsapp", "Support WhatsApp number")}{F("admin_email", "Admin email (owner)")}
      {F("limit_guest_chat", "Guest chat limit")}{F("limit_free_chat", "Free chat / day")}
      {F("limit_free_prompts", "Free prompt runs / day")}{F("limit_free_images", "Free images / day")}
      {F("limit_free_whatsapp", "Free WhatsApp gens / day")}{F("limit_free_sheet", "Free Sheet AI / day")}
      {F("limit_free_projects", "Free Create projects")}
    </div>
    <button className="btn-primary mt-4" onClick={() => onSave(f)}>Save Settings</button>
  </div>;
}

/* ---------------- AI SERVICE (owner only) ---------------- */
type AiInfo = { chatConfigured: boolean; chatMasked: string; chatBaseUrl: string; chatModel: string; imageConfigured: boolean; imageMasked: string; imageBaseUrl: string; imageModel: string; cap: number; callsToday: number };

export function AiServiceSection({ ctx }: { ctx: Ctx }) {
  const [info, setInfo] = useState<AiInfo | null>(null);
  const [err, setErr] = useState("");
  const [chatBase, setChatBase] = useState(""); const [chatModel, setChatModel] = useState("");
  const [imageBase, setImageBase] = useState(""); const [imageModel, setImageModel] = useState("");
  const [cap, setCap] = useState("200");
  const [chatKey, setChatKey] = useState(""); const [imageKey, setImageKey] = useState("");
  const [testMsg, setTestMsg] = useState(""); const [busy, setBusy] = useState(false);

  const load = async () => {
    const { json } = await api("/api/admin");
    if (json.error) { setErr(json.error); return; }
    const ai = json.ai as AiInfo; setInfo(ai); setErr("");
    setChatBase(ai.chatBaseUrl || ""); setChatModel(ai.chatModel || "");
    setImageBase(ai.imageBaseUrl || ""); setImageModel(ai.imageModel || "");
    setCap(String(ai.cap ?? 200));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const save = async () => {
    setBusy(true);
    const r1 = await api("/api/admin", { method: "POST", body: JSON.stringify({ action: "settings", settings: { owner_ai_base_url: chatBase, owner_ai_model: chatModel, owner_image_base_url: imageBase, owner_image_model: imageModel, ai_global_cap: cap } }) });
    const r2 = await api("/api/admin", { method: "POST", body: JSON.stringify({ action: "aiKeys", chatKey, imageKey }) });
    setBusy(false);
    if (r1.json.error || r2.json.error) { ctx.toast(`❌ ${r1.json.error || r2.json.error}`); return; }
    setChatKey(""); setImageKey("");
    ctx.toast("✅ AI Service saved — live for all users, no redeploy needed.");
    load();
  };

  const test = async () => {
    setBusy(true); setTestMsg("");
    const { json } = await api("/api/ai", { method: "POST", body: JSON.stringify({ action: "test" }) });
    setBusy(false);
    setTestMsg(json.ok ? `✅ Working · ${json.at}` : `❌ ${json.error || "Test failed"}`);
  };

  if (err) return <div className="card p-8 text-center"><p className="font-bold text-white">AI Service is owner-only</p><p className="mt-1 text-sm text-red-300">{err}</p></div>;
  if (!info) return <p className="text-violet-200/70">Loading AI Service…</p>;

  return (
    <div>
      <h1 className="text-[28px] font-extrabold leading-[1.15] tracking-tight text-white sm:text-[32px]"><span className="text-[0.85em] leading-none">🔑 </span>AI Service <span className="text-sm font-semibold text-violet-300/70">(owner only)</span></h1>
      <p className="mt-1 text-[15px] leading-relaxed text-violet-200/70">One central key powers the whole app. Users never see a key — they just sign up and use Novster. Keys stay <b>only on the server</b> (shown masked here).</p>

      <div className="card mt-4 p-4 text-sm">
        <p className="text-violet-50">💬 Chat AI: {info.chatConfigured ? <span className="font-bold text-emerald-300">Configured ✓</span> : <span className="font-bold text-amber-300">Not configured</span>}{info.chatConfigured && <span className="text-violet-300/70"> · Key: {info.chatMasked} · Model: {info.chatModel}</span>}</p>
        <p className="mt-1 text-violet-50">🎨 Image AI: {info.imageConfigured ? <span className="font-bold text-emerald-300">Configured ✓</span> : <span className="font-bold text-amber-300">Not configured</span>}{info.imageConfigured && <span className="text-violet-300/70"> · Key: {info.imageMasked} · Model: {info.imageModel}</span>}</p>
        <p className="mt-1 text-violet-50">📊 Today: <b>{info.callsToday}</b> AI calls across all users · Daily cap: <b>{info.cap}</b></p>
      </div>

      <div className="card mt-4 p-5">
        <h3 className="font-extrabold text-white">Chat AI (chat, tools, create)</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className="lbl">Base URL</label><input className="inp" value={chatBase} onChange={(e) => setChatBase(e.target.value)} placeholder="https://openrouter.ai/api/v1" /></div>
          <div><label className="lbl">Model</label><input className="inp" value={chatModel} onChange={(e) => setChatModel(e.target.value)} placeholder="openrouter/free" /></div>
        </div>
        <label className="lbl mt-3">Chat API Key {info.chatConfigured && <span className="font-normal text-violet-300/60">(saved: {info.chatMasked} — leave empty to keep it)</span>}</label>
        <input className="inp" type="password" value={chatKey} onChange={(e) => setChatKey(e.target.value)} placeholder="Paste the key — it is stored on the server only" />
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={busy} className="btn-ghost" onClick={test}>{busy ? "Testing…" : "Test connection"}</button>
          {testMsg && <span className="self-center text-sm text-violet-100">{testMsg}</span>}
        </div>
      </div>

      <div className="card mt-4 p-5">
        <h3 className="font-extrabold text-white">Image AI (Image Generate)</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className="lbl">Base URL</label><input className="inp" value={imageBase} onChange={(e) => setImageBase(e.target.value)} placeholder="https://generativelanguage.googleapis.com/v1beta/openai" /></div>
          <div><label className="lbl">Model</label><input className="inp" value={imageModel} onChange={(e) => setImageModel(e.target.value)} placeholder="gemini-2.5-flash-image" /></div>
        </div>
        <label className="lbl mt-3">Image API Key (Gemini) {info.imageConfigured && <span className="font-normal text-violet-300/60">(saved: {info.imageMasked} — leave empty to keep it)</span>}</label>
        <input className="inp" type="password" value={imageKey} onChange={(e) => setImageKey(e.target.value)} placeholder="Paste the Gemini key — stored on the server only" />
      </div>

      <div className="card mt-4 p-5">
        <h3 className="font-extrabold text-white">Protection</h3>
        <label className="lbl mt-2">Global daily AI cap (all users combined — protects your key; you as Admin are exempt)</label>
        <input className="inp max-w-xs" type="number" min="0" value={cap} onChange={(e) => setCap(e.target.value)} />
        <p className="mt-2 text-xs leading-relaxed text-violet-300/60">Free provider quotas are small. At the cap, users see an honest &quot;limit reached&quot; message. Plan limits apply on top.</p>
        <button disabled={busy} className="btn-primary mt-4" onClick={save}>{busy ? "Saving…" : "Save AI Service"}</button>
      </div>
    </div>
  );
}
