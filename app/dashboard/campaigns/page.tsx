async function submitLog() {
  if (!modalCampaignId || !modalVariantId) return;

  setSaving(true);
  setSaveError(null);

  try {
    const payload: any = {
      campaignId: modalCampaignId,
      variantId: modalVariantId,
      source: "manual",
    };

    if (reportedAt) payload.reported_at = new Date(reportedAt).toISOString();

    const ctrN: number | null = ctr.trim() === "" ? null : Number(ctr);
    const cplN: number | null = cpl.trim() === "" ? null : Number(cpl);

    if (ctr.trim() !== "" && !Number.isFinite(ctrN as number)) {
      throw new Error("CTR must be a number (e.g. 1.25)");
    }
    if (cpl.trim() !== "" && !Number.isFinite(cplN as number)) {
      throw new Error("CPL must be a number (e.g. 6.40)");
    }

    payload.ctr = ctrN;
    payload.cpl = cplN;

    const spendN: number | null = spend.trim() === "" ? null : Number(spend);
    if (spend.trim() !== "" && !Number.isFinite(spendN as number)) {
      throw new Error("Spend must be a number");
    }
    payload.spend = spendN;

    const clicksN: number | null = clicks.trim() === "" ? null : Number(clicks);
    const impressionsN: number | null = impressions.trim() === "" ? null : Number(impressions);
    const leadsN: number | null = leads.trim() === "" ? null : Number(leads);

    if (clicksN !== null) {
      if (!Number.isFinite(clicksN) || clicksN < 0) throw new Error("Clicks must be a whole number");
      payload.clicks = Math.round(clicksN);
    } else {
      payload.clicks = null;
    }

    if (impressionsN !== null) {
      if (!Number.isFinite(impressionsN) || impressionsN < 0) throw new Error("Impressions must be a whole number");
      payload.impressions = Math.round(impressionsN);
    } else {
      payload.impressions = null;
    }

    if (leadsN !== null) {
      if (!Number.isFinite(leadsN) || leadsN < 0) throw new Error("Leads must be a whole number");
      payload.leads = Math.round(leadsN);
    } else {
      payload.leads = null;
    }

    const res = await fetch("/api/campaigns/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const out = await res.json().catch(() => null);
    if (!res.ok || !out?.ok) throw new Error(out?.error || "Failed to log results");

    closeLogModal();
    await load();
  } catch (e: any) {
    setSaveError(e?.message || "Failed to log results");
  } finally {
    setSaving(false);
  }
}
