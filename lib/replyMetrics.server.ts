import { supabaseAdmin } from "@/lib/supabaseAdmin";
type ReplyEvidence = { id: string; platform?: string; kind?: string; email_delivery_status?: string; email_sent_at?: string; last_replied_at?: string; last_reply_text?: string; manual_completion?: { completed_at?: string; evidence?: string } | null };
/** Confirmed response records, not provider delivery attempts or LinkedIn acceptances. */
export function countConfirmedReplies(rows: ReplyEvidence[], from: Date | null, to: Date | null) {
  const confirmed = new Set<string>();
  for (const row of rows) {
    if (row.kind === "connection_accepted") continue;
    const manual = row.manual_completion?.evidence ? row.manual_completion.completed_at : null;
    const sent = row.platform === "email" ? row.email_delivery_status === "sent" ? row.email_sent_at : null : row.last_reply_text?.trim() ? row.last_replied_at : null;
    const at = Date.parse(manual || sent || "");
    if (Number.isFinite(at) && (!from || at >= from.getTime()) && (!to || at <= to.getTime())) confirmed.add(row.id);
  }
  return confirmed.size;
}
export async function readConfirmedReplyCount(organisationId: string, from: Date | null, to: Date | null): Promise<number | null> {
  try {
    const rows: ReplyEvidence[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabaseAdmin.from("inbox_items")
        .select("id,platform,kind,email_delivery_status,email_sent_at,last_replied_at,last_reply_text,manual_completion")
        .eq("organisation_id", organisationId).order("id").range(offset, offset + 499);
      if (error || !data) return null;
      rows.push(...data);
      if (data.length < 500) return countConfirmedReplies(rows, from, to);
    }
  } catch { return null; }
}
