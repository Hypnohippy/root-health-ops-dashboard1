import { AccessError, requireOrganisation } from "@/lib/tenantAuth";
/** The legacy base has no row-level tenant ownership. Bind it explicitly; never infer an owner. */
export async function requireAirtableOrganisation(requested: unknown, write: boolean) {
  const tenant = await requireOrganisation(requested, write);
  const owner = process.env.AIRTABLE_ORGANISATION_ID?.trim();
  if (!owner) throw new AccessError("Legacy Airtable ownership is not configured.", 503);
  if (tenant.organisationId !== owner) throw new AccessError("Airtable is not connected to this organisation.");
  return tenant;
}
