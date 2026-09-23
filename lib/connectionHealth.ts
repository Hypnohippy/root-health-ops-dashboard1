export type ConnectionState = "connected" | "expired" | "reconnect_required" | "not_connected";
export type HealthAccount = {
  platform: string;
  is_active: boolean | null;
  page_access_token: string | null;
  token_expires_at: string | null;
  page_name: string | null;
};

export function connectionState(account?: HealthAccount, now = Date.now()): ConnectionState {
  if (!account) return "not_connected";
  if (!account.is_active || !account.page_access_token?.trim()) return "reconnect_required";
  if (account.token_expires_at) {
    const expiry = Date.parse(account.token_expires_at);
    if (!Number.isFinite(expiry)) return "reconnect_required";
    if (expiry <= now) return "expired";
  }
  return "connected";
}

export function connectionHealth(accounts: HealthAccount[], now = Date.now()) {
  return ["facebook", "instagram", "threads", "tiktok", "linkedin", "google", "email", "whatsapp"].map(platform => {
    const matches = accounts.filter(a => a.platform === platform);
    const account = matches.find(a => a.is_active) || matches[0];
    return {
      platform, state: connectionState(account, now),
      name: account?.page_name ?? null,
      expiresAt: account?.token_expires_at ?? null,
    };
  });
}
