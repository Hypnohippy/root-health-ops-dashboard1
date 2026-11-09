import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadMeeting} from './meeting-copilot-loader.mjs';

const knowledge=loadMeeting('lib/meetingPracticeKnowledge.ts');
const flow=loadMeeting('lib/meetingPracticeFlow.ts');
const adaptive=loadMeeting('lib/meetingAdaptiveCoach.ts');
const rootText=fs.readFileSync('public/practice-knowledge/root-health-workplace-membership-source.txt','utf8');
const playbook=adaptive.parseSalesPlaybook('# Studio\n## Opening\nSet a useful purpose.\n## Discovery\nAsk what would help the team.\n## Soft Close\nWould a follow-up be useful?');
const rootPack=knowledge.pinPracticeKnowledgePack([knowledge.preparePracticeKnowledgeSource({text:rootText,fileName:'root-health-workplace-membership-source.txt',preparedAt:'2026-11-08T10:00:00.000Z'})]);
function assertJsonEqual(actual,expected,message){assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);}
function commercialValue(question,{ids=[],answer='',control='',mode='canonical_prompt',stepId='discovery-1',buyerTurnId='buyer-1',coveredSteps=[stepId],action='stay',target=null,answersBuyerQuestion=false,supportedBySelectedFacts=false,risk='none',detour='none',detourTarget=null}={}){return {buyerIntent:flow.classifyPracticeQuestionIntent(question),buyerQuestionSummary:question,answerMode:mode,groundedKnowledgeIds:ids,sellerAnswer:answer,sellerControlMove:control,currentObjective:{stepId,assessment:coveredSteps.includes(stepId)?'covered':'not_covered'},coveredObjectives:coveredSteps.map(id=>({stepId:id,evidenceTurnIds:[buyerTurnId]})),canonicalAction:action,canonicalTargetStepId:target,detourAction:detour,detourTargetId:detourTarget,answersBuyerQuestion,supportedBySelectedFacts,irrelevantFactIds:[],unsupportedClaimRisk:risk,confidence:0.91};}
function validateTurn(question,value,{stepId='discovery-1',turnId='buyer-1',turnText=question,turns}={}){return flow.validatePracticeCommercialTurnDecision({value,playbook,currentStepId:stepId,buyerText:question,turns:turns||[{id:turnId,role:'buyer',text:turnText,finalized:true,integrity:'complete'}],items:rootPack.items,snapshotVersion:rootPack.snapshotVersion});}

