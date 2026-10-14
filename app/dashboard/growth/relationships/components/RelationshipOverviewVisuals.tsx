import type { EvidenceEvent, Row } from "@/lib/relationshipWorkspace";
import { stageLabel } from "@/lib/relationshipWorkspace";
import { money, type calculateValue } from "@/lib/relationshipValue";
import { OpsSurface } from "../../../components/visual/OpsSurface";
type Trail={dated:EvidenceEvent[];undated:EvidenceEvent[]};
type Value=ReturnType<typeof calculateValue>|undefined;

/** Counts stored entries, not inferred messages within pasted conversation snapshots. */
export function overviewEvidence(conversation:Trail,history:Trail,tasks:Row[]) {
 const entries=[...new Map([...conversation.dated,...conversation.undated].map(e=>[e.id,e])).values()];
 const dated=[...new Map(history.dated.map(e=>[e.id,e])).values()].filter(e=>e.at&&Number.isFinite(Date.parse(e.at)));
 const days=new Map<string,number>();for(const e of dated){const date=new Date(e.at!).toISOString().slice(0,10);days.set(date,(days.get(date)||0)+1);}
 return {entries:entries.length,snapshots:entries.filter(e=>e.direction==="snapshot").length,openTasks:tasks.filter(t=>t.status==="open").length,days:[...days].sort(([a],[b])=>a.localeCompare(b)).slice(-7).map(([date,count])=>({date,count}))};
}
export function OverviewIcon({kind,className=""}:{kind:string;className?:string}) {
 const paths:Record<string,string>={check:"m5 12 4 4L19 6",person:"M4 21v-2a8 8 0 0 1 16 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",company:"M4 21V3h12v18M16 9h4v12M8 7h4M8 11h4M8 15h4M3 21h18",search:"M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-2 4 6 6",research:"M4 4h7v16H4zM14 4h6v16h-6",contact:"m3 11 18-8-8 18-2-8-8-2Zm8 2L21 3",conversation:"M3 4h18v13H8l-5 4V4",opportunity:"M4 21V10M10 21V6M16 21V3M3 21h18",won:"M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 13v6m-4 2h8",clock:"M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",task:"m8 12 3 3 6-7M5 3h14v18H5z",snapshot:"M3 5h18v14H3zM7 9h10M7 13h6",spark:"m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"};
 return <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]||paths.clock}/></svg>;
}
export function RelationshipAvatar({name,kind}:{name:string;kind:"person"|"company"}) {const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(n=>Array.from(n)[0]).join("").toUpperCase();return <span className="relationship-avatar relationship-avatar-rich" aria-hidden="true"><span>{initials}</span><i><OverviewIcon kind={kind}/></i></span>;}
export function RelationshipHealthCard(){return <section className="relationship-health-card" aria-label="Relationship health and momentum"><span className="relationship-health-symbol"><OverviewIcon kind="opportunity"/></span><div><h2>Relationship Health</h2><strong>Not established</strong><p>Momentum not assessed</p></div><div className="relationship-health-empty" aria-hidden="true"><span/><span/><span/><span/><span/></div><small>No recorded health assessment</small></section>;}
export function ValueEvidenceGraphic({value}:{value:Value}) {
 const potential=value?.potential,expected=value?.expected,potentialKnown=typeof potential==="number"&&Number.isFinite(potential)&&potential>=0;
 const expectedKnown=typeof expected==="number"&&Number.isFinite(expected)&&expected>=0;
 const available=potentialKnown||expectedKnown;
 const max=Math.max(potentialKnown?potential:0,expectedKnown?expected:0,1);
 return <figure className={`relationship-value-graphic ${available?"":"is-unestablished"}`} aria-label={available?"Saved scope value comparison; not a growth forecast":"Value comparison not established"}>
 {available?<><svg viewBox="0 0 180 66" role="img" aria-label={`Potential ${potentialKnown?money(potential,value?.input.currency):"not established"}; expected ${expectedKnown?money(expected,value?.input.currency):"not established"}. Scope comparison only.`}><path d="M14 55h154" stroke="#abcdb9"/>{potentialKnown?<rect x="44" y={53-42*(potential/max)} width="28" height={42*(potential/max)} rx="3" fill="#119560"/>:<rect x="44" y="16" width="28" height="37" rx="3" fill="none" stroke="#a9bcb5" strokeDasharray="3 3"/>}{expectedKnown?<rect x="108" y={53-42*(expected/max)} width="28" height={42*(expected/max)} rx="3" fill="#76b6a6"/>:<rect x="108" y="16" width="28" height="37" rx="3" fill="none" stroke="#a9bcb5" strokeDasharray="3 3"/>}<text x="58" y="65" textAnchor="middle">Potential</text><text x="122" y="65" textAnchor="middle">Expected</text></svg><figcaption>Saved scope comparison · not growth</figcaption></>:<><div className="relationship-empty-chart" aria-hidden="true"><span/><span/><span/></div><figcaption>Value comparison<br/><strong>Not established</strong></figcaption></>}
 </figure>;
}
const pipelineStages=["Discovered","Researched","Contacted","Conversation","Opportunity","Won"];
export function CommercialPipelineCard({stage,nextAction,due,children}:{stage:string;nextAction:string;due:string|null;children?:React.ReactNode}){
 // Only these lifecycle states directly establish one displayed pipeline stage. Never fill prior steps.
 const current=({new:"Discovered",researched:"Researched",engaged:"Conversation",meeting:"Opportunity",converted:"Won"} as Record<string,string>)[stage]||null;
 return <OpsSurface className="relationship-commercial-pipeline"><header><h2><OverviewIcon kind="opportunity"/>Commercial Pipeline</h2><span>Recorded state</span></header><ol className="relationship-stage-ribbon" aria-label="Current lifecycle stage; earlier stages are not inferred">{pipelineStages.map((step,i)=><li key={step} data-current={current===step} data-stage={i}>{step}</li>)}</ol><p className="relationship-pipeline-state">Current state: <strong>{stageLabel(stage)}</strong>{!current&&<span> · Pipeline stage not established</span>}</p><div className="relationship-pipeline-details"><div><small><OverviewIcon kind="task"/>Next recorded move</small><strong>{nextAction}</strong></div><div><small><OverviewIcon kind="clock"/>Next due</small><strong>{due||"Not established"}</strong></div></div>{children}</OpsSurface>;
}
export function RelationshipMetricsCard({evidence,value}:{evidence:ReturnType<typeof overviewEvidence>;value:Value}) {
 const max=Math.max(...evidence.days.map(d=>d.count),1);
 return <OpsSurface className="relationship-key-metrics"><header><h2>Key Metrics &amp; Value</h2><span>This relationship</span></header><div className="relationship-metric-tiles">{[["conversation",evidence.entries,"Stored entries"],["snapshot",evidence.snapshots,"Snapshots"],["task",evidence.openTasks,"Open tasks"],["won",money(value?.expected??null,value?.input.currency),value?.recurring?"Expected / year":"Expected value"]].map(([kind,amount,label])=><div key={String(label)}><OverviewIcon kind={String(kind)}/><strong>{amount}</strong><span>{label}</span></div>)}</div><p className="relationship-expected-basis">{value?.expectedBasis||"Expected scope and pricing not established"}</p>
 {evidence.days.length>=2?<figure className="relationship-activity-trend"><figcaption>Recorded events by date <span>UTC · last {evidence.days.length} dates with records</span></figcaption><svg viewBox="0 0 300 63" role="img" aria-label={evidence.days.map(d=>`${d.date}: ${d.count} recorded events`).join("; ")}>{evidence.days.map((d,i)=>{const x=24+i*(250/Math.max(evidence.days.length-1,1));return <g key={d.date}><rect x={x-8} y={39-27*d.count/max} width="16" height={27*d.count/max} rx="3" fill="#56a989"/><text x={x} y="10" textAnchor="middle">{d.count}</text><text x={x} y="58" textAnchor="middle">{d.date.slice(5)}</text></g>;})}<path d="M8 40h284" stroke="#bbd7cb"/></svg></figure>:<div className="relationship-trend-unestablished"><OverviewIcon kind="opportunity"/><div><strong>Activity trend · Not established</strong><p>Two dated days of recorded events required.</p></div></div>}
 <p className="relationship-metrics-caveat">Entries are stored evidence, not inferred messages inside snapshots. No performance or revenue trend is assumed.</p></OpsSurface>;
}
