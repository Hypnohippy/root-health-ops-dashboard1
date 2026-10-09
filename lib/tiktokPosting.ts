export type TikTokCreator = {
  creator_username: string; creator_nickname: string; privacy_level_options: string[];
  comment_disabled: boolean; duet_disabled: boolean; stitch_disabled: boolean; max_video_post_duration_sec: number;
};
export type TikTokSettings = {
  mode: "direct" | "draft"; privacyLevel: string; allowComment: boolean; allowDuet: boolean; allowStitch: boolean;
  caption: string; brandOrganic: boolean; brandContent: boolean; isAigc?: boolean; consent: boolean;
};
export function grantedTikTokScopes(meta: Record<string, unknown> = {}): string[] | null {
  const raw = meta.raw_refresh as Record<string, unknown> | undefined, token = meta.raw_token as Record<string, unknown> | undefined;
  const scope = meta.scopes ?? raw?.scope ?? (raw?.data as Record<string, unknown> | undefined)?.scope ?? token?.scope ?? (token?.data as Record<string, unknown> | undefined)?.scope;
  return Array.isArray(scope) ? scope.filter((s): s is string => typeof s === "string") : typeof scope === "string" ? scope.split(/[,\s]+/).filter(Boolean) : null;
}
export function creatorFields(data: Record<string, unknown>): TikTokCreator {
  if (!Array.isArray(data.privacy_level_options) || !data.privacy_level_options.length || !Number.isFinite(data.max_video_post_duration_sec) || Number(data.max_video_post_duration_sec) <= 0) throw Error("TikTok did not return usable creator settings. Refresh creator info before posting.");
  return {
    creator_username: String(data.creator_username || ""), creator_nickname: String(data.creator_nickname || ""),
    privacy_level_options: data.privacy_level_options.filter((s): s is string => typeof s === "string"),
    comment_disabled: data.comment_disabled !== false, duet_disabled: data.duet_disabled !== false, stitch_disabled: data.stitch_disabled !== false,
    max_video_post_duration_sec: Number(data.max_video_post_duration_sec),
  };
}
export function tikTokPostInfo(settings: TikTokSettings, creator: TikTokCreator) {
  if (!settings.consent) throw Error("Review the video and TikTok settings, then confirm consent before posting.");
  if (!creator.privacy_level_options.includes(settings.privacyLevel)) throw Error("Select a privacy option returned by TikTok. Refresh creator info if it changed.");
  if (typeof settings.caption !== "string" || settings.caption.length > 2200) throw Error("TikTok captions must be at most 2,200 characters.");
  if (settings.brandContent && settings.privacyLevel === "SELF_ONLY") throw Error("TikTok does not allow branded partnerships with Only me privacy.");
  return {
    title: settings.caption, privacy_level: settings.privacyLevel,
    disable_comment: creator.comment_disabled || settings.allowComment !== true,
    disable_duet: creator.duet_disabled || settings.allowDuet !== true,
    disable_stitch: creator.stitch_disabled || settings.allowStitch !== true,
    brand_organic_toggle: settings.brandOrganic === true, brand_content_toggle: settings.brandContent === true,
    ...(typeof settings.isAigc === "boolean" ? { is_aigc: settings.isAigc } : {}),
  };
}
export function tikTokOutcome(data: Record<string, unknown>, mode: "direct" | "draft") {
  const providerStatus = String(data.status || "UNKNOWN"), published = providerStatus === "PUBLISH_COMPLETE", failed = providerStatus === "FAILED";
  const ids = data.publicaly_available_post_id ?? data.publicly_available_post_id;
  const postIds = Array.isArray(ids) ? ids.map(String).slice(0, 20) : [];
  return { ok: !failed, published, pending: !published && !failed, manualCompletionRequired: mode === "draft" && !published && !failed,
    providerStatus, postIds, postId: postIds[0] || null, postedId: postIds[0] || null,
    failReason: failed ? String(data.fail_reason || "provider_failed").replace(/[^a-zA-Z0-9_ -]/g, "").slice(0, 150) : null,
    userMessage: failed ? `TikTok reported failure: ${String(data.fail_reason || "provider_failed").replace(/[^a-zA-Z0-9_ -]/g, "").slice(0, 150)}.` : published ? "TikTok confirms publication." : mode === "draft" ? "Draft upload accepted. Finish the existing draft in TikTok inbox. Do not upload it again." : "TikTok is processing this Direct Post. Refresh status; do not upload again.",
  };
}