test('local source preparation normalizes visible text, preserves section and price provenance, and leaves unknowns unknown',()=>{
 const source=knowledge.preparePracticeKnowledgeSource({text:rootText,fileName:'root-health-workplace-membership-source.txt',title:'Root Health Workplace Membership',preparedAt:'2026-11-08T10:00:00.000Z'});
 assert.equal(source.sourceType,'user_provided_local_file');assert.equal(source.url,'https://www.roothealth.app/organisations/membership');assert.equal(source.fetchedAt,null);assert.equal(source.provenance.adapter,'user_provided_local_file');assert.equal(source.provenance.urlFetched,false);assert.equal(source.approvalStatus,'practice_source_material');assert.equal(source.extractionStatus,'prepared');
 assert.ok(source.sections.includes('Root Intelligence'));assert.ok(source.sections.includes('MEMBERSHIP PRICING'));
 assert.ok(source.sections.includes('Leadership Programmes'));assert.ok(source.sections.includes('Research and Evaluation'));assert.doesNotMatch(source.items.map(item=>item.statement).join(' '),/Membership How it starts Founder's note|Pricing principle Scale, not features|Complete Root Workplace membership Growing organisations|Evidence-led organisational wellbeing Organisations/i,'navigation labels and presentation headings are not promoted as knowledge facts');
 const optionalSupport=source.items.find(item=>item.sourceExcerpt.includes('Human-delivered support remains optional'));assert.equal(optionalSupport.category,'limitations');assert.equal(optionalSupport.sourceSection,'EXTEND YOUR IMPACT');
 const root=source.items.find(item=>item.sourceSection==='Root Intelligence');assert.match(root.statement,/anonymous wellbeing evidence, business measures, organisational events and repeated reviews/i);assert.equal(root.sourceExcerpt,root.statement);assert.equal(root.approvalStatus,'practice_source_material');
 const pricing=source.items.find(item=>item.sourceSection==='Up to 50 employees');assert.match(pricing.statement,/£695 per month/);assert.match(pricing.statement,/complete Root Workplace platform/);
 const unknown=knowledge.preparePracticeKnowledgeSource({text:'# Unsupported\nThe brochure has a blue cover and promises guaranteed outcomes.',fileName:'unknown.md'});assert.equal(unknown.items.length,0,'unsupported claims are not promoted into prepared facts');assert.equal(unknown.extractionStatus,'empty');
});

test('source version hash is deterministic and changes when normalized source content changes',()=>{
 assert.equal(knowledge.hashPracticeKnowledgeText('Root\r\nHealth'),knowledge.hashPracticeKnowledgeText('Root\nHealth'));
 assert.notEqual(knowledge.hashPracticeKnowledgeText('Root Health'),knowledge.hashPracticeKnowledgeText('Root Health changed'));
});

test('future webpage URL contract rejects unsafe schemes and private/local destinations, including redirects',()=>{
 assert.equal(knowledge.validatePracticeWebpageUrl('https://www.roothealth.app/organisations/membership').ok,true);
 for(const url of ['file:///etc/passwd','javascript:alert(1)','http://localhost/admin','http://127.0.0.1/','http://10.2.3.4/','http://192.168.1.2/','http://169.254.169.254/latest/meta-data/','http://[::1]/'])assert.equal(knowledge.validatePracticeWebpageUrl(url).ok,false,url);
 assert.equal(knowledge.validatePracticeWebpageRedirect('http://192.168.0.10/private',0).reason,'unsafe_redirect:private_or_local_host');
 assert.equal(knowledge.validatePracticeWebpageRedirect('https://example.com/',3).reason,'too_many_redirects');
 assert.equal(knowledge.validatePracticeKnowledgePayloadSize(knowledge.MAX_PRACTICE_KNOWLEDGE_SOURCE_BYTES).ok,true);assert.equal(knowledge.validatePracticeKnowledgePayloadSize(knowledge.MAX_PRACTICE_KNOWLEDGE_SOURCE_BYTES+1).ok,false);
});

test('browser-local persistence rebuilds the pack from source text and rejects a tampered prepared record',()=>{
 const values=new Map(),storage={setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)||null,removeItem:key=>values.delete(key)},source=knowledge.preparePracticeKnowledgeSource({text:rootText,fileName:'source.txt'});
 knowledge.savePracticeKnowledgeSource(storage,'org-1',source);const loaded=knowledge.loadPracticeKnowledgeSource(storage,'org-1');assert.equal(loaded.contentHash,source.contentHash);assert.equal(loaded.items.length,source.items.length);
 const record=JSON.parse(values.get('root.practice.knowledge.v1:org-1'));record.items[0].statement='fabricated';values.set('root.practice.knowledge.v1:org-1',JSON.stringify(record));assert.equal(knowledge.loadPracticeKnowledgeSource(storage,'org-1').items[0].statement,source.items[0].statement,'stored extraction is rebuilt from the saved original local text');
 knowledge.removePracticeKnowledgeSource(storage,'org-1');assert.equal(knowledge.loadPracticeKnowledgeSource(storage,'org-1'),null);
});

test('a pinned Practice snapshot is isolated from subsequent refresh and retains source provenance',()=>{
 const first=knowledge.preparePracticeKnowledgeSource({text:rootText,fileName:'membership.txt'}),pack=knowledge.pinPracticeKnowledgePack([first]);assert.ok(pack.snapshotVersion.startsWith('practice-knowledge-v1-'));assertJsonEqual(pack.sourceIds,[first.sourceId]);
 first.items[0].statement='mutated after session pin';first.items.push({...first.items[0],knowledgeId:'fake'});assert.notEqual(pack.items[0].statement,'mutated after session pin');assert.equal(pack.items.some(item=>item.knowledgeId==='fake'),false);
 assert.equal(pack.sources[0].provenance.urlFetched,false);assert.equal(knowledge.pinPracticeKnowledgePack([]),null);
});

