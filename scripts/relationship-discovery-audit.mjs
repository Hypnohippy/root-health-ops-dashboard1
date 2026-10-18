/** Local replay only. Reads a body-free snapshot; never connects to Production. */
import fs from 'node:fs';
import {loadTruthModule} from '../tests/relationship-truth-loader.mjs';
const [snapshotPath,outputPath]=process.argv.slice(2);if(!outputPath)throw Error('Usage: snapshot output');
const s=JSON.parse(fs.readFileSync(snapshotPath,'utf8')),organisationId='78fa2ac8-e7b6-4b9b-9604-035723ece6b1';
const lifecycle={acquisition_items:s.acquisition_items,inbox_items:s.inbox_items,growth_targets:s.growth_targets};
const input={lifecycle,founder:s.founder_research_records,founderActivities:s.founder_activity_events,emailMessages:s.email_conversation_messages,linkedinMessages:s.linkedin_conversation_messages,workspaces:s.relationship_workspaces,links:s.relationship_source_links,activities:s.relationship_activity_events,tasks:s.relationship_tasks,acquisitionEvents:s.acquisition_item_events,responseEvents:s.response_item_events};
const policy={organisationId,founderAllowed:true,asOf:s.captured_at},context={input,policy,ledger:s.ledger};
const d=loadTruthModule('lib/relationshipDiscovery.ts'),w=loadTruthModule('lib/relationshipWorkspace.ts'),core=loadTruthModule('lib/relationshipIdentityReconciliation.ts');
const old=loadTruthModule('lib/relationshipWorkspace.server.ts',{'@/lib/supabaseAdmin':{},'@/lib/founderIntelligenceAuth.server':{},'@/lib/tenantAuth':{},'@/lib/lifecycleSnapshot.server':{},'@/lib/opsSearch.server':{},'@/lib/relationshipHistory.server':{}});
const ctx={tenant:{organisationId},input:lifecycle,founder:s.founder_research_records,canFounder:true,items:w.projectRelationships(organisationId,lifecycle,s.founder_research_records),workspaces:s.relationship_workspaces,links:s.relationship_source_links,models:[],values:[],storageAvailable:true};
const before=JSON.stringify(input),start=performance.now(),inventory=d.relationshipDiscoveryInventory(context),inventoryMs=Math.round(performance.now()-start);
const allCurrent=q=>old.relationshipListInventory(ctx,q,'all');
const currentRefs=rows=>{const locators=new Set(rows.map(r=>r.locator));return ctx.items.filter(r=>locators.has(r.locator)||r.refs.some(ref=>ctx.links.some(l=>l.source_table===ref.table&&l.source_id===ref.id&&locators.has('workspace_'+l.workspace_id))));};
const probes=[['Tracy','name','Tracy Fountain'],['Tracy','company','Leading with Compassion'],['Tracy','known_email','tracy@leadingwithcompassion.com'],['Simon','name','Simon Rawlings'],['Frank','name','Frank Rourke'],['Courtney','name','Courtney McCormick'],['Airbus','company','Airbus']];
const tracy=inventory.entries.filter(e=>e.labels.some(l=>l.toLowerCase().includes('tracy fountain')));
const tracyProfiles=[...new Set(tracy.flatMap(e=>e.result.verifiedAliases.filter(a=>a.type==='linkedin').map(a=>a.value)))];
for(const profile of tracyProfiles)probes.push(['Tracy','linkedin',profile]);
const results=probes.map(([name,facet,q])=>{const current=allCurrent(q),truth=d.findRelationships(q,context,inventory);return {case:name,facet,current:current.length,truth:truth.length,...d.compareRelationshipDiscovery(inventory,truth,currentRefs(current)),labels:truth.map(t=>t.displayLabel),contactAssociations:truth.flatMap(t=>t.recordedContacts.map(c=>c.name)).filter(Boolean)};});
const baseline=core.identityDecisionPartition(input,policy),parent=new Map(baseline.groups.map((_,i)=>[i,i])),root=i=>parent.get(i)===i?i:root(parent.get(i));
const key=r=>r.table+':'+r.id;
for(const decision of inventory.partition.activeDecisions.filter(d=>d.decision==='same_relationship')){const a=baseline.byRef.get(key(decision.sourceRefA)),b=baseline.byRef.get(key(decision.sourceRefB));parent.set(root(a),root(b));}
let unsupportedJoins=0;for(const group of inventory.partition.groups)for(const member of group)if(root(baseline.byRef.get(group[0]))!==root(baseline.byRef.get(member)))unsupportedJoins++;
const separationViolations=inventory.partition.activeDecisions.filter(d=>d.decision==='keep_separate'&&inventory.partition.byRef.get(key(d.sourceRefA))===inventory.partition.byRef.get(key(d.sourceRefB))).length;
const reconciledResults=inventory.entries.filter(e=>e.result.reconciliationStatus==='confirmed');
if(unsupportedJoins||separationViolations||JSON.stringify(input)!==before)throw Error('STOP: discovery safety invariant');
const report={mode:'READ_ONLY_DISCOVERY_REPLAY',captureAt:s.captured_at,coverage:'Identity-only stored snapshot; existing full-text/body search is not represented. No operational state conclusions taken from Truth.',
 inventoryCurrent:allCurrent('').length,inventoryTruth:inventory.entries.length,currentSearchableRelationships:ctx.items.filter(r=>r.name||r.company).length,truthSearchableRelationships:inventory.entries.filter(e=>e.labels.length).length,
 ambiguousTruthResults:inventory.entries.filter(e=>e.result.ambiguity.state!=='established').length,reconciledResultsCollapsed:reconciledResults.length,reconciledSourceCoverage:reconciledResults.map(e=>e.result.sourceCoverage.count),
 explicitlySeparatedResults:inventory.entries.filter(e=>e.result.reconciliationStatus==='separated').length,productionSeparationAvailable:false,syntheticSeparationContract:true,
 newlyDiscoverableAcrossProbes:results.reduce((sum,r)=>sum+r.truthOnly,0),newlyDiscoverableScope:'Query-result gains summed across listed probes, not unique people or new joins',probes:results,
 unsupportedJoins,separationViolations,sourceMutation:false,operationalChanges:0,ledgerRows:s.ledger.length,newDecisions:0,inventoryMilliseconds:inventoryMs};
fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
