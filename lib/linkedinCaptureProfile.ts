// Shared URL validation only. Never fetches or scrapes LinkedIn.
export function verifiedLinkedInProfile(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port || !["linkedin.com", "www.linkedin.com", "uk.linkedin.com", "m.linkedin.com"].includes(u.hostname.toLowerCase())) return null;
    const path = u.pathname.replace(/^\/comm\/in\//i, "/in/");
    if (!/^\/in\/[a-z0-9_%.-]+\/?$/i.test(path)) return null;
    return `https://www.linkedin.com${path.replace(/\/$/, "").toLowerCase()}`;
  } catch { return null; }
}
export function connectionNote(person: { name: string; headline?: string }) {
  const first = person.name.trim().split(/\s+/)[0] || "there";
  const role = person.headline?.trim().slice(0, 140);
  return `Hi ${first}, ${role ? `your work as ${role} caught my attention. ` : ""}I'd be glad to connect.`.slice(0, 300);
}
