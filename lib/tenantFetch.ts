// Forward only an explicit page selection. Membership is always checked again
// by the server; browser storage and record IDs are not organisation authority.
export function tenantFetch(input: string, init?: RequestInit) {
  const url = new URL(input, window.location.origin);
  if (url.origin === window.location.origin && /^\/api\/(ai\/|growth\/|coach$|social-accounts$|usage$)/.test(url.pathname)) {
    const selected = new URLSearchParams(window.location.search).get("organisationId");
    if (selected && !url.searchParams.has("organisationId") && !url.searchParams.has("organisation_id")) {
      url.searchParams.set("organisationId", selected);
    }
    return fetch(url.pathname + url.search, init);
  }
  return fetch(input, init);
}
