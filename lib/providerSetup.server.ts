// Server-only configuration presence. No values or secrets leave this helper.
export function providerConfigured(platform: string, env: Record<string, string | undefined> = process.env, requestOrigin?: string): boolean | null {
  if (!["facebook", "instagram", "linkedin", "threads", "tiktok", "google"].includes(platform)) return null;
  if ((env.OAUTH_STATE_SECRET?.trim().length || 0) < 32) return false;
  const has = (key: string) => !!env[key]?.trim();
  const https = (key: string) => { try { const u = new URL(env[key] || ""); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; } };
  const originReady = has("NEXT_PUBLIC_APP_URL") ? https("NEXT_PUBLIC_APP_URL") : (() => { try { const u = new URL(requestOrigin || ""); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; } })();
  if (["facebook", "instagram"].includes(platform)) return (has("FACEBOOK_APP_ID") || has("META_APP_ID")) && (has("META_APP_SECRET") || has("FACEBOOK_APP_SECRET")) && originReady;
  if (platform === "linkedin") return has("LINKEDIN_CLIENT_ID") && has("LINKEDIN_CLIENT_SECRET") && originReady;
  if (platform === "threads") return has("THREADS_CLIENT_ID") && has("THREADS_CLIENT_SECRET") && originReady;
  if (platform === "tiktok") return has("TIKTOK_CLIENT_KEY") && has("TIKTOK_CLIENT_SECRET") && https("TIKTOK_REDIRECT_URI") && originReady;
  if (platform === "google") return has("GOOGLE_CLIENT_ID") && has("GOOGLE_CLIENT_SECRET") && https("GOOGLE_REDIRECT_URI") && originReady;
  return null;
}
