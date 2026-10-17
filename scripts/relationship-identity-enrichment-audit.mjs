/** Offline/body-free stored-evidence audit. No credentials, database client or write API. */
import fs from 'node:fs';
import {loadTruthModule} from '../tests/relationship-truth-loader.mjs';
const [snapshotPath,outputPath]=process.argv.slice(2);
if(!outputPath)throw Error('Usage: node scripts/relationship-identity-enrichment-audit.mjs body-free-snapshot.json report.json');
const s=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
const input={lifecycle:s,founder:s.founder_research_records,founderActivities:s.founder_activity_events,emailMessages:s.email_conversation_messages,linkedinMessages:s.linkedin_conversation_messages,workspaces:s.relationship_workspaces,links:s.relationship_source_links,activities:s.relationship_activity_events,tasks:s.relationship_tasks,acquisitionEvents:s.acquisition_item_events,responseEvents:s.response_item_events};
const policy={organisationId:'78fa2ac8-e7b6-4b9b-9604-035723ece6b1',founderAllowed:true,asOf:s.captured_at};
const core=loadTruthModule('lib/relationshipIdentityReconciliation.ts');
const enrich=loadTruthModule('lib/relationshipIdentityEnrichment.ts');
const before=JSON.stringify(input),review=core.reconciliationCandidates(input,policy);
const result=enrich.enrichIdentityReview(input,policy,review.candidates,s.ledger);
if(JSON.stringify(input)!==before)throw Error('STOP: source mutation');
const counts=rows=>Object.fromEntries(['NOW_SAFE_FOR_HUMAN_REVIEW','STILL_AMBIGUOUS','MUST_REMAIN_SEPARATE','DEFER_DUE_TO_ACTIVE_WORKFLOW'].map(d=>[d,rows.filter(r=>r.disposition===d).length]));
// A group is not declared safe unless every unresolved pair is safe. Deferrals take
// precedence over unresolved review; a hard separation takes precedence over both.
const rank=['MUST_REMAIN_SEPARATE','DEFER_DUE_TO_ACTIVE_WORKFLOW','STILL_AMBIGUOUS','NOW_SAFE_FOR_HUMAN_REVIEW'];
const groupIds=[...new Set(result.flatMap(r=>r.groupIds))];
const groups=groupIds.map(id=>{const pairs=result.filter(r=>r.groupIds.includes(id));return {id,disposition:rank.find(d=>pairs.some(r=>r.disposition===d)),pairIds:pairs.map(r=>r.pairId),gainedAuthoritativeEvidence:pairs.some(r=>r.gainedAuthoritativeEvidence)};});
const report={mode:'READ_ONLY_STORED_EVIDENCE_ENRICHMENT',capturedAt:s.captured_at,project:s.project,atomic:true,
 scope:'Stored Ops evidence only. No live Gmail/LinkedIn/external lookup. No decisions or grouping changes.',
 sourceCounts:Object.fromEntries(Object.entries(s).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length])),
 originalReviewGroups:review.groupCount,originalReviewPairs:review.candidates.length,alreadyConfirmedPairsExcluded:review.candidates.length-result.length,
 unresolvedGroupsReviewed:groups.length,unresolvedPairsReviewed:result.length,groupClassifications:counts(groups),pairClassifications:counts(result),
 groupsWithNewAuthority:groups.filter(g=>g.gainedAuthoritativeEvidence).length,pairsWithNewAuthority:result.filter(r=>r.gainedAuthoritativeEvidence).length,
 upgrades:result.filter(r=>r.disposition==='NOW_SAFE_FOR_HUMAN_REVIEW').map(r=>({pairId:r.pairId,evidenceSources:[...new Set(r.evidence.filter(e=>e.canAuthoriseIdentity).map(e=>e.evidenceType))]})),
 operationalWrites:0,newDecisions:0,newJoins:0,sourceMutation:false,consumerMigration:false,
 groups,candidates:result.map(r=>({...r,evidence:r.evidence.map(({value,...e})=>({...e,value:'[withheld from committed report; exact value retained only in local snapshot]',valuePresent:!!value}))})),
 limitations:['Deliverability PASSED does not prove a named person owns a shared mailbox.','Absence of captured evidence does not establish absence in Gmail.','Historical activity alone is not pair-level identity authority.','Recorded outbound/reply/due dependencies are conservatively deferred; no assertion that they are currently overdue.','No shadow identity graph was changed; discoverability cannot improve until defensible evidence and a separately authorised decision exist.'],
 recommendation:result.some(r=>r.disposition==='NOW_SAFE_FOR_HUMAN_REVIEW')?'READY FOR ANOTHER SMALL CONTROLLED BATCH':'INSUFFICIENT EVIDENCE — KEEP HUMAN REVIEW MANUAL'};
fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,candidates:undefined,groups:undefined},null,2));
