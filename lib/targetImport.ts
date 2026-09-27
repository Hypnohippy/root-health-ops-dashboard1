import { buildContactLifecycle, lifecycleIdentityKeys, lifecycleLinkedInIdentity, type LifecycleInput, type LifecycleRow } from "@/lib/contactLifecycle";
export function planTargetImport(organisationId: string, input: LifecycleInput, rows: Record<string, unknown>[]) {
  const working = { ...input, growth_targets: input.growth_targets.filter(r => r.organisation_id === organisationId).slice() };
  const inserts: Record<string, unknown>[] = [];
  let duplicates = 0, skippedAmbiguous = 0;
  for (const [index, row] of rows.entries()) {
    const candidate: LifecycleRow = { ...row, id: `csv-preview-${index}`, organisation_id: organisationId };
    const keys = lifecycleIdentityKeys("growth_targets", candidate);
    if (!keys.length) { skippedAmbiguous++; continue; }
    const contact = buildContactLifecycle(organisationId, { ...working, growth_targets: [...working.growth_targets, candidate] })
      .find(c => c.records.some(r => r.table === "growth_targets" && r.id === candidate.id))!;
    if (contact.records.some(r => r.table === "growth_targets" && r.id !== candidate.id)) { duplicates++; continue; }
    // Conflicting strong aliases or ambiguous fallback names must not mint another target.
    const strong = keys.filter(k => !k.startsWith("person_org:"));
    const intersects = working.growth_targets.some(existing => lifecycleIdentityKeys("growth_targets", existing).some(key => (strong.length ? strong : keys).includes(key)));
    if (intersects) { skippedAmbiguous++; continue; }
    const canonical = { ...row, linkedin_identity: lifecycleLinkedInIdentity(row.linkedin_url),
      email: keys.find(k => k.startsWith("email:"))?.slice(6) || null };
    inserts.push(canonical); working.growth_targets.push({ ...candidate, ...canonical });
  }
  return { inserts, duplicates, skippedAmbiguous };
}

/** Preserve quoted names/organisations so commas cannot silently change identity. */
export function parseTargetCSV(text: string) {
  const records: string[][] = []; let record: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && c === ',') { record.push(field.trim()); field = ""; }
    else if (!quoted && (c === '\n' || c === '\r')) { if (c === '\r' && text[i + 1] === '\n') i++; record.push(field.trim()); if (record.some(Boolean)) records.push(record); record = []; field = ""; }
    else field += c;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  record.push(field.trim()); if (record.some(Boolean)) records.push(record);
  const headers = records.shift() || [];
  if (!headers.length || new Set(headers.map(h => h.toLowerCase())).size !== headers.length) throw new Error("CSV headers must be present and unique.");
  return records.map(values => {
    if (values.length !== headers.length) throw new Error("CSV row does not match its headers.");
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}
