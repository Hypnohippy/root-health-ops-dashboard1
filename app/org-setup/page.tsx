"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// simple slug helper: "Fuel Geist Ltd" -> "fuel-geist-ltd"
function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function OrgSetupPage() {
  const [loadingUser, setLoadingUser] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#3b82f6");
  const [secondaryColor, setSecondaryColor] = useState("#10b981");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create Supabase client for the browser
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Get logged-in user
  useEffect(() => {
    const loadUser = async () => {
      setLoadingUser(true);
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("Error getting user", error);
        setError("Could not load user. Are you logged in?");
        setUserId(null);
      } else {
        setUserId(data.user?.id ?? null);
      }
      setLoadingUser(false);
    };
    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setError(null);

    if (!userId) {
      setError("No user ID found. Please log in first.");
      return;
    }

    if (!orgName.trim()) {
      setError("Organisation name is required.");
      return;
    }

    try {
      setStatus("Saving...");
      const slug = slugify(orgName);

      // 1) create organisation
      const { data: org, error: orgError } = await supabase
        .from("organisations")
        .insert({
          owner_id: userId,
          name: orgName,
          slug,
          brand_name: brandName || null,
          brand_primary_color: primaryColor,
          brand_secondary_color: secondaryColor,
        })
        .select()
        .single();

      if (orgError) {
        console.error("Org insert error", orgError);
        setError(orgError.message);
        setStatus(null);
        return;
      }

      // 2) create organisation_members record for this user as owner
      const { error: memberError } = await supabase
        .from("organisation_members")
        .insert({
          organisation_id: org.id,
          user_id: userId,
          role: "owner",
        });

      if (memberError) {
        console.error("Member insert error", memberError);
        setError(memberError.message);
        setStatus(null);
        return;
      }

      setStatus("Organisation saved 🎉");
    } catch (err: any) {
      console.error("Org setup error", err);
      setError(err?.message || "Something went wrong");
      setStatus(null);
    }
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600 text-lg">Loading your account…</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <h1 className="text-2xl font-semibold">You need to log in</h1>
        <p className="text-slate-600">
          This page creates your organisation and brand profile. Please log in first.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-xl bg-slate-900/80 border border-slate-700 rounded-2xl p-6 shadow-xl">
        <h1 className="text-2xl font-bold mb-2">Set up your organisation</h1>
        <p className="text-sm text-slate-300 mb-6">
          This is the “corporate identity” layer therapists will use later – name, brand, and colours
          that we’ll reuse across dashboards, posts, and white-labelling.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Organisation name<span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="e.g. Mindful Roots Therapy"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Brand / trading name
            </label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="What clients see on your site / socials"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Primary brand colour
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-9 rounded-full border border-slate-700"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="#3b82f6"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Secondary brand colour
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-9 w-9 rounded-full border border-slate-700"
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="#10b981"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!!status && status.startsWith("Saving")}
            className="mt-2 w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 text-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {status && status.startsWith("Saving")
              ? "Saving…"
              : "Save organisation"}
          </button>
        </form>

        {status && (
          <p className="mt-4 text-sm text-emerald-400">{status}</p>
        )}
        {error && (
          <p className="mt-2 text-sm text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}
