/** Read-only local report assembler. No database/client capability. */
import fs from 'node:fs';
const [reportPath,parityPath,previousPath,probeBaselinePath,manifestPath,outputPath]=process.argv.slice(2);
if(!outputPath)throw Error('Usage: report parity previousParity probeBaseline manifest output');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const report=read(reportPath),parity=read(parityPath),previous=read(previousPath),probeBaseline=read(probeBaselinePath),manifest=read(manifestPath);
const priorWrong=new Set(previous.results.flatMap(r=>r.differences.filter(d=>d.classification==='current_output_correct_shadow_wrong').map(d=>r.currentId+'|'+d.field)));
const addedWrong=parity.results.flatMap(r=>r.differences.filter(d=>d.classification==='current_output_correct_shadow_wrong'&&!priorWrong.has(r.currentId+'|'+d.field)).map(d=>({currentId:r.currentId,field:d.field,evidenceIds:d.evidenceIds})));
const reviewIds=[...new Set(report.candidates.flatMap(c=>c.groupIds))];
if(reviewIds.length!==52)throw Error('Expected 52 reviewed groups');
const reviews=reviewIds.map(id=>{
 const r=parity.results.find(r=>r.currentId===id);if(!r?.shadow.entityShape)throw Error('Missing entity-shape review '+id);
 const s=r.shadow.entityShape;
 return {currentId:id,shadowGroup:r.shadowGroup,entity_kind:s.entity_kind,person_anchor:s.person_anchor,company_anchor:s.company_anchor,associated_company_refs:s.associated_company_refs,classification_basis:s.classification_basis,ambiguity_reason:s.ambiguity_reason};
});
const shapes=parity.results.map(r=>r.shadow.entityShape);if(shapes.some(s=>!s))throw Error('Unclassified replay row');
const collapses=shapes.filter(s=>s.identity_equivalence_authorised!==false||s.entity_kind!=='ambiguous'&&s.person_source_refs.length&&s.company_source_refs.some(c=>!s.person_source_refs.some(p=>p.table===c.table&&p.id===c.id)));
if(collapses.length)throw Error('STOP: person/company identity collapse');
const terms=new Set(manifest.terms),probes=[];
for(const old of probeBaseline.results)for(const facet of ['name','company'])for(const q of old.shadow[facet+'Probes']){
 const query=q.trim().normalize('NFKC').toLowerCase();if(query.split(/\s+/).every(t=>terms.has(t)))continue;
 const row=parity.results.find(r=>r.currentId===old.currentId),d=row.differences.find(d=>d.field==='discoverability_'+facet);
 const found=side=>d?d[side].find(v=>v.query===query)?.found:row.checks.find(c=>c.field==='discoverability_'+facet)?.agreement===true;
 if(typeof found('current')!=='boolean'||typeof found('shadow')!=='boolean')throw Error('Unassessed probe');
 probes.push({currentId:old.currentId,facet,query,currentFound:found('current'),shadowFound:found('shadow')});
}
if(probes.length!==11)throw Error('Expected 11 probes');
const unresolved=reviews.filter(r=>r.entity_kind==='ambiguous').length;
const regression=parity.results.find(r=>r.currentId==='acquisition_0806a3b0-7dd1-4972-9ff9-4535d016cf2c');
const output={sourceHead:'f412a215d1a19d1ec8ea4b4efe3901cd0cadd951',mode:'shadow-only; no persisted decisions; hypothetical all-same is not a real identity verdict',historicalMembershipAt:report.captureAt,supplementalSearchObservedAt:'2026-10-16T15:01:13.338804Z',atomic:false,
 recommendation:unresolved||addedWrong.length?'NEEDS MORE IDENTITY POLICY WORK':'READY FOR PERSISTED RECONCILIATION',
 relationshipsEvaluated:parity.summary.relationshipsEvaluated,fieldComparisons:parity.summary.fieldComparisons,
 displayedNameRegressionDisappears:!regression.differences.some(d=>d.field==='displayed_name'),controlledCompanyOnlyCase:{kind:regression.shadow.entityShape.entity_kind,personAnchor:regression.shadow.entityShape.person_anchor,displayName:regression.shadow.name},
 newCurrentCorrectShadowWrongCases:addedWrong,unsupportedJoins:report.scenarios.reduce((n,s)=>n+s.unsupportedJoinCount,0),personCompanyCollapses:collapses.length,
 unresolvedReviewEntityShapeCases:unresolved,reviewGroupsEvaluated:reviews.length,unresolvedInventoryAnchorCases:shapes.filter(s=>s.entity_kind==='ambiguous').length,
 entityShapeCounts:Object.fromEntries(['person','company','person_with_company','ambiguous'].map(k=>[k,shapes.filter(s=>s.entity_kind===k).length])),
 scenarios:report.scenarios.map(s=>({choice:s.choice,summary:s.summary,unsupportedJoinCount:s.unsupportedJoinCount,separationViolations:s.separationViolations})),probes,reviews,
 limitations:['Historical source membership and later supplemental search observation are not an atomic live recapture.','No real group is reconciled or source type rewritten.','Existing evidence grouping containers remain unchanged; mixed entity sources do not acquire identity-equivalence authority.','Unresolved entity-shape counts concern the 52 review groups and 2411 evaluated inventory anchors, not unseen mailbox content.']};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({...output,scenarios:undefined,probes:undefined,reviews:undefined},null,2));