test('one grounded commercial decision answers a tools question and leaves canonical navigation on the same objective',()=>{
 const question='Can you elaborate on what specific tools or features you offer to achieve that clearer view for organisations?',buyerTurnId='buyer-knowledge-1',ids=flow.rankPracticeKnowledgeFacts(question,rootPack.items).candidates.slice(0,3).map(candidate=>candidate.item.knowledgeId),value=commercialValue(question,{ids,answer:'Root combines private employee support with organisational insight; its features include Organisation Insights, Ask Root and executive reporting.',control:'Would that combination of employee support and organisational visibility be useful in your organisation?',mode:'grounded_answer',stepId:'discovery-1',buyerTurnId,answersBuyerQuestion:true,supportedBySelectedFacts:true});
 const started=Date.now(),result=validateTurn(question,value,{stepId:'discovery-1',turnId:buyerTurnId,turns:[{id:buyerTurnId,role:'buyer',text:question,finalized:true,integrity:'complete'}]});
 assert.ok(result.decision,result.reason);assert.ok(Date.now()-started<1500,'ranking against the pinned local snapshot adds no URL/network wait');assert.equal(result.decision.buyerIntent,'product_capabilities');assertJsonEqual(result.decision.groundedKnowledgeIds,ids);assert.equal(result.decision.provenance.snapshotVersion,rootPack.snapshotVersion);assert.equal(result.decision.provenance.urlFetched,false);assert.equal(result.decision.canonicalAction,'stay');
 const applied=flow.applyPracticeCommercialTurnDecision({navigation:{scriptStepId:'discovery-1',currentScriptStepId:'discovery-1',currentScriptSection:'discovery',activeAdaptiveRoute:false,resumeScriptStepId:null},playbook,decision:result.decision,sequence:2});assert.equal(applied.navigation.scriptStepId,'discovery-1');
 assert.match(result.decision.sellerAnswer,/Root combines private employee support with organisational insight/);assert.doesNotMatch(result.decision.sellerAnswer,/no Bronze, Silver or Gold|Everything included|Organisation Insights:/i);
});

test('supported buyer questions use one validated turn decision and no second answer object',()=>{
 const question='How do you gather continuous data and what tools do you use?',ids=['Root Intelligence','Evidence develops'].map(section=>rootPack.items.find(item=>item.sourceSection===section)?.knowledgeId).filter(Boolean),buyerTurnId='buyer-data',value=commercialValue(question,{ids,answer:'Employees join privately; repeated check-ins and participation build a baseline and anonymous evidence over time.',control:'Would that evidence help answer the questions you need to resolve?',mode:'grounded_answer',stepId:'discovery-1',buyerTurnId,answersBuyerQuestion:true,supportedBySelectedFacts:true});
 const checked=validateTurn(question,value,{stepId:'discovery-1',turnId:buyerTurnId,turns:[{id:buyerTurnId,role:'buyer',text:question,finalized:true,integrity:'complete'}]});assert.ok(checked.decision,checked.reason);assert.equal(checked.decision.buyerIntent,'data_collection');assert.match(checked.decision.sellerAnswer,/repeated check-ins and participation build a baseline/i);assert.equal(checked.decision.canonicalAction,'stay');
 const unavailable=validateTurn(question,undefined,{stepId:'discovery-1',turnId:'buyer-no-decision'});assert.equal(unavailable.decision,null,'a missing complete decision renders no Knowledge answer or second bridge state');
});

