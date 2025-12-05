"use client";

import { useState } from "react";

export default function OrgSetupPage() {
  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [secondaryColor, setSecondaryColor] = useState("#16a34a");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      // For now we just log it – we’ll wire this to an API route next.
      console.log("Org setup data:", {
        name,
        brandName,
        primaryColor,
        secondaryColor,
      });

      setMessage("Saved locally – backend wiring comes next ✅");
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-2xl mx-auto py-12 px-4">
        <h1 className="text-3xl font-semibold mb-2">
          Set up your organisation
        </h1>
        <p className="text-slate-300 mb-8">
          This is where a therapist or clinic sets their brand and “home”
          organisation. We&apos;ll connect this to Supabase + social accounts
          next, but for now this page is safe to build and deploy.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
          <div>
            <label className="block text-sm font-medium mb-1">
              Organisation name
            </label>
            <input
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-blue-500"
              placeholder="e.g. Root Health Clinic"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Brand name (optional)
            </label>
            <input
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-blue-500"
              placeholder="e.g. Root Health"
              value={brandName}
              onChange={e => setBrandName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Primary colour
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  className="h-10 w-10 rounded cursor-pointer border border-slate-700"
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                />
                <input
                  className="flex-1 rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Secondary colour
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  className="h-10 w-10 rounded cursor-pointer border border-slate-700"
                  value={secondaryColor}
                  onChange={e => setSecondaryColor(e.target.value)}
                />
                <input
                  className="flex-1 rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  value={secondaryColor}
                  onChange={e => setSecondaryColor(e.target.value)}
                />
              </div>
            </div>
          </div>

          {message && (
            <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-700/70 rounded-md px-3 py-2">
              {message}
            </p>
          )}

          {error && (
            <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-700/70 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save organisation"}
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-500">
          Next step: wire this to an <code>/api/org-setup</code> endpoint that
          creates an organisation row in Supabase with your user as the owner
          and stores these brand colours. No one will have to touch SQL or the
          Supabase UI – it will all be driven from here.
        </p>
      </div>
    </div>
  );
}
