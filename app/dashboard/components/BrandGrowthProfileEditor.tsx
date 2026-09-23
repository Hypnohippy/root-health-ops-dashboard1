"use client";

import { useEffect, useState } from "react";
import { emptyProfile, legacyBrandFields, legacyBrandPatch, maxLogoBytes, profileLimits, type BrandGrowthProfile } from "@/lib/brandGrowthProfile";
import { fetchOrganisationProfile, type ProfileResponse } from "@/lib/organisationProfileClient";

const legacyKey = "rootops_brand_profile_v1";
const inputClass = "mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none disabled:opacity-60";
type Field = { key: keyof BrandGrowthProfile; label: string; hint?: string; multiline?: boolean; type?: string };
const branding: Field[] = [
  { key: "yourName", label: "Your name" }, { key: "businessName", label: "Business name" },
  { key: "contactEmail", label: "Contact email", type: "email" }, { key: "website", label: "Website", type: "url", hint: "https://yourbusiness.com" },
  { key: "footerText", label: "Footer text", hint: "A short line for your PDFs, proposals and course packs." },
];
const essentials: Field[] = [
  { key: "businessDescription", label: "What does your business do?", multiline: true, hint: "A few sentences about what you do and why people choose you." },
  { key: "audience", label: "Who do you help?", multiline: true, hint: "Describe your ideal customer in your own words." },
  { key: "primaryOffer", label: "What are you offering?", multiline: true, hint: "The main product, service or offer you want to grow." },
];
const nextStep: Field[] = [
  { key: "cta", label: "What should people do next?", hint: "For example: Book a call, visit the shop or request a quote." },
  { key: "destinationUrl", label: "Where should that take them?", type: "url", hint: "The full https:// link to your booking, product or enquiry page." },
  { key: "geography", label: "Where do you work?", hint: "A town, region, country or online worldwide." },
];
const details: Field[] = [
  { key: "customerProblems", label: "Customer problems", multiline: true, hint: "What are people struggling with? One idea per line." },
  { key: "desiredOutcomes", label: "Desired outcomes", multiline: true, hint: "What would a good result look like for them?" },
  { key: "priorityServices", label: "Priority services", multiline: true, hint: "Which services or products matter most right now? One per line." },
  { key: "commonCustomerQuestions", label: "Common customer questions", multiline: true, hint: "Questions people ask before they buy. One per line." },
  { key: "brandTone", label: "How should your brand sound?", multiline: true, hint: "For example: clear, friendly, practical and reassuring." },
  { key: "excludedTopics", label: "Topics to avoid", multiline: true, hint: "Subjects, claims or language you do not want to use." },
];

