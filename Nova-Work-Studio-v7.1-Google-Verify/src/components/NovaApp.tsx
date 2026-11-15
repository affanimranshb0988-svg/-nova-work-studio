"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ls, setLs, todayKey, fmtDate, type SafeUser, type Settings } from "@/lib/client";
import { ChatSection, PromptsSection, CreateSection, ImageSection, DatabaseSection, DeploySection } from "./Sections";
import { ToolsHub } from "./Tools";
import { PricingPage, AdminPage, AiServiceSection } from "./Pages";

export type Section = "chat" | "prompts" | "tools" | "create" | "image" | "api" | "database" | "deploy" | "pricing" | "admin";
export type Ctx = {
  user: SafeUser; plan: "guest" | "free" | "pro"; isPro: boolean;
  settings: Settings;
  goto: (s: Section, payload?: string) => void; toast: (m: string) => void;
  refreshUser: () => Promise<void>; bumpUsage: (kind: string) => Promise<{ allowed: boolean; used?: number; limit?: number | null; error?: string }>;
  usage: Record<string, number>; carryPrompt: string; setCarryPrompt: (s: string) => void;
  installPrompt: Event | null; guestChat: number; setGuestChat: (n: number) => void;
};

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: "chat", label: "Chat Bot", icon: "💬" },
  { id: "prompts", label: "Prompts", icon: "⚡" },
  { id: "tools", label: "Tools", icon: "🧰" },
  { id: "create", label: "Create", icon: "🛠️" },
  { id: "image", label: "Image Generate", icon: "🎨" },
  { id: "api", label: "AI Service", icon: "🔑" },
  { id: "database", label: "Database", icon: "🗄️" },
  { id: "deploy", label: "Deploy", icon: "🚀" },
];

