"use client";

import { useState } from "react";

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
  const [primaryText, setPrimaryText] = useState("Feeling the year-end pressure? Take control of your health with simple, guided steps. Start small today.");
  const [headline, setHeadline] = useState("Take control of your health.");
  const [status, setStatus] = useState<"draft" | "queued_to_publish">("draft");

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{type:"success"|"error"; msg:string}|null>(null);

  function showToast(type: "success"|"error", msg: string){
    setToast({type,msg});
    setTimeout(()=>setToast(null), 3500);
  }

  async function generateCopy() {
    setBusy(true);
    try {
      const prompt = `
You are Root Health's founder voice. Create concise ad copy for ${platform} with objective ${objective}.
Offer recognition (not apology), 1 clear benefit, 1 gentle call-to-action. No clinical tone.

Landing page: ${url}
Audience hints: ${audienceKeywords}
Headline today: "${headline}"

Return two parts separated by ---:
PRIMARY_TEXT (2-3 sentences)
HEADLINE (max 40 chars)
      `.trim();

      const res = await fetch("/api/ai/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: prompt,
          platform: "LinkedIn",
          style: "Root Health founder, supportive, practical, not apologetic",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI error");

      const draft: string = json.draft || "";
      const parts = draft.split("---");
      const body = (parts[0] || "").replace(/^PRIMARY_TEXT/i, "").trim();
      const head = (parts[1] || "").replace(/^HEADLINE/i, "").trim();
      if (body) setPrimaryText(body);
      if (head) setHeadline(head);
      showToast("success", "Ad copy generated");
    } catch (e:any) {
      showToast("error", e.message || "Failed to generate");
    } finally {
      setBusy(false);
    }
  }

  async function saveCampaign() {
    setBusy(true);
    try {
      const payload = {
        name,
        platform,
        objective,
        budget_daily: Number(budgetDaily),
        start_date: startDate ? new Date(startDate).toISOString() : null,
        end_date: endDate ? new Date(endDate).toISOString() : null,
        location,
        age_range: ageRange,
        audience_keywords: audienceKeywords,
        primary_text: primaryText,
        headline,
        url,
        media_url: mediaUrl || null,
        status,
      };
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(json));
      showToast("success", status === "queued_to_publish" ? "Queued for publish" : "Saved as draft");
    } catch(e:any){
      showToast("error", e.message || "Save failed");
    } finally{
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
          <a href="/dashboard" className="px-3 py-1 rounded-lg bg-white/10 border border-white/10 hover:bg-white/20 text-sm">← Back</a>
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
              <span className="text-xs uppercase text-slate-300">Landing URL</span>
              <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={url} onChange={e=>setUrl(e.target.value)} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-300">Start date</span>
              <input type="date" className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={startDate} onChange={e=>setStartDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-300">End date (optional)</span>
              <input type="date" className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={endDate} onChange={e=>setEndDate(e.target.value)} />
            </label>
          </div>

          {/* Audience */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-300">Location</span>
              <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={location} onChange={e=>setLocation(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase text-slate-300">Age range</span>
              <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={ageRange} onChange={e=>setAgeRange(e.target.value)} />
            </label>
          </div>

          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="text-xs uppercase text-slate-300">Audience keywords (comma-separated)</span>
            <input className="bg-slate-950/40 border border-white/10 rounded-xl p-2" value={audienceKeywords} onChange={e=>setAudienceKeywords(e.target.value)} />
          </label>

          {/* Creative */}
          <label className="flex flex-col gap-1 lg:col-span-2">
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
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={generateCopy} disabled={busy} className="rounded-lg bg-fuchsia-500 text-slate-50 px-4 py-2 text-sm font-medium hover:bg-fuchsia-400">
            {busy ? "Thinking…" : "Generate ad copy"}
          </button>
          <select value={status} onChange={e=>setStatus(e.target.value as any)} className="bg-slate-950/40 border border-white/10 rounded-xl p-2">
            <option value="draft">Save as draft</option>
            <option value="queued_to_publish">Queue to publish</option>
          </select>
          <button onClick={saveCampaign} disabled={busy} className="rounded-lg bg-emerald-500 text-slate-950 px-4 py-2 text-sm font-medium hover:bg-emerald-400">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