test('unsupported product and comparison questions produce only non-claiming, citation-free grounded reframes',()=>{
 const question='What features do you offer for Microsoft Teams integration for organisations?';assert.ok(flow.rankPracticeKnowledgeFacts(question,rootPack.items).candidates.every(candidate=>rootPack.items.some(item=>item.knowledgeId===candidate.item.knowledgeId)),'retrieval can only return IDs from the pinned pack');
 const answer='I cannot confirm a Teams integration from the prepared material, but we can identify what your team needs to connect.';
 const value=commercialValue(question,{answer,control:'Which connection would matter most for your team?',mode:'grounded_reframe',stepId:'discovery-1',buyerTurnId:'buyer-unknown',answersBuyerQuestion:true,supportedBySelectedFacts:false});
 const result=validateTurn(question,value,{stepId:'discovery-1',turnId:'buyer-unknown',turns:[{id:'buyer-unknown',role:'buyer',text:question,finalized:true,integrity:'complete'}]});assert.ok(result.decision,result.reason);assert.equal(result.decision.provenance.sourceType,'safe_fallback');assert.equal(result.decision.groundedKnowledgeIds.length,0);assert.doesNotMatch(result.decision.sellerAnswer,/we support Microsoft Teams/i);
 const comparison='How is this different from what we already have?',fallback=commercialValue(comparison,{answer:'I do not know what you already use, so I cannot make a grounded comparison. We can compare it with the needs you have described.',control:'Which current gap would matter most in that comparison?',mode:'grounded_reframe',stepId:'discovery-1',buyerTurnId:'buyer-comparison',answersBuyerQuestion:true,supportedBySelectedFacts:false}),checked=validateTurn(comparison,fallback,{stepId:'discovery-1',turnId:'buyer-comparison',turns:[{id:'buyer-comparison',role:'buyer',text:comparison,finalized:true,integrity:'complete'}]});assert.ok(checked.decision,checked.reason);assert.equal(checked.decision.buyerIntent,'comparison');assertJsonEqual(checked.decision.groundedKnowledgeIds,[]);
});

test('retrieval is pinned to the supplied local snapshot and does not fetch the reference URL',()=>{
 const question='What specific features help leadership understand the organisation?',before=Date.now(),ranked=flow.rankPracticeKnowledgeFacts(question,rootPack.items);
 assert.ok(ranked.candidates.length>0);assert.ok(Date.now()-before<1500);assert.ok(rootPack.snapshotVersion.startsWith('practice-knowledge-v1-'));assert.equal(rootPack.sources[0].provenance.urlFetched,false);assert.equal(typeof globalThis.fetch,'function','the fixture has fetch available; the synchronous ranking path uses only the pinned pack');
});
test('semantic ranking selects privacy, data collection, action and organisation learning evidence ahead of packaging',()=>{
 const ranked=q=>flow.rankPracticeKnowledgeFacts(q,rootPack.items).candidates;
 const privacy=ranked('How do you balance individual privacy with organisational transparency?'),action=ranked('How do continuous insights lead to specific actions?'),collection=ranked('How do you gather continuous data and what tools do you use?'),adaptation=ranked('How do you keep insights relevant for different organisational needs?');
 assert.ok(privacy.slice(0,3).some(row=>row.item.sourceSection==='Organisation Insights'||row.item.sourceSection==='HOW MEMBERSHIP STARTS'),'privacy results include anonymous visibility and the organisation/employee privacy split');
 assert.equal(privacy.slice(0,5).some(row=>row.item.sourceSection==='EVERYTHING INCLUDED'||row.item.category==='pricing'),false,'privacy retrieval excludes membership packaging and pricing');
 assert.equal(action[0].item.sourceSection,'Evidence-Led Recommendations');assert.ok(action.slice(0,3).some(row=>row.item.sourceSection==='Outcome Measurement'));assert.equal(action.slice(0,4).some(row=>row.item.sourceSection==='EVERYTHING INCLUDED'),false,'action retrieval excludes packaging language');
 assert.ok(collection.slice(0,5).some(row=>['HOW MEMBERSHIP STARTS','Root Intelligence','Evidence develops','PARTICIPATION MATTERS'].includes(row.item.sourceSection)),'collection retrieval uses data and participation facts');
 assert.ok(adaptation.slice(0,3).some(row=>row.item.sourceSection==='Root keeps learning'||row.item.sourceSection==='Organisation Insights'),'adaptation retrieval uses organisational evidence and learning');
});