export default function NovaApp() {
  const [user, setUser] = useState<SafeUser>(null);
  const [authReady, setAuthReady] = useState(false);
  const [guest, setGuest] = useState(false);
  const [section, setSection] = useState<Section>("chat");
  const [settings, setSettings] = useState<Settings>({});
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [toastMsg, setToastMsg] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [carryPrompt, setCarryPrompt] = useState("");
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [guestChat, setGuestChatState] = useState(0);
  const deferredRef = useRef<Event | null>(null);

  const plan: "guest" | "free" | "pro" = !user ? "guest" : user.effectivePlan;
  const isPro = plan === "pro";
  const toast = useCallback((m: string) => { setToastMsg(m); setTimeout(() => setToastMsg(""), 4200); }, []);
  const goto = useCallback((s: Section, payload?: string) => { if (payload !== undefined) setCarryPrompt(payload); setSection(s); setMenuOpen(false); setAccountOpen(false); window.scrollTo({ top: 0 }); }, []);

  const setGuestChat = useCallback((n: number) => { setGuestChatState(n); setLs("nova:guestChat", n); }, []);

  const refreshUser = useCallback(async () => {
    const { json } = await api("/api/auth");
    setUser(json.user ?? null); setAuthReady(true);
  }, []);

  useEffect(() => {
    refreshUser();
    api("/api/settings").then(({ json }) => setSettings(json.settings || {}));
    setGuestChatState(ls<number>("nova:guestChat", 0));
    const onBIP = (e: Event) => { e.preventDefault(); deferredRef.current = e; setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", onBIP);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, [refreshUser]);

  useEffect(() => {
    if (!user) return;
    api(`/api/usage?date=${todayKey()}`).then(({ json }) => {
      if (json.usage) setUsage({ chat: json.usage.chatCount, prompts: json.usage.promptRuns, images: json.usage.imagesCount, whatsapp: json.usage.whatsappCount, sheet: json.usage.sheetCount });
    });
  }, [user?.id]); // eslint-disable-line

  const bumpUsage = useCallback(async (kind: string) => {
    if (!user) { // guest: local-only counters
      if (kind === "chat") {
        const lim = Number(settings.limit_guest_chat || 5);
        if (guestChat >= lim) return { allowed: false, used: guestChat, limit: lim, error: `Guest limit reached (${lim} messages). Sign up free to continue.` };
        setGuestChat(guestChat + 1); return { allowed: true, used: guestChat + 1, limit: lim };
      }
      return { allowed: false, error: "Please sign up or log in to use this." };
    }
    const { json } = await api("/api/usage", { method: "POST", body: JSON.stringify({ kind, date: todayKey() }) });
    if (json.usage) setUsage({ chat: json.usage.chatCount, prompts: json.usage.promptRuns, images: json.usage.imagesCount, whatsapp: json.usage.whatsappCount, sheet: json.usage.sheetCount });
    return json as { allowed: boolean; used?: number; limit?: number | null; error?: string };
  }, [user, settings, guestChat, setGuestChat]);

  const logout = async () => { await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "logout" }) }); setUser(null); setGuest(false); setAccountOpen(false); toast("Logged out. Your cloud data is saved to your account."); };

  const ctx: Ctx = { user, plan, isPro, settings, goto, toast, refreshUser, bumpUsage, usage, carryPrompt, setCarryPrompt, installPrompt, guestChat, setGuestChat };

  if (!authReady) return <div className="grid min-h-screen place-items-center"><div className="text-center"><div className="text-5xl text-violet-400">✦</div><p className="mt-3 text-violet-200/70">Loading Nova Work Studio…</p></div></div>;
  if (!user && !guest) return <AuthScreen onAuthed={(u) => { setUser(u); }} onGuest={() => setGuest(true)} />;

  const badge = !user ? "Guest" : user.proExpired ? "Pro expired" : isPro ? "Pro" : "Free";

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 -translate-x-full bg-[#150b28]/95 backdrop-blur transition lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${menuOpen ? "translate-x-0" : ""} border-r border-violet-500/15 flex flex-col`}>
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-2xl text-white shadow-lg shadow-violet-900/50">✦</div>
          <div><p className="font-bold leading-tight text-white">Nova Work Studio</p><p className="text-xs text-violet-300/70">Version 2.0 · Pro Edition</p></div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {NAV.filter((n) => n.id !== "api" || user?.isAdmin).map((n, i) => (
            <button key={n.id} onClick={() => goto(n.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${section === n.id ? "bg-violet-600 text-white shadow-lg shadow-violet-950/40" : "text-violet-100/75 hover:bg-violet-500/10 hover:text-white"}`}>
              <span>{n.icon}</span><span className="flex-1">{i + 1}. {n.label}</span>
              {n.id === "tools" && <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-bold text-fuchsia-300">10 TOOLS</span>}
            </button>
          ))}
        </nav>
        {!isPro && (
          <div className="mx-3 mb-3 rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-600/25 to-fuchsia-600/15 p-4">
            <p className="text-sm font-bold text-white">✦ Go Pro</p>
            <p className="mt-1 text-xs leading-relaxed text-violet-200/80">Unlock all 10 tools, unlimited chat, images & projects.</p>
            <button onClick={() => goto("pricing")} className="mt-3 w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-2 text-sm font-bold text-white">Upgrade — PKR {settings.price_monthly_pkr || "500"}/mo</button>
          </div>
        )}
        {isPro && user?.proUntil && <div className="mx-3 mb-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-xs text-emerald-200">✦ Pro active until {fmtDate(user.proUntil)}</div>}
        <p className="px-5 pb-4 text-[11px] text-violet-300/40">Powered by Nova&apos;s built-in AI service — no keys needed.</p>
      </aside>
      {menuOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMenuOpen(false)} />}

      {/* Main */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-violet-500/15 bg-[#0d0716]/85 px-4 py-3 backdrop-blur">
          <button className="rounded-lg bg-violet-500/15 px-3 py-2 text-white lg:hidden" onClick={() => setMenuOpen(true)}>☰</button>
          <button onClick={() => goto("chat")} className="flex items-center gap-2 lg:hidden"><span className="text-xl text-violet-400">✦</span><span className="font-bold text-white">Nova Studio</span></button>
          <div className="ml-auto flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${badge === "Pro" ? "bg-emerald-500/20 text-emerald-300" : badge === "Pro expired" ? "bg-red-500/20 text-red-300" : "bg-violet-500/20 text-violet-200"}`}>{badge}{user && !isPro && !user.proExpired ? "" : ""}</span>
            {user && <span className="hidden text-xs text-violet-200/60 sm:block">{usage.chat !== undefined ? `Chat today: ${usage.chat ?? 0}${isPro ? "" : `/${settings.limit_free_chat || 20}`}` : ""}</span>}
            <div className="relative">
              <button onClick={() => setAccountOpen(!accountOpen)} className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 font-bold text-white">{user ? user.email.slice(0, 1).toUpperCase() : "G"}</button>
              {accountOpen && (
                <div className="absolute right-0 top-12 w-60 rounded-2xl border border-violet-500/20 bg-[#1a0f33] p-2 shadow-2xl">
                  <p className="px-3 py-2 text-xs text-violet-200/70">{user ? user.email : "Browsing as guest"}</p>
                  <MenuBtn label="👤 Profile" onClick={() => { goto("pricing"); }} />
                  <MenuBtn label="💎 My Plan" onClick={() => goto("pricing")} />
                  <MenuBtn label="⬆️ Upgrade" onClick={() => goto("pricing")} />
                  {user?.isAdmin && <MenuBtn label="🛡️ Admin" onClick={() => goto("admin")} />}
                  <MenuBtn label="📲 Install App" onClick={async () => { const dp = deferredRef.current as unknown as { prompt?: () => void } | null; if (dp?.prompt) dp.prompt(); else toast("Use Deploy → App Install checks, or browser menu → Add to Home Screen."); setAccountOpen(false); }} />
                  {user ? <MenuBtn label="🚪 Log out" onClick={logout} /> : <MenuBtn label="🔐 Log in / Sign up" onClick={() => setGuest(false)} />}
                </div>
              )}
            </div>
          </div>
        </header>

        {!user && <div className="mx-4 mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">You are in <b>Guest mode</b> — {settings.limit_guest_chat || 5} free chat messages, Tools locked. <button className="font-bold underline" onClick={() => setGuest(false)}>Create a free account</button> to save your work and sync across devices.</div>}
        {user?.proExpired && <div className="mx-4 mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">Your Pro expired on {fmtDate(user.proUntil)}. You are on Free now — your saved data is intact. <button className="font-bold underline" onClick={() => goto("pricing")}>Renew Pro</button></div>}

        <main className="mx-auto w-full max-w-6xl p-4 pb-24 sm:p-6">
          {section === "chat" && <ChatSection ctx={ctx} />}
          {section === "prompts" && <PromptsSection ctx={ctx} />}
          {section === "tools" && <ToolsHub ctx={ctx} />}
          {section === "create" && <CreateSection ctx={ctx} />}
          {section === "image" && <ImageSection ctx={ctx} />}
          {section === "api" && (user?.isAdmin ? <AiServiceSection ctx={ctx} /> : <div className="card p-8 text-center"><p className="text-lg font-bold text-white">Owner only</p><p className="mt-2 text-sm text-violet-200/70">The AI Service screen is only for the app owner.</p></div>)}
          {section === "database" && <DatabaseSection ctx={ctx} />}
          {section === "deploy" && <DeploySection ctx={ctx} />}
          {section === "pricing" && <PricingPage ctx={ctx} />}
          {section === "admin" && (user?.isAdmin ? <AdminPage ctx={ctx} /> : <div className="card p-8 text-center"><p className="text-lg font-bold text-white">Admin is restricted</p><p className="mt-2 text-sm text-violet-200/70">This area is only for the app owner. If you are the owner, log in with the Admin email.</p></div>)}
        </main>
      </div>
      {toastMsg && <div className="fixed bottom-5 left-1/2 z-50 w-[92%] max-w-md -translate-x-1/2 rounded-2xl border border-violet-400/30 bg-[#1d1040] px-4 py-3 text-center text-sm text-white shadow-2xl">{toastMsg}</div>}
    </div>
  );
}

function MenuBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-violet-100 hover:bg-violet-500/15">{label}</button>;
}

export function AuthScreen({ onAuthed, onGuest }: { onAuthed: (u: SafeUser) => void; onGuest: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [info, setInfo] = useState(""); const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError(""); setInfo("");
    const { json } = await api("/api/auth", { method: "POST", body: JSON.stringify({ action: mode, email, password }) });
    setBusy(false);
    if (json.error) { setError(json.error); return; }
    if (json.user) onAuthed(json.user);
  };
  const forgot = async () => {
    if (!email) { setError("Enter your email first, then tap Forgot password."); return; }
    const { json } = await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "forgot", email }) });
    setInfo(json.message || "Request noted.");
  };

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-4xl text-white shadow-xl shadow-violet-950/60">✦</div>
          <h1 className="mt-4 text-3xl font-extrabold text-white">Nova Work Studio <span className="text-violet-400">2.0</span></h1>
          <p className="mt-2 text-sm text-violet-200/70">Chat, prompts, invoices & khata, content calendar, CV maker and 10 daily tools — with AI built in. Just sign up and start.</p>
        </div>
        <div className="card p-6">
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-black/30 p-1">
            {(["signup", "login"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`rounded-lg py-2 text-sm font-bold ${mode === m ? "bg-violet-600 text-white" : "text-violet-200/70"}`}>{m === "signup" ? "Sign up" : "Log in"}</button>)}
          </div>
          <label className="lbl">Email</label>
          <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <label className="lbl mt-4">Password</label>
          <input className="inp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" onKeyDown={(e) => e.key === "Enter" && submit()} />
          {error && <p className="mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p>}
          {info && <p className="mt-3 rounded-xl bg-violet-500/15 px-3 py-2 text-sm text-violet-100">{info}</p>}
          <button disabled={busy} onClick={submit} className="btn-primary mt-5 w-full">{busy ? "Please wait…" : mode === "signup" ? "Create free account" : "Log in"}</button>
          <button onClick={forgot} className="mt-3 w-full text-center text-sm text-violet-300 hover:underline">Forgot password?</button>
          <div className="my-4 flex items-center gap-3 text-xs text-violet-300/50"><span className="h-px flex-1 bg-violet-500/20" />or<span className="h-px flex-1 bg-violet-500/20" /></div>
          <button disabled className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm text-violet-200/50" title="Owner must enable Google provider">Continue with Google — owner enables this in App Cloud settings</button>
          <button onClick={onGuest} className="mt-3 w-full py-2 text-sm font-semibold text-violet-200 underline">Continue as guest →</button>
          <p className="mt-4 text-center text-[11px] leading-relaxed text-violet-300/50">Passwords are hashed on the server — the app never stores a raw password. No API keys needed — the AI service is built into the app.</p>
        </div>
      </div>
    </div>
  );
}