export default function BrandGrowthProfileEditor({ organisationId, compact = false }: { organisationId?: string | null; compact?: boolean }) {
  const [loaded, setLoaded] = useState<ProfileResponse | null>(null);
  const [profile, setProfile] = useState<BrandGrowthProfile>({ ...emptyProfile });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [hasLegacy, setHasLegacy] = useState(false);
  const [imported, setImported] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const requested = organisationId || new URLSearchParams(window.location.search).get("organisationId") || undefined;
    fetchOrganisationProfile(requested, undefined, controller.signal).then(data => {
      setLoaded(data); setProfile(data.profile); setError(""); setDirty(false);
      try { setHasLegacy(!!localStorage.getItem(legacyKey)); } catch { /* browser storage may be disabled */ }
    }).catch(err => {
      if (!controller.signal.aborted) { setLoaded(null); setError(err instanceof Error ? err.message : "Could not load your profile."); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [organisationId, reload]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(key: keyof BrandGrowthProfile, value: string) {
    setProfile(previous => ({ ...previous, [key]: value })); setDirty(true); setMessage("");
  }
  function reviewLegacy() {
    try {
      const patch = legacyBrandPatch(JSON.parse(localStorage.getItem(legacyKey) || "null"));
      setProfile(previous => ({ ...previous, ...patch })); setImported(true); setDirty(true); setError("");
      setMessage("Browser branding added to this draft. Check that it belongs to this organisation, then save.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not read browser branding."); }
  }
  async function save() {
    if (!loaded || !loaded.canEdit) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const allowed = compact ? legacyBrandFields : Object.keys(emptyProfile) as (keyof BrandGrowthProfile)[];
      const changed = Object.fromEntries(allowed.filter(key => profile[key] !== loaded.profile[key]).map(key => [key, profile[key]]));
      if (Object.keys(changed).length) {
        const data = await fetchOrganisationProfile(loaded.organisationId, changed);
        setLoaded(data); setProfile(data.profile);
      }
      setDirty(false); setMessage("Profile saved for your organisation.");
      if (imported) {
        try { localStorage.removeItem(legacyKey); setHasLegacy(false); } catch { /* saved in Supabase even if removal fails */ }
        setImported(false);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save. Your draft is still here."); }
    finally { setSaving(false); }
  }
  function uploadLogo(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > maxLogoBytes) {
      setError("Choose a PNG, JPEG or WebP logo under 512 KB."); return;
    }
    const reader = new FileReader();
    reader.onload = () => { update("logoUrl", String(reader.result || "")); setError(""); };
    reader.onerror = () => setError("Could not read this logo. Please try another file.");
    reader.readAsDataURL(file);
  }
  function fields(items: Field[]) {
    return <div className="grid gap-4 md:grid-cols-2">{items.map(field => <label key={field.key} className={`block text-sm text-slate-200 ${field.multiline ? "md:col-span-2" : ""}`}>
      {field.label}
      {field.multiline ? <textarea rows={3} className={inputClass} value={profile[field.key]} maxLength={profileLimits[field.key]} onChange={event => update(field.key, event.target.value)} />
        : <input type={field.type || "text"} className={inputClass} value={profile[field.key]} maxLength={profileLimits[field.key]} onChange={event => update(field.key, event.target.value)} />}
      {field.hint && <span className="mt-1 block text-xs text-slate-400">{field.hint}</span>}
    </label>)}</div>;
  }

  return <section aria-label={compact ? "Brand your outputs" : "Brand and growth profile"} className="my-6 rounded-2xl border border-slate-700 bg-slate-950/60 p-5 md:p-6">
    <h2 className="text-lg font-semibold">{compact ? "Brand your outputs" : "Your brand + growth profile"}</h2>
    <p className="mt-1 text-sm text-slate-400">{compact ? "Brand your PDFs, proposals, summaries and course packs." : "Tell us a little about your business. Start with the basics and add detail when you’re ready."}</p>
    {loaded && <p className="mt-2 text-xs text-emerald-300">Shared with {loaded.organisationName} · Saved across devices</p>}
    {loading && <p role="status" className="mt-4 text-sm">Loading your profile…</p>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">{error}</p>}
    {!loading && !loaded && <button type="button" className="mt-3 rounded-xl border border-slate-600 px-4 py-2 text-sm" onClick={() => { setLoading(true); setReload(value => value + 1); }}>Try again</button>}
    {loaded && !loading && <form className="mt-5 space-y-5" onSubmit={event => { event.preventDefault(); void save(); }}>
      {!loaded.canEdit && <p className="text-sm text-amber-200">You can view this profile. An owner, admin or manager can edit it.</p>}
      <fieldset disabled={saving || !loaded.canEdit} className="space-y-5 disabled:opacity-70">
        {hasLegacy && <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm">
          <p>This browser has older branding with no organisation attached. Only import it if it belongs to <strong>{loaded.organisationName}</strong>.</p>
          <button type="button" onClick={reviewLegacy} className="mt-2 underline underline-offset-4">Review browser branding</button>
        </div>}
        <details open={compact || undefined} className="rounded-xl border border-slate-700 p-4">
          <summary className="cursor-pointer font-medium">Brand your outputs · name, logo and contact details</summary>
          <div className="mt-4 space-y-4">
            {fields(branding)}
            <label className="block text-sm">Logo upload <span className="text-xs text-slate-400">(PNG, JPEG or WebP, up to 512 KB)</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" className={inputClass} onChange={event => uploadLogo(event.target.files?.[0])} />
            </label>
            {profile.logoUrl && <div className="flex items-center gap-4 rounded-xl bg-slate-900 p-3">
              {/* Data URLs preserve the existing logo-upload behaviour. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={profile.logoUrl} alt="Your logo preview" className="h-14 max-w-48 object-contain" />
              <button type="button" className="text-xs underline" onClick={() => update("logoUrl", "")}>Remove logo</button>
            </div>}
          </div>
        </details>
        {!compact && <>
          {fields(essentials)}
          <details className="rounded-xl border border-slate-700 p-4">
            <summary className="cursor-pointer font-medium">Your next step · offer destination and growth focus</summary>
            <div className="mt-4 space-y-4">{fields(nextStep)}
              <label className="block text-sm">Growth mode
                <select className={inputClass} value={profile.growthMode} onChange={event => update("growthMode", event.target.value)}>
                  <option value="">Choose when you’re ready</option><option value="steady">Steady growth — build trust and consistency</option><option value="launch">Launch — introduce an offer</option><option value="expand">Expand — reach more customers</option>
                </select>
                <span className="mt-1 block text-xs text-slate-400">A planning preference. This does not start campaigns or change publishing.</span>
              </label>
            </div>
          </details>
          <details className="rounded-xl border border-slate-700 p-4">
            <summary className="cursor-pointer font-medium">Add useful detail · customers, services and tone</summary>
            <div className="mt-4">{fields(details)}</div>
          </details>
        </>}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={!dirty || saving} className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">{saving ? "Saving…" : compact ? "Save brand profile" : "Save profile"}</button>
          {dirty && <span className="text-xs text-amber-200">Unsaved changes</span>}
          {compact && <a className="text-xs text-slate-300 underline" href={`/dashboard/connect?organisationId=${encodeURIComponent(loaded.organisationId)}`}>Edit your full brand + growth profile</a>}
        </div>
      </fieldset>
      {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
    </form>}
  </section>;
}
