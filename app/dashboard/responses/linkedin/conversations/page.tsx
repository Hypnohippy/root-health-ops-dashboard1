import { requireOrganisation } from "@/lib/tenantAuth";
import { conversationSnapshot } from "@/lib/linkedinConversation.server";
import ConversationLog from "./ConversationLog";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{organisationId?:string;contactId?:string}>}){
 const params=await searchParams;const {organisationId}=await requireOrganisation(params.organisationId,false);
 const state=await conversationSnapshot(organisationId,params.contactId);
 return <main className="space-y-4 p-6"><h1 className="text-2xl font-semibold">LinkedIn conversation log</h1><p>Paste the full LinkedIn thread as an exact conversation history snapshot. No individual dates or directions are inferred. Confirming a reply stops silent outreach immediately. Earlier snapshots, messages and completion receipts stay intact.</p>
 {state.contact&&<p>Contact state: {state.contact.currentStage==="engaged"?"Active conversation":state.contact.currentStage.replaceAll("_"," ")}. Recorded inbound replies suspend silent cadence.</p>}
 {state.legacyEvidence.length>0&&<details><summary>Existing receipt / pasted audit evidence — preserved exactly</summary>{state.legacyEvidence.map((r,i)=><article key={r.id+String(r.key)+i} className="my-3 rounded border p-3"><p>{r.table} · Ops confirmation: {String(r.confirmedAt||"Unknown")}. This does not establish each message’s external date or direction.</p><blockquote className="whitespace-pre-wrap">{r.message}</blockquote></article>)}</details>}
 <ConversationLog key={state.contact?.contactId||"none"} organisationId={organisationId} revision={state.revision} contacts={state.contacts.map(c=>({id:c.contactId,name:c.name||c.identity}))} selectedId={state.contact?.contactId||""} schemaAvailable={state.schemaAvailable} messages={state.messages} />
 </main>;
}
