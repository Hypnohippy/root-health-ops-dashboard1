import type { BrandGrowthProfile } from "@/lib/brandGrowthProfile";

export type ProfileResponse = { organisationId: string; canEdit: boolean; organisationName: string; profile: BrandGrowthProfile; updatedAt: string | null };
export async function fetchOrganisationProfile(organisationId?: string, patch?: Partial<BrandGrowthProfile>, signal?: AbortSignal): Promise<ProfileResponse> {
  const query = organisationId ? `?organisationId=${encodeURIComponent(organisationId)}` : "";
  const response = await fetch(`/api/organisation/profile${query}`, {
    method: patch ? "PATCH" : "GET", cache: "no-store", signal,
    ...(patch ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: patch }) } : {}),
  });
  const data = await response.json();
  if (!response.ok || !data?.success) throw new Error(data?.error || "Could not load or save the profile.");
  return data;
}
