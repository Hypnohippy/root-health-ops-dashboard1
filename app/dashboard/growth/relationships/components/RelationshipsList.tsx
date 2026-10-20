"use client";
import {useEffect,useState} from "react";
import type {PrimaryRelationshipsPage} from "@/lib/relationshipDiscovery.server";
import {OpsIntelligenceCard} from "../../../components/visual/OpsSurface";
import {OverviewIcon} from "./RelationshipOverviewVisuals";
import RelationshipDiscovery from "./RelationshipDiscovery";

export default function RelationshipsList({organisationId,initial}:{organisationId:string;initial:PrimaryRelationshipsPage}){
  const [q,setQ]=useState(""),[view,setView]=useState("active"),[page,setPage]=useState(0),[result,setResult]=useState(initial),[error,setError]=useState("");
  useEffect(()=>{
    const fromUrl=new URLSearchParams(window.location.search).get("q")||"";
    if(fromUrl){setQ(fromUrl);setPage(0);}
    const onSearch=(event:Event)=>{setQ((event as CustomEvent<{query?:string}>).detail?.query||"");setPage(0);};
    window.addEventListener("ops-relationship-search",onSearch);
    return()=>window.removeEventListener("ops-relationship-search",onSearch);
  },[]);
  useEffect(()=>{
    const abort=new AbortController();
    const timer=setTimeout(()=>{fetch(`/api/growth/relationships?${new URLSearchParams({organisationId,q,view,page:String(page)})}`,{cache:"no-store",signal:abort.signal})
      .then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||"Relationships could not be loaded.");if(!abort.signal.aborted){setResult(data);setError("");}})
      .catch(e=>{if(!abort.signal.aborted)setError(e.message);});},250);
    return()=>{clearTimeout(timer);abort.abort();};
  },[organisationId,q,view,page]);

  const people=result.items.filter(r=>r.entityKind==="person"||r.entityKind==="person_with_company").length;
  const companies=result.items.filter(r=>r.entityKind==="company").length;

  return <main className="relationship-list mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-8">
    <header className="relationship-list-header relationship-list-hero">
      <div className="relationship-list-hero-copy"><p>Growth · One relationship, shared history</p><h1><OverviewIcon kind="conversation"/>Relationships</h1><p>People and companies from your recorded work. Search from the command bar above and open the full relationship picture without changing source records.</p></div>
      <div className="relationship-list-hero-art" aria-hidden="true"><span/><span/><span/></div>
    </header>
    <section className="relationship-list-briefing" aria-label="Relationship collection">
      <OpsIntelligenceCard title="Your relationships" tone="blue"><p>{result.total} in the current view</p><p>Canonical identities, with source coverage.</p></OpsIntelligenceCard>
      <OpsIntelligenceCard title="People & companies" tone="violet"><p>{people} people · {companies} companies on this page</p><p>Unestablished identities remain clearly marked.</p></OpsIntelligenceCard>
      <OpsIntelligenceCard title="Open the full picture" tone="green"><p>Context → conversation → next move</p><p>Operational status and actions retain their existing authority.</p></OpsIntelligenceCard>
    </section>
    <div className="relationship-list-filterbar">
      <p><strong>{result.total}</strong> relationships{q?<> matching <span>“{q}”</span></>:null}</p>
      <label>Show<select aria-label="Relationship retention" value={view} onChange={e=>{setView(e.target.value);setPage(0);}}><option value="active">Active and stale</option><option value="stale">Stale</option><option value="closed">Closed / converted</option><option value="all">All, including archived</option><option value="archived">Archived</option></select></label>
    </div>
    {error&&<p role="alert">{error}</p>}
    {!result.storageAvailable&&<p className="text-sm text-amber-800">Relationship storage is not enabled yet. Existing relationships remain available read-only.</p>}
    <RelationshipDiscovery items={result.items}/>
    {result.items.length===0&&<p>No matching relationships.</p>}
    <div className="flex items-center gap-4"><button disabled={page===0} onClick={()=>setPage(p=>p-1)} className="rounded-lg border border-white/15 px-4 py-2 disabled:opacity-40">Previous</button><span>Page {page+1}</span><button disabled={(page+1)*25>=result.total} onClick={()=>setPage(p=>p+1)} className="rounded-lg border border-white/15 px-4 py-2 disabled:opacity-40">Next</button></div>
  </main>;
}
