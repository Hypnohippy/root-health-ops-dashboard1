"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import LinkedInHistoricalSend from "@/app/dashboard/responses/linkedin/LinkedInHistoricalSend";
import { tenantFetch } from "@/lib/tenantFetch";
type Item = { name: string; table: "growth_targets" | "inbox_items"; id: string; message: string; confirmedAt: string | null; status: string };
export default function SendDateReview({ items, organisationId, revision }: { items: Item[]; organisationId: string; revision: string }) {
 const [selected, setSelected] = useState<string | null>(null);
 const router = useRouter();
 return <section className="mt-6 space-y-4"><h2 className="text-xl font-semibold">Review previous sends</h2>
 <p>These records preserve the confirmed message, but do not establish its external LinkedIn send date. No cadence is scheduled until the date is verified. Confirming a classification saves an auditable correction.</p>
 {items.map(item => <article key={item.table + item.id} className="rounded border border-white/20 p-4">
 <h3>{item.name} — {item.status === "unknown" ? "Historical send date unknown" : "Actual send date unverified"}</h3>
 <p>Ops confirmation: {item.confirmedAt ? new Date(item.confirmedAt).toLocaleString("en-GB", { timeZone: "Europe/London" }) + " Europe/London" : "Not recorded"}</p>
 <blockquote className="my-3 whitespace-pre-wrap">{item.message}</blockquote>
 {selected === item.id ? <LinkedInHistoricalSend review confirmedAt={item.confirmedAt} message={item.message} onCancel={() => setSelected(null)} onConfirm={async body => {
  const response = await tenantFetch("/api/growth/linkedin-console", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, action: "classify_send", table: item.table, id: item.id, organisationId, revision }) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Classification failed.");
  setSelected(null); router.refresh();
 }} /> : <button className="rounded border px-3 py-2" onClick={() => setSelected(item.id)}>Review send date</button>}
 </article>)}
 </section>;
}
