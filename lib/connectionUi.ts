export type ConnectionState = "connected" | "expired" | "reconnect_required" | "not_connected";

export type ConnectionHealth = {
  platform: string;
  state: ConnectionState;
  name: string | null;
  expiresAt: string | null;
};

export function connectionHealthByPlatform(connections: ConnectionHealth[]) {
  return new Map(connections.map((connection) => [connection.platform, connection]));
}

const providerNames: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  threads: "Threads",
  tiktok: "TikTok",
  google: "Google Business Profile",
};

export function connectionSuccessMessage(params: URLSearchParams) {
  if (params.get("connected") !== "1") return "";
  const provider = params.get("provider")?.trim().toLowerCase();
  if (!provider) return "Connection completed successfully.";
  return `${providerNames[provider] || provider.replace(/\b\w/g, (letter) => letter.toUpperCase())} connected successfully.`;
}
