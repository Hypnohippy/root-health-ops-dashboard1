"use client";

import { useState } from "react";

type Variant = { primary_text: string; headline: string };
type Structured = {
  hook: string;
  before: string[];
  after: string[];
  explainer: string;
  ctas: string[];
  button: { label: string; url: string };
};

function Help({ text }: { text: string }) {
  return (
    <span className="ml-2 text-xs text-slate-300">
      <span className="px-2 py-0.5 rounded bg-white/10 border border-white/10 cursor-help" title={text}>?</span>
    </span>
  );
}

export default function NewCampaignPage() {
  const [name, setName] = useState("Root Health – December Stress Relief");
  const [platform, setPlatform] = useState<"Meta (Facebook/IG)" | "Google" | "LinkedIn">("Meta (Facebook/IG)");
  const [objective, setObjective] = useState("Leads");
  const [budgetDaily, setBudgetDaily] = useState(10);
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>("");

  const [location, setLocation] = useState("United Kingdom");
  const [ageRange, setAgeRange] = useState("25-54");
  const [audienceKeywords, setAudienceKeywords] = useState("burnout, stress, anxiety, self care, therapy");
  const [url, setUrl] = useState("https://roothealth.app");
  const [mediaUrl, setMediaUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [buttonLabel, setButtonLabel] = useState("Find out more");
  const [buttonUrl, setButtonUrl] = useState("https://roothealth.app");

  const [utmSource, setUtmSource] = useState("linkedin");
  const [utmMedium, setUtmMedium] = useState("cpc");
  const [utmCampaign, setUtmCampaign] = useState("dec-stress-relief");

  const [mode, setMode] = useState<"short"|"structured">("structured");
  const [status, setStatus] = useState<"draft" | "queued_to_publish">("draft");
  const [ab, setAb] = useState<boolean>(true); // create A/B pair

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{type:"success"|"error"; msg:string}|null>(null);

  // short variants
  const [variants, setVariants] = useState<Variant[]>([]);
  const [primaryText, setPrimaryText] = useState("");
  const [headline, setHeadline] = useState("");

  // structured
  const [structured, setStructured] = useState<Structured | null>(null);
  const [longFormPreview, setLongFormPreview] = useState("");

  function showToast(type: "success"|"error", msg: string){
    setToast({type,msg});
    setTimeout(()=>setToast(null), 3500);
  }

  async function genShort() {
    setBusy(true);
    setVariants([]);
    try {
      const res = await fetch("/api/ai/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, objective, url, audienceKeywords, brandVoice: "Root Health founder" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI error");
      const v: Variant[] = json.variants || [];
      if (!v.length) throw new Error("No variants returned");
      setVariants(v);
      setPrimaryText(v[0].primary_text || "");
      setHeadline(v[0].headline || "");
      showToast("success", "Generated 3 short ad variants");
    } catch(e:any){
      showToast("error", e.message || "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function genStructured() {
    setBusy(true);
    try {
      const res = await fetch("/api/ai/campaign/structured", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, objective, url, audienceKeywords, brandVoice: "Root Health founder" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI error");
      setStructured(json);
      // Build initial preview
      const lf = buildLongForm(json);
      setLongFormPreview(lf);
      // also seed short fields with hook + a CTA
      setPrimaryText(`${json.hook}\n${json.ctas?.[0] || ""}`.trim());
      setHeadline("Take Control of Your Health");
      showToast("success", "Structured ad generated");
    } catch(e:any){
      showToast("error", e.message || "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  function buildLongForm(s: Structured) {
    const before = s.before.map(x=>`✖︎ ${x}`).join("\n");
    const after = s.after.map(x=>`✔︎ ${x}`).join("\n");
    const u = addUTM(s.button.url || url);
    return [
      s.hook,
      "",
      "Before Root Health:",
      before,
      "",
      "After Root Health:",
      after,
      "",
      s.explainer,
      "",
      (s.ctas || []).map(c=>`• ${c}`).join("\n"),
      "",
      `[${s.button.label || buttonLabel}](${u})`
    ].join("\n");
  }

  function addUTM(base: string) {
    try {
      const u = new URL(base);
      if (utmSource) u.searchParams.set("utm_source", utmSource);
      if (utmMedium) u.searchParams.set("utm_medium", utmMedium);
      if (utmCampaign) u.searchParams.set("utm_campaign", utmCampaign);
      return u.toString();
    } catch {
      return base;
    }
  }

  function useVariant(v: Variant) {
    setPrimaryText(v.primary_text);
    setHeadline(v.headline);
    showToast("success", "Variant loaded");
  }

  async function save(type: "single" | "ab") {
    setBusy(true);
    try {
      // base payload builder
      const basePayload = (overrides: Partial<Record<string, any>> = {}) => ({
        name,
        platform,
        objective,
        budget_daily: Number(budgetDaily),
        start_date: startDate ? new Date(startDate).toISOString() : null,
        end_date: endDate ? new Date(endDate).toISOString() : null,
        location,
        age_range: ageRange,
        audience_keywords: audienceKeywords,
        primary_text: overrides.primary_text ?? primaryText,
        headline: overrides.headline ?? headline,
        url: addUTM(buttonUrl || url),
        media_url: mediaUrl || null,
        status,
        // long-form fields (optional)
        long_form: structured ? (overrides.long_form ?? buildLongForm(structured)) : null,
        hook: structured?.hook ?? null,
        before_items: structured ? structured.before.join("\n") : null,
        after_items: structured ? structured.after.join("\n") : null,
        explainer: structured?.explainer ?? null,
        ctas_text: structured ? (structured.ctas || []).join("\n") : null,
        button_label: buttonLabel,
        video_url: videoUrl || null,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        ab_group: overrides.ab_group ?? null,
      });

      if (type === "single" || !ab) {
        const res = await fetch("/api/campaigns", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify(basePayload()),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(json));
        showToast("success", "Saved");
      } else {
        // Create A and B (B uses a second variant if available; else tweak CTA)
        const varB = variants[1] || variants[0] || { primary_text, headline };
        const payloadA = basePayload({ ab_group: "A" });
        const payloadB = basePayload({
          ab_group: "B",
          primary_text: varB.primary_text,
          headline: varB.headline,
        });

        const [ra, rb] = await Promise.all([
          fetch("/api/campaigns",{ method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payloadA)}),
          fetch("/api/campaigns",{ method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payloadB)}),
        ]);

        const ja = await ra.json();
        const jb = await rb.json();
        if (!ra.ok) throw new Error(JSON.stringify(ja));
        if (!rb.ok) throw new Error(JSON.stringify(jb));
        showToast("success", "Saved A/B pair");
      }
    } catch(e:any){
      showToast("error", e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen text-slate-50 space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-xl text-white shadow-lg ${toast.type==="success"?"bg-emerald-500":"bg-rose-500"}`}>
          {toast.msg}
        </div>
      )}

      <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">New Campaign</h1>
          <a href="/dashboard/campaigns" className="px-3 py-1 rounded-lg bg-white/10 border border-white/10 hover:bg-white/20 text-sm">← Back</a>
        </div>

        {/* Mode + A/B */}
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2 text-sm">
            <span>Mode</span>
            <select className="bg-white/5 border border-white/10 rounded-lg p-2"
              value={mode} onChange={e=>setMode(e.target.value as any)}>
              <option value="structured">Structured (long-form)</option>
              <option value="short">Short (quick variants)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ab} onChange={e=>setAb(e.target.checked)} />
            <span>Create A/B pair</span>
            <Help text="Saves two records: A and B, for testing copy variants." />
          </label>
        </div>

        {/* Basics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase text-slate-300">Campaign name</span>
            <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={name} onChange={e=>setName(e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-300">Platform</span>
              <select className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={platform} onChange={e=>setPlatform(e.target.value as any)}>
                <option>Meta (Facebook/IG)</option>
                <option>Google</option>
                <option>LinkedIn</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-300">Objective</span>
              <select className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={objective} onChange={e=>setObjective(e.target.value)}>
                <option>Leads</option>
                <option>Traffic</option>
                <option>Awareness</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-300">Daily budget (£)</span>
              <input type="number" min={1} className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={budgetDaily} onChange={e=>setBudgetDaily(Number(e.target.value))}/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-300">Start / End</span>
              <div className="flex gap-2">
                <input type="date" className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={startDate} onChange={e=>setStartDate(e.target.value)} />
                <input type="date" className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={endDate} onChange={e=>setEndDate(e.target.value)} />
              </div>
            </label>
          </div>

          {/* Audience */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-300">Location <Help text="Country/region you want to reach." /></span>
              <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={location} onChange={e=>setLocation(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-300">Age range <Help text="e.g., 25-54 or 30-65." /></span>
              <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={ageRange} onChange={e=>setAgeRange(e.target.value)} />
            </label>
          </div>

          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="text-xs uppercase text-slate-300">Audience keywords (comma-separated) <Help text="Interests, problems, job titles." /></span>
            <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={audienceKeywords} onChange={e=>setAudienceKeywords(e.target.value)} />
          </label>
        </div>

        {/* Creative */}
        {mode === "short" ? (
          <>
            <div className="flex flex-wrap gap-3">
              <button onClick={genShort} disabled={busy} className="rounded-lg bg-fuchsia-500 text-slate-50 px-4 py-2 text-sm font-medium hover:bg-fuchsia-400">
                {busy ? "Thinking…" : "Generate 3 short variants"}
              </button>
            </div>

            <label className="flex flex-col gap-1 lg:col-span-2 mt-4">
              <span className="text-xs uppercase text-slate-300">Primary text</span>
              <textarea className="bg-slate-950/40 border border-white/10 rounded-xl p-3 min-h-[100px]" value={primaryText} onChange={e=>setPrimaryText(e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-4 lg:col-span-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase text-slate-300">Headline</span>
                <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={headline} onChange={e=>setHeadline(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase text-slate-300">Media URL (optional)</span>
                <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={mediaUrl} onChange={e=>setMediaUrl(e.target.value)} />
              </label>
            </div>

            {/* Variant picker */}
            {variants.length > 0 && (
              <div className="mt-5 space-y-3">
                <h3 className="text-base font-semibold">Pick a variant</h3>
                <div className="grid md:grid-cols-3 gap-3">
                  {variants.map((v, idx) => (
                    <div key={idx} className="bg-slate-950/30 border border-white/10 rounded-xl p-3 space-y-2">
                      <p className="text-xs uppercase text-slate-400">Variant {String.fromCharCode(65+idx)}</p>
                      <p className="text-sm text-slate-50 whitespace-pre-wrap">{v.primary_text}</p>
                      <p className="text-xs text-indigo-200 mt-1">Headline: <span className="font-medium">{v.headline}</span></p>
                      <button onClick={() => useVariant(v)} className="mt-2 text-xs px-3 py-1 bg-slate-50 text-slate-900 rounded-lg hover:bg-slate-200">
                        Use this
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <button onClick={genStructured} disabled={busy} className="rounded-lg bg-fuchsia-500 text-slate-50 px-4 py-2 text-sm font-medium hover:bg-fuchsia-400">
                {busy ? "Thinking…" : "Generate structured ad"}
              </button>
            </div>

            {structured && (
              <div className="grid lg:grid-cols-2 gap-6 mt-4">
                {/* Left: editors */}
                <div className="space-y-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase text-slate-300">Hook</span>
                    <textarea className="bg-slate-950/40 border border-white/10 rounded-xl p-3 min-h-[60px]"
                      value={structured.hook} onChange={e=>setStructured({...structured!, hook: e.target.value})} />
                  </label>

                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs uppercase text-slate-300">Before (one per line)</span>
                      <textarea className="bg-slate-950/40 border border-white/10 rounded-xl p-3 min-h-[120px]"
                        value={structured.before.join("\n")}
                        onChange={e=>setStructured({...structured!, before: e.target.value.split("\n").filter(Boolean)})} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs uppercase text-slate-300">After (one per line)</span>
                      <textarea className="bg-slate-950/40 border border-white/10 rounded-xl p-3 min-h-[120px]"
                        value={structured.after.join("\n")}
                        onChange={e=>setStructured({...structured!, after: e.target.value.split("\n").filter(Boolean)})} />
                    </label>
                  </div>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase text-slate-300">Explainer</span>
                    <textarea className="bg-slate-950/40 border border-white/10 rounded-xl p-3 min-h-[100px]"
                      value={structured.explainer} onChange={e=>setStructured({...structured!, explainer: e.target.value})} />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase text-slate-300">CTAs (one per line)</span>
                    <textarea className="bg-slate-950/40 border border-white/10 rounded-xl p-3 min-h-[80px]"
                      value={(structured.ctas || []).join("\n")}
                      onChange={e=>setStructured({...structured!, ctas: e.target.value.split("\n").filter(Boolean)})} />
                  </label>

                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs uppercase text-slate-300">Button label</span>
                      <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2"
                        value={buttonLabel} onChange={e=>setButtonLabel(e.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs uppercase text-slate-300">Button URL</span>
                      <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2"
                        value={buttonUrl} onChange={e=>setButtonUrl(e.target.value)} />
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs uppercase text-slate-300">Video URL (optional)</span>
                      <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={videoUrl} onChange={e=>setVideoUrl(e.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs uppercase text-slate-300">UTM source</span>
                      <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={utmSource} onChange={e=>setUtmSource(e.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs uppercase text-slate-300">UTM medium</span>
                      <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={utmMedium} onChange={e=>setUtmMedium(e.target.value)} />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase text-slate-300">UTM campaign</span>
                    <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={utmCampaign} onChange={e=>setUtmCampaign(e.target.value)} />
                  </label>

                  <button
                    className="mt-2 text-xs px-3 py-1 bg-white/10 border border-white/10 rounded-lg hover:bg-white/20"
                    onClick={()=> structured && setLongFormPreview(buildLongForm(structured))}
                  >
                    Build preview
                  </button>
                </div>

                {/* Right: preview */}
                <div className="bg-slate-950/30 border border-white/10 rounded-xl p-4">
                  <h3 className="text-base font-semibold mb-2">Long-form preview</h3>
                  <pre className="whitespace-pre-wrap text-sm">{longFormPreview}</pre>
                </div>
              </div>
            )}
          </>
        )}

        {/* Save row */}
        <div className="flex flex-wrap gap-3 mt-6">
          <select value={status} onChange={e=>setStatus(e.target.value as any)} className="bg-slate-950/40 border border-white/10 rounded-xl p-2">
            <option value="draft">Save as draft</option>
            <option value="queued_to_publish">Queue to publish</option>
          </select>
          <button onClick={()=>save(ab ? "ab" : "single")} disabled={busy} className="rounded-lg bg-emerald-500 text-slate-950 px-4 py-2 text-sm font-medium hover:bg-emerald-400">
            {busy ? "Saving…" : ab ? "Save A/B" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
