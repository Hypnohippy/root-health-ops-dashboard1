// app/dashboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ChannelId =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "threads"
  | "tiktok"
  | "reddit"
  | "google"
  | "email"
  | "whatsapp";

type QuickBlastResult = {
  channel: ChannelId;
  ok: boolean;
  status?: number;
  error?: string;
  details?: any;
  sent?: any;
  raw?: any;
};

type Mode = "now" | "schedule";

function safeStringify(v: any) {
  try {
    if (v === undefined) return "";
    if (typeof v === "string") return v;
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function extractConnectedPlatforms(payload: any): string[] {
  const rows =
    (Array.isArray(payload) ? payload : null) ||
    (Array.isArray(payload?.data) ? payload.data : null) ||
    (Array.isArray(payload?.accounts) ? payload.accounts : null) ||
    (Array.isArray(payload?.socialAccounts) ? payload.socialAccounts : null) ||
    (Array.isArray(payload?.social_accounts) ? payload.social_accounts : null) ||
    [];

  const platforms: string[] = [];
  for (const r of rows) {
    const p = String(r?.platform || "").toLowerCase().trim();
    const active = r?.is_active;
    if (!p) continue;
    if (active === false) continue;
    platforms.push(p);
  }
  return Array.from(new Set(platforms));
}

export default function DashboardHomePage() {
  const [message, setMessage] = useState(
    "Quick check-in from Root Health Ops Dashboard ✅"
  );
  const [imageUrl, setImageUrl] = useState("");

  const [mode, setMode] = useState<Mode>("now");
  const [scheduledAt, setScheduledAt] = useState("");

  const [isPosting, setIsPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coachMessage, setCoachMessage] = useState<string | null>(null);

  const [lastResults, setLastResults] = useState<QuickBlastResult[] | null>(
    null
  );

  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<ChannelId>>(
    new Set()
  );
  const [isLoadingPlatforms, setIsLoadingPlatforms] = useState(true);
  const [platformsLoadError, setPlatformsLoadError] = useState<string | null>(
    null
  );

  const [sendToFacebook, setSendToFacebook] = useState(true);
  const [sendToInstagram, setSendToInstagram] = useState(false);
  const [sendToLinkedIn, setSendToLinkedIn] = useState(false);
  const [sendToThreads, setSendToThreads] = useState(false);
  const [sendToTikTok, setSendToTikTok] = useState(false);
  const [sendToReddit, setSendToReddit] = useState(false);

  // single-tenant beta org
  const organisationId = "23a054db-7040-40b1-b193-2f43cfa139de";

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoadingPlatforms(true);
      setPlatformsLoadError(null);

      try {
        const res = await fetch("/api/social-accounts", { method: "GET" });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const msg =
            data?.error ||
            data?.message ||
            `Failed to load /api/social-accounts (HTTP ${res.status})`;
          throw new Error(msg);
        }

        const platforms = extractConnectedPlatforms(data);

        const allowed: ChannelId[] = [
          "facebook",
          "linkedin",
          "instagram",
          "threads",
          "tiktok",
          "reddit",
          "google",
          "email",
          "whatsapp",
        ];

        const set = new Set<ChannelId>();
        for (const p of platforms) {
          const lower = String(p).toLowerCase();
          if (allowed.includes(lower as ChannelId)) {
            set.add(lower as ChannelId);
          }
        }

        if (!cancelled) {
          setConnectedPlatforms(set);

          if (!set.has("facebook")) setSendToFacebook(false);
          if (!set.has("facebook") && set.has("linkedin")) {
            setSendToLinkedIn(true);
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setPlatformsLoadError(
            e?.message || "Could not load connected platforms."
          );
          setConnectedPlatforms(new Set());
          setSendToFacebook(false);
          setSendToInstagram(false);
          setSendToLinkedIn(false);
          setSendToThreads(false);
          setSendToTikTok(false);
          setSendToReddit(false);
        }
      } finally {
        if (!cancelled) setIsLoadingPlatforms(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedChannels = useMemo(() => {
    const chans: ChannelId[] = [];
    const isConnected = (c: ChannelId) => connectedPlatforms.has(c);

    if (sendToFacebook && isConnected("facebook")) chans.push("facebook");
    if (sendToInstagram && isConnected("instagram")) chans.push("instagram");
    if (sendToLinkedIn && isConnected("linkedin")) chans.push("linkedin");
    if (sendToThreads && isConnected("threads")) chans.push("threads");
    if (sendToTikTok && isConnected("tiktok")) chans.push("tiktok");
    if (sendToReddit && isConnected("reddit")) chans.push("reddit");

    return chans;
  }, [
    sendToFacebook,
    sendToInstagram,
    sendToLinkedIn,
    sendToThreads,
    sendToTikTok,
    sendToReddit,
    connectedPlatforms,
  ]);

  const isAnyChannelSelected = selectedChannels.length > 0;

  const callRootCoach = (msg: string) => {
    fetch("/api/ai/root-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: "quick_blast",
        errorMessage: msg,
        userAction:
          mode === "now"
            ? "Clicked Quick Blast (send now) on dashboard"
            : "Clicked Quick Blast (schedule) on dashboard",
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.coachMessage) {
          setCoachMessage(data.coachMessage);
        }
      })
      .catch(() => {});
  };

  const handleQuickBlast = async () => {
    setIsPosting(true);
    setStatus(null);
    setError(null);
    setCoachMessage(null);
    setLastResults(null);

    try {
      const trimmed = message.trim();
      if (!trimmed) throw new Error("Please write something to send.");

      if (isLoadingPlatforms) {
        throw new Error("Still loading connected platforms… try again in a second.");
      }

      if (platformsLoadError) {
        throw new Error(`Could not load connected platforms: ${platformsLoadError}`);
      }

      const channels = selectedChannels;
      if (channels.length === 0) {
        throw new Error(
          "Select at least one connected channel (Facebook, LinkedIn, Instagram, Threads)."
        );
      }

      const results: QuickBlastResult[] = [];

      for (const channel of channels) {
        const res = await fetch("/api/social/quick-blast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            channel,
            imageUrl,
            organisationId,
          }),
        });

        let data: any = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        const success = Boolean(data?.success);

        if (!res.ok || !success) {
          results.push({
            channel,
            ok: false,
            status: res.status,
            error:
              data?.error ||
              data?.message ||
              `Quick Blast failed for ${channel} (HTTP ${res.status})`,
            details: data?.details,
            sent: data?.sent,
            raw: data,
          });
        } else {
          results.push({
            channel,
            ok: true,
            status: res.status,
            sent: data?.sent,
            raw: data,
          });
        }
      }

      setLastResults(results);

      const successChannels = results.filter((r) => r.ok).map((r) => r.channel);

      if (successChannels.length === 0) {
        const lines = results.map((r) => {
          const bits: string[] = [];
          if (r.error) bits.push(`error: ${r.error}`);
          if (r.details !== undefined && r.details !== null)
            bits.push(`details: ${safeStringify(r.details)}`);
          if (r.sent !== undefined && r.sent !== null)
            bits.push(`sent: ${safeStringify(r.sent)}`);
          return `• ${r.channel}: ${bits.join(" | ") || "failed"}`;
        });

        throw new Error(
          `Quick Blast failed on all selected channels.\n\n${lines.join("\n")}`
        );
      }

      setStatus(
        `Quick Blast sent via ${successChannels.join(", ")} using Root Health Ops 🎉`
      );
    } catch (err: any) {
      const msg =
        err?.message || "Something went wrong sending your Quick Blast.";
      setError(msg);
      callRootCoach(msg);
    } finally {
      setIsPosting(false);
    }
  };

  const handleSchedule = async () => {
    setIsPosting(true);
    setStatus(null);
    setError(null);
    setCoachMessage(null);
    setLastResults(null);

    try {
      const trimmed = mess
