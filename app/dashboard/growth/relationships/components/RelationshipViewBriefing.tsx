import type { EvidenceEvent,Row } from "@/lib/relationshipWorkspace";
import { OpsIntelligenceCard } from "../../../components/visual/OpsSurface";
type Trail={dated:EvidenceEvent[];undated:EvidenceEvent[]};
/** Display only: counts stored entries without interpreting their content or advancing state. */
export default function RelationshipViewBriefing({view,conversation,history,tasks}:{view:string;conversation:Trail;history:Trail;tasks:Row[]}) {
 const copy:Record<string,[string,string,string,string,string,string]>={
 Conversation:["The conversation",`${conversation.dated.length} dated entries`,`${conversation.undated.length} undated entries / snapshots`,"Exact words, preserved","Stored source text remains unchanged.","Read the context, then act in the existing guarded workflow."],
 History:["The relationship timeline",`${history.dated.length} dated events`,`${history.undated.length} undated entries`,"Evidence, not assumptions","Actual event dates and recording dates stay distinct.","Follow the recorded history before deciding the next move."],
 Notes:["Your relationship memory","Observations & ideas","Typed notes remain separate from manual contact activity.","Keep the distinction","A strategic thought is not a confirmed fact.","Record a note or activity explicitly. Nothing is sent."],
 Strategy:["The Strategy Room","Relationship-wide AI","Read-only reasoning from the canonical relationship evidence.","Grounded in your evidence","Sources and operational state remain authoritative.","Ask a Strategy question, or explicitly record your own Strategic thought note."],
 Tasks:["Your next commitments",`${tasks.filter(t=>t.status==="open").length} open tasks`,`${tasks.filter(t=>t.status==="done").length} completed tasks`,"Human-owned actions","Tasks are explicit commitments, separate from cadence.","Create or update a task only when you choose to do so."]
 };
 const c=copy[view];if(!c)return null;
 return <section className="relationship-view-briefing" aria-label={`${view} briefing`}><OpsIntelligenceCard title={c[0]} tone="blue"><p>{c[1]}</p><p>{c[2]}</p></OpsIntelligenceCard><OpsIntelligenceCard title={c[3]} tone="violet"><p>{c[4]}</p></OpsIntelligenceCard><OpsIntelligenceCard title="What you can do next" tone="green"><p>{c[5]}</p></OpsIntelligenceCard></section>;
}
