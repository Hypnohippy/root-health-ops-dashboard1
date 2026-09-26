import type { ConnectionCapabilityHealth } from "@/lib/channelCapabilities";
import type { ProviderSetup } from "@/lib/providerSetup";
export type ConnectionState = "connected" | "expired" | "reconnect_required" | "not_connected";

export type ConnectionHealth = {
  platform: string;
  setup?: ProviderSetup;
  state: ConnectionState;
  name: string | null;
  expiresAt: string | null;
} & Partial<ConnectionCapabilityHealth>;

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
  if (!provider) return "Credential saved. Operational capabilities remain unverified.";
  return `${providerNames[provider] || provider.replace(/\b\w/g, (letter) => letter.toUpperCase())} credential saved. Operational capabilities remain unverified.`;
}
