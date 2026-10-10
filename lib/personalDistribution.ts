import { contentSignal, personalSignal, type PersonalSignalItem } from "@/lib/personalSignal";

export type PersonalDistribution = "SEARCH_ASSET" | "SOCIAL_CONTENT" | "PUBLIC_RESPONSE";
export function personalDistributionKind(item: PersonalSignalItem): PersonalDistribution | null {
  if (item.source_engine !== "root_health_personal") return null;
  if (personalSignal(item)) return "PUBLIC_RESPONSE";
  if (contentSignal(item)) return "SOCIAL_CONTENT";
  const m = item.metadata || {};
  const safety = m.engine_safety as Record<string, unknown> | undefined;
  if (item.source_engine === "root_health_personal" && item.record_type === "personal_opportunity" && item.source_record_id &&
      /search.?demand|search_asset/i.test(String(m.lane || "") + " " + String(m.action_type || "") + " " + String(m.sheet_tab || "")) &&
      !/partner|referr/i.test(String(m.lane || "") + " " + String(m.sheet_tab || "")) &&
      safety?.public_context === true && safety.consumer_outreach === false && safety.health_targeting === false && typeof item.evidence === "string" && Boolean(item.evidence.trim()) &&
      !/suicid|self[- ]harm|kill myself|end my life|immediate danger/i.test([item.evidence,item.signal,item.reason,m.original_post,m.content_draft].join(" "))) return "SEARCH_ASSET";
  return null;
}
export type PersonalPerformance = {
  publishing: { id: string; status: string; approval: string | null } | null;
  funnel: Record<string, number> | null;
};
