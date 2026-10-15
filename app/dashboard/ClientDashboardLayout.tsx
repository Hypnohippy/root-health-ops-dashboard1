"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./root-visual-system.css";
import { OpsNavigationIcon } from "./components/visual/OpsSurface";
import ResponseAttentionBadge from "./components/ResponseAttentionBadge";
import AcquisitionHandoff from "./components/AcquisitionHandoff";
import { usePathname } from "next/navigation";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

type SocialAccountsResponse = {
  success?: boolean;
  organisationId?: string;
  socialAccounts?: unknown[];
  error?: string;
};

type PrimaryNavItem = {
  label: string;
  href: string;
  match: (pathname: string) => boolean;
  badge?: string | number;
};

type SecondaryNavItem = {
  label: string;
  href: string;
  attentionCount?: number;
};

export default function ClientDashboardLayout({
  children,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const [mobileGrowthMenuOpen, setMobileGrowthMenuOpen] = useState(false);

  const [supportOpen, setSupportOpen] = useState(false);
  const [supportEmail, setSupportEmail] = useState("");
  const [supportMsg, setSupportMsg] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const [supportDone, setSupportDone] = useState<null | "ok" | "fail">(null);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string>("");
  const [navCounts, setNavCounts] = useState<{acquisition?:number;responses?:number;today?:number}>({});
  const [responseAttention, setResponseAttention] = useState<{count:number;href:string;channels:Record<string,{count:number;href:string}>}>({count:0,href:"/dashboard/responses",channels:{}});
  const [attentionRevision,setAttentionRevision]=useState(0);
  useEffect(()=> {
    const refresh=()=>setAttentionRevision(value=>value+1);
    window.addEventListener("responses-attention-changed",refresh);
    return ()=>window.removeEventListener("responses-attention-changed",refresh);
  },[]);
  const [founderAccess, setFounderAccess] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const workspace = await fetch("/api/org/current", { cache: "no-store" });
        const current = await workspace.json();
        if (!workspace.ok || !current.organisationId) return;
        if (active) setOrgId(current.organisationId);
        try {
          const founder = await fetch(`/api/founder-intelligence/access?organisationId=${encodeURIComponent(current.organisationId)}`, { cache: "no-store" });
          const founderData = await founder.json().catch(() => ({}));
          if (active) setFounderAccess(founder.ok && founderData?.allowed === true);
        } catch {
          if (active) setFounderAccess(false);
        }
        const response = await fetch(`/api/home/attention?organisationId=${encodeURIComponent(current.organisationId)}`, { cache: "no-store" });
        const data = await response.json();
        if (active && response.ok && data.responseAttention) setResponseAttention(data.responseAttention);
        if (active && response.ok && data.counts) setNavCounts({ acquisition: data.counts.newOpportunities, responses: data.counts.repliesNeedingResponse, today: data.counts.followupsDue });
      } catch { /* badges are optional; Home shows the actionable error */ }
    })();
    return () => { active = false; };
  }, [pathname, attentionRevision]);

  const canSend = useMemo(() => {
    return !supportSending && supportMsg.trim().length >= 5;
  }, [supportSending, supportMsg]);

  async function tryLoadOrgId() {
    try {
      const res = await fetch("/api/social-accounts", { cache: "no-store" });
      const json: SocialAccountsResponse = await res
        .json()
        .catch(() => ({} as SocialAccountsResponse));
      if (res.ok && json?.organisationId) {
        setOrgId(String(json.organisationId));
      }
    } catch {}
  }

  function openSupport() {
    setSupportOpen(true);
    setSupportDone(null);
    setSupportError(null);

    setSupportMsg((prev) => {
      const base = prev.trim();
      if (base) return prev;
      return `Hi Support — I’m having an issue on:\n${window.location.href}\n\nWhat happened:\n`;
    });

    if (!orgId) {
      void tryLoadOrgId();
    }
  }

  function closeSupport() {
    setSupportOpen(false);
    setSupportSending(false);
    setSupportDone(null);
    setSupportError(null);
  }

  useEffect(() => {
    if (!supportOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSupport();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [supportOpen]);

  async function sendSupport() {
    if (!canSend) return;

    setSupportSending(true);
    setSupportError(null);
    setSupportDone(null);

    try {
      const res = await fetch("/api/support/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          organisationId: orgId || null,
          email: supportEmail.trim() || null,
          message: supportMsg.trim(),
          pathname: pathname || null,
          href: typeof window !== "undefined" ? window.location.href : null,
          userAgent:
            typeof navigator !== "undefined" ? navigator.userAgent : null,
        }),
      });

      const json: {success?: boolean; error?: string} | null = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setSupportDone("fail");
        setSupportError(json?.error || `Support message failed (${res.status}).`);
        setSupportSending(false);
        return;
      }

      setSupportDone("ok");
      setSupportSending(false);
    } catch (e) {
      setSupportDone("fail");
      setSupportError(e instanceof Error ? e.message : "Support message failed.");
      setSupportSending(false);
    }
  }

  const primaryNav: PrimaryNavItem[] = [
    {
      label: "Home",
      href: "/dashboard",
      match: (p) => p === "/dashboard",
    },
    {
      label: "Acquisition",
      href: "/dashboard/growth/acquisition",
      match: (p) => p.startsWith("/dashboard/growth/acquisition"),
      badge: navCounts.acquisition,
    },
    {
      label: "Responses",
      href: responseAttention.count ? responseAttention.href : "/dashboard/responses",
      match: (p) => p.startsWith("/dashboard/responses"),
      badge: responseAttention.count || undefined,
    },
    {
      label: "Campaigns",
      href: "/dashboard/sequences",
      match: (p) => p.startsWith("/dashboard/sequences") || p.startsWith("/dashboard/brainstorm") || p.startsWith("/dashboard/growth-lab") || p.startsWith("/dashboard/campaigns"),
    },
    {
      label: "Publishing",
      href: "/dashboard/publishing",
      match: (p) =>
        p.startsWith("/dashboard/publishing") ||
        p.startsWith("/dashboard/stories") ||
        p.startsWith("/dashboard/scheduled") ||
        p.startsWith("/dashboard/approvals"),
    },
    {
      label: "Growth",
      href: "/dashboard/growth",
      match: (p) => p.startsWith("/dashboard/growth") && !p.startsWith("/dashboard/growth/acquisition"),
      badge: navCounts.today,
    },
    {
      label: "Resources",
      href: "/dashboard/resources",
      match: (p) => p.startsWith("/dashboard/resources"),
    },
    {
      label: "Connect",
      href: "/dashboard/connect",
      match: (p) => p.startsWith("/dashboard/connect"),
    },
  ];

  if (founderAccess) {
    primaryNav.splice(1, 0, {
      label: "Founder",
      href: "/dashboard/founder-intelligence",
      match: (p) => p.startsWith("/dashboard/founder-intelligence"),
    });
  }

  const activePrimary = primaryNav.find((item) => item.match(pathname))?.label || "Home";
  // Growth owns one persistent shell; individual pages must not opt into a legacy frame.
  const relationshipVisualPilot = pathname === "/dashboard/growth" || pathname.startsWith("/dashboard/growth/") || pathname === "/dashboard/founder-intelligence";

  const secondaryNav: SecondaryNavItem[] = (() => {
    if (activePrimary === "Responses") {
      return [
        {label:"All Responses",href:"/dashboard/responses"},
        {label:"Needs reply",href:responseAttention.href,attentionCount:responseAttention.count},
        {label:"LinkedIn needs reply",href:responseAttention.channels.linkedin?.href || "/dashboard/responses?platform=linkedin&status=needs_reply",attentionCount:responseAttention.channels.linkedin?.count || 0},
        {label:"LinkedIn Outreach",href:"/dashboard/responses/linkedin"},
      ];
    }
    if (activePrimary === "Campaigns") {
      return [
        { label: "Campaign Studio", href: "/dashboard/sequences" },
        { label: "Brainstorm", href: "/dashboard/brainstorm" },
        { label: "Growth Lab", href: "/dashboard/growth-lab" },
      ];
    }
    if (activePrimary === "Publishing") {
      return [
        { label: "Quick Blast", href: "/dashboard/publishing" },
        { label: "Stories", href: "/dashboard/stories/new" },
        { label: "Scheduled", href: "/dashboard/scheduled" },
        { label: "Approvals", href: "/dashboard/approvals" },
      ];
    }

    if (activePrimary === "Growth") {
      return [
        { label: "Today’s follow-ups", href: "/dashboard/growth" },
        { label: "Targets", href: "/dashboard/growth/followups" },
        { label: "Waiting", href: "/dashboard/growth/waiting" },
        { label: "Pipeline", href: "/dashboard/growth/pipeline" },
        { label: "Import", href: "/dashboard/growth/import" },
        { label: "Tracker", href: "/dashboard/growth/tracker" },
        { label: "Cadence", href: "/dashboard/growth/cadence-report" },
        { label: "Relationships", href: `/dashboard/growth/relationships${orgId ? `?organisationId=${encodeURIComponent(orgId)}` : ""}` },
      ];
    }

    if (activePrimary === "Connect") {
      return [
        { label: "Connections", href: "/dashboard/connect" },
        { label: "Metrics", href: "/dashboard/metrics" },
      ];
    }

    return [];
  })();

  const primaryLinkClasses = (item: PrimaryNavItem) => {
    const isActive = item.match(pathname);

    return [
      "inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-all",
      isActive
        ? "bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20"
        : "text-slate-100 hover:bg-white/10",
    ].join(" ");
  };

  const secondaryLinkClasses = (href: string) => {
    const isActive = pathname === href || pathname.startsWith(href + "/");

    return [
      "inline-flex items-center rounded-full px-3 py-1.5 text-xs transition-colors",
      isActive
        ? "bg-white/12 text-slate-50 border border-white/10"
        : "text-slate-300 hover:bg-white/8",
    ].join(" ");
  };

  return (
    <div data-visual-system={relationshipVisualPilot ? "root" : undefined} className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex flex-col">
      {relationshipVisualPilot && <button className="ops-mobile-menu-toggle" aria-expanded={mobileGrowthMenuOpen} aria-controls="growth-shell-navigation" onClick={() => setMobileGrowthMenuOpen(!mobileGrowthMenuOpen)}><OpsNavigationIcon label="Growth" /><span>Root Health Ops</span><span aria-hidden="true">☰</span><span className="sr-only">Open navigation</span></button>}
      {relationshipVisualPilot && mobileGrowthMenuOpen && <button className="ops-mobile-menu-backdrop" aria-label="Close navigation" onClick={() => setMobileGrowthMenuOpen(false)} />}
      <header id="growth-shell-navigation" data-mobile-open={mobileGrowthMenuOpen} onKeyDown={event => { if (event.key === "Escape") setMobileGrowthMenuOpen(false); }} className="ops-shell-navigation border-b border-white/10 bg-black/30 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="ops-shell-brand flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-2xl bg-emerald-400/80 shadow-lg shadow-emerald-500/40 shrink-0" />
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-sm font-semibold text-slate-50">
                    Root Health Ops
                  </span>
                  <span className="text-[11px] text-slate-300">
                    {relationshipVisualPilot ? "Growth Operations Centre" : "Your cockpit for growth"}
                  </span>
                </div>
              </div>

              <div className="ops-shell-context text-[11px] text-slate-400">
                {activePrimary}
              </div>
            </div>

            <nav aria-label="Primary navigation" className="hidden flex-wrap items-center gap-2 md:flex">
              {primaryNav.map((item) => (
                <Link
                  key={item.label}
                  onClick={() => setMobileGrowthMenuOpen(false)}
                  href={item.href}
                  aria-current={item.match(pathname) ? "page" : undefined}
                  className={primaryLinkClasses(item)}
                >
                  {relationshipVisualPilot && <OpsNavigationIcon label={item.label} />}
                  {relationshipVisualPilot ? <span className="ops-nav-copy"><span>{item.label}</span><small>{{Home: "Your daily briefing", Founder: "Intelligence & research", Acquisition: "New opportunities", Responses: "People & conversations", Campaigns: "Coordinated outreach", Publishing: "Content & distribution", Growth: "Relationships & progress", Resources: "Knowledge & tools", Connect: "Channels & accounts"}[item.label]}</small></span> : item.label}
                  {item.label === "Responses" ? <ResponseAttentionBadge count={responseAttention.count} /> : item.badge !== undefined ? <span className="ml-2 rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]" aria-label={`${item.badge} items`}>{item.badge}</span> : null}
                </Link>
              ))}
            </nav>

            {!relationshipVisualPilot && <details className="group md:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                <span>{activePrimary}<ResponseAttentionBadge count={responseAttention.count} /></span><span aria-hidden className="text-slate-400 transition group-open:rotate-180">⌄</span>
              </summary>
              <nav aria-label="Mobile navigation" className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-xl">
                {primaryNav.map((item) => <Link key={item.label} href={item.href} className={`${primaryLinkClasses(item)} justify-between`}>
                  <span>{item.label}</span>{item.label === "Responses" ? <ResponseAttentionBadge count={responseAttention.count} /> : item.badge !== undefined ? <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]">{item.badge}</span> : null}
                </Link>)}
              </nav>
            </details>}

            {secondaryNav.length > 0 ? (
              <div className="ops-shell-subnav flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                {secondaryNav.map((item) => (
                  <Link
                    key={item.label}
                    onClick={() => setMobileGrowthMenuOpen(false)}
                    href={item.href}
                    className={secondaryLinkClasses(item.href.split("?")[0])}
                  >
                    {item.label}<ResponseAttentionBadge count={item.attentionCount || 0} />
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {relationshipVisualPilot && <div className="ops-sidebar-ambient" aria-hidden="true"><p>Together, we grow<br/>smarter, stronger,<br/>more connected.</p><span>Root Health Ops</span></div>}
        {relationshipVisualPilot && <button className="ops-mobile-menu-close" aria-label="Close navigation" onClick={() => setMobileGrowthMenuOpen(false)}>×</button>}
      </header>

      {relationshipVisualPilot && <div className="ops-workspace-topbar"><div className="ops-command-brand"><span className="ops-eyebrow">Root Health Ops</span><p>Growth Operations Centre</p></div><Link className="ops-search-entry" href={`/dashboard/growth/relationships${orgId ? `?organisationId=${encodeURIComponent(orgId)}` : ""}`}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>Search people, companies, or what’s happening in your growth operations…<span className="ops-search-hint">Search</span></Link><div className="ops-command-context"><span className="ops-command-orb" aria-hidden="true"/><span>Growth workspace<small>Relationships &amp; intelligence</small></span></div></div>}

      <main className="flex-1 p-6"><AcquisitionHandoff key={pathname} />{children}</main>

      <footer className="border-t border-white/10 py-4 text-[12px] text-slate-400">
        <div className="mx-auto max-w-6xl px-4 flex flex-col md:flex-row items-center justify-between gap-2">
          <div>© {new Date().getFullYear()} Root Health Ops</div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={openSupport}
              className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-[12px] text-emerald-200 hover:bg-emerald-500/15 hover:text-emerald-100"
            >
              Contact Support
            </button>

            <Link href="/terms" className="hover:text-slate-200">
              Terms of Service
            </Link>

            <Link href="/privacy" className="hover:text-slate-200">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>

      {supportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" onClick={closeSupport} />

          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-slate-400">Support</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  Contact Root Health Ops
                </div>
                <div className="mt-1 text-[12px] text-slate-400">
                  We’ll automatically attach the latest error details (JSON) so
                  you don’t have to.
                </div>
              </div>

              <button
                className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
                onClick={closeSupport}
              >
                Close
              </button>
            </div>

            {supportDone === "ok" ? (
              <div className="mt-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4 text-emerald-100">
                Sent ✅ We’ve received your message (with diagnostic details attached).
              </div>
            ) : null}

            {supportDone === "fail" ? (
              <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-red-100">
                Failed to send. {supportError || "Please try again."}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Your email (optional)
                </label>
                <input
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="you@domain.com"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  What happened?
                </label>
                <textarea
                  value={supportMsg}
                  onChange={(e) => setSupportMsg(e.target.value)}
                  rows={7}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="Tell us what you tried and what you expected…"
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Tip: mention the platform and whether it was Campaign Studio,
                  Brainstorm, Publishing, or Resources.
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={sendSupport}
                  disabled={!canSend}
                  className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {supportSending ? "Sending…" : "Send to Support"}
                </button>

                <button
                  type="button"
                  onClick={closeSupport}
                  disabled={supportSending}
                  className="rounded-2xl border border-slate-600 bg-slate-950 px-5 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>

              <div className="text-[11px] text-slate-500">
                Press <b>Esc</b> to close.
              </div>

              {orgId ? (
                <div className="text-[11px] text-slate-600">
                  (Diagnostics will be attached for org{" "}
                  <span className="break-all">{orgId}</span>)
                </div>
              ) : (
                <div className="text-[11px] text-slate-600">
                  (Diagnostics will still send — org auto-detect will be attempted server-side.)
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