test('the turn-level commercial decision composes multiple grounded facts and rejects irrelevant source-backed copy',()=>{
 const question='How do you balance individual privacy with organisational transparency?',privacyIds=['HOW MEMBERSHIP STARTS','Organisation Insights'].map(section=>rootPack.items.find(item=>item.sourceSection===section)?.knowledgeId).filter(Boolean),answer='Employees join privately and build an anonymous evidence base; HR sees workforce-level insight rather than individual employee data.',control='Would that balance between employee privacy and organisational insight fit what you need?';
 assert.equal(privacyIds.length,2);
 const unrelated=validateTurn(question,commercialValue(question,{ids:[rootPack.items.find(item=>item.sourceSection==='EVERYTHING INCLUDED').knowledgeId],answer:'Root does not hide its intelligence behind packages. There is no Bronze, Silver or Gold version of Root.',control:'Would that package structure help?',mode:'grounded_answer',answersBuyerQuestion:true,supportedBySelectedFacts:true}));
 assert.equal(unrelated.decision,null,'model answer flags cannot make irrelevant selected source material acceptable');
 const accepted=validateTurn(question,commercialValue(question,{ids:privacyIds,answer,control,mode:'grounded_answer',answersBuyerQuestion:true,supportedBySelectedFacts:true}));
 assert.ok(accepted.decision);assert.equal(accepted.decision.buyerIntent,'privacy_transparency');assertJsonEqual(accepted.decision.provenance.knowledgeIds,privacyIds);assert.equal(accepted.decision.provenance.urlFetched,false);assert.equal(accepted.decision.canonicalAction,'stay');assert.notEqual(answer,rootPack.items.find(item=>item.knowledgeId===privacyIds[0]).statement,'the seller wording is composed rather than copied from one canned item');
});

test('commercial decisions support question-specific composition, reject unsupported proof and avoid volunteered weakness',()=>{
 const cases=[
  ['How do continuous insights lead to specific actions?',['Evidence-Led Recommendations','Outcome Measurement'],'Evidence-led recommendations reflect the strongest current workforce evidence, and measurement compares what happened before and after interventions.','Would that evidence-led action help with the issue you described?'],
  ['How do you gather continuous data and what tools do you use?',['Root Intelligence','Evidence develops'],'Employees join Root privately; repeated check-ins and participation build a baseline and anonymous evidence over time.','Would that evidence help answer the questions you need to resolve?'],
  ['How do you keep insights relevant for different organisational needs?',['Root keeps learning','Organisation Insights'],'Root keeps learning as participation and business evidence develop, so insight reflects each organisation’s context.','Would that way of adapting to your organisation’s context be relevant?'],
 ];
 for(const [question,sections,answer,control] of cases){const ids=sections.map(section=>rootPack.items.find(item=>item.sourceSection===section)?.knowledgeId).filter(Boolean),result=validateTurn(question,commercialValue(question,{ids,answer,control,mode:'grounded_answer',answersBuyerQuestion:true,supportedBySelectedFacts:true}));assert.ok(result.decision,`${question}: ${result.reason}`);assertJsonEqual(result.decision.provenance.knowledgeIds,ids);assert.equal(result.decision.provenance.sourceSections.length,2);assert.doesNotMatch(result.decision.sellerAnswer,/case studies|lack of history|platform age|no proof/i);}
 const proofQuestion='Do you have case studies showing reduced absence?',reframe='The prepared material does not include a case study proving reduced absence; I can explain the outcome measures it describes.',reframeControl='Which outcomes would be most useful for you to measure?';const unsupported=validateTurn(proofQuestion,commercialValue(proofQuestion,{answer:reframe,control:reframeControl,mode:'grounded_reframe',answersBuyerQuestion:true,supportedBySelectedFacts:false}));assert.ok(unsupported.decision);assert.equal(unsupported.decision.provenance.sourceType,'safe_fallback');assert.equal(unsupported.decision.groundedKnowledgeIds.length,0);assert.doesNotMatch(unsupported.decision.sellerAnswer,/case studies prove|we have case studies/i);
 const fabricated=validateTurn(cases[0][0],commercialValue(cases[0][0],{ids:['root-local-fake:item-001-fake'],answer:'Our case studies prove 40% lower absence and guaranteed return on investment.',control:'Would that result interest you?',mode:'grounded_answer',answersBuyerQuestion:true,supportedBySelectedFacts:true}));assert.equal(fabricated.decision,null,'unsupported outcomes and unknown source IDs fail closed');
});

test('the app rejects provider claims of relevance without supplied approved facts',()=>{
 const question='How is this different from what we already have?',value=commercialValue(question,{ids:[],answer:'Root is proven to outperform your current provider and reduce absence by 40%.',control:'Would you like to see the results?',mode:'grounded_reframe',answersBuyerQuestion:true,supportedBySelectedFacts:false,risk:'high'});
 assert.equal(validateTurn(question,value).decision,null);assert.equal(typeof flow.createPracticeQuestionBridge,'undefined','the obsolete resettable bridge state machine is removed');
});
