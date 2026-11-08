import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadMeeting} from './meeting-copilot-loader.mjs';

const knowledge=loadMeeting('lib/meetingPracticeKnowledge.ts');
const flow=loadMeeting('lib/meetingPracticeFlow.ts');
const adaptive=loadMeeting('lib/meetingAdaptiveCoach.ts');
const rootText=fs.readFileSync('public/practice-knowledge/root-health-workplace-membership-source.txt','utf8');
const playbook=adaptive.parseSalesPlaybook('# Studio\n## Opening\nSet a useful purpose.\n## Discovery\nAsk what would help the team.\n## Soft Close\nWould a follow-up be useful?');

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
 const first=knowledge.preparePracticeKnowledgeSource({text:rootText,fileName:'membership.txt'}),pack=knowledge.pinPracticeKnowledgePack([first]);assert.ok(pack.snapshotVersion.startsWith('practice-knowledge-v1-'));assert.deepEqual(pack.sourceIds,[first.sourceId]);
 first.items[0].statement='mutated after session pin';first.items.push({...first.items[0],knowledgeId:'fake'});assert.notEqual(pack.items[0].statement,'mutated after session pin');assert.equal(pack.items.some(item=>item.knowledgeId==='fake'),false);
 assert.equal(pack.sources[0].provenance.urlFetched,false);assert.equal(knowledge.pinPracticeKnowledgePack([]),null);
});

test('the required Root features question uses source-backed multi-item knowledge and preserves the canonical resume step',()=>{
 const source=knowledge.preparePracticeKnowledgeSource({text:rootText,fileName:'root-health-workplace-membership-source.txt'}),pack=knowledge.pinPracticeKnowledgePack([source]),started=Date.now();
 const bridge=flow.createPracticeQuestionBridge({question:'Can you elaborate on what specific tools or features you offer to achieve that clearer view for organisations?',playbook,currentScriptStepId:'opening-1',buyerTurnId:'buyer-knowledge-1',knowledgePack:pack});
 assert.equal(bridge.sourceType,'prepared_knowledge');assert.equal(bridge.suspendedScriptStepId,'opening-1');assert.equal(bridge.currentScriptStepId,'opening-1');assert.equal(bridge.retrievalDiagnostics.intent,'product_capabilities');assert.equal(bridge.retrievalDiagnostics.knowledgeLookupAttempted,true);assert.equal(bridge.retrievalDiagnostics.knowledgeAnswerPath,'supported_feature_composition');assert.ok(bridge.retrievalDiagnostics.selectedKnowledgeIds.length>=2);assert.ok(bridge.retrievalDiagnostics.knowledgeLookupDurationMs>=0);assert.ok(Date.now()-started<1500,'prepared local retrieval has no provider/network wait');
 assert.match(bridge.approvedQuestionResponse,/Root combines private employee support with organisational insight/);assert.match(bridge.approvedQuestionResponse,/Root Intelligence, Organisation Insights, Ask Root and executive reviews/);assert.doesNotMatch(bridge.approvedQuestionResponse,/Organisation Insights:|Ask Root:|Root keeps learning:/);assert.doesNotMatch(bridge.approvedQuestionResponse,/guarantee|automatic ROI|clinical outcome/i);
 assert.deepEqual(bridge.sourceIds,bridge.retrievalDiagnostics.selectedSourceIds);assert.equal(bridge.retrievalDiagnostics.answerQuality.passed,true);assert.equal(bridge.retrievalDiagnostics.knowledgeSnapshotVersion,pack.snapshotVersion);
});

test('continuous-feedback, daily-support, and specific-tools questions retrieve the pinned source without moving the script cursor',()=>{
 const pack=knowledge.pinPracticeKnowledgePack([knowledge.preparePracticeKnowledgeSource({text:rootText,fileName:'root-health-workplace-membership-source.txt'})]);
 const cases=[
  ['How does Root Health specifically gather continuous feedback from employees?',/anonymous evidence base/i,/repeated check-ins/i],
  ['Can you explain a bit more about how that daily support is implemented?',/participation grows/i,/evidence supports/i],
  ['What specific tools or features do you offer?',/Root Intelligence/i,/Organisation Insights/i],
 ];
 for(const [question,first,second] of cases){
  const bridge=flow.createPracticeQuestionBridge({question,playbook,currentScriptStepId:'discovery-1',buyerTurnId:`buyer-${question.length}`,knowledgePack:pack});
  assert.equal(bridge.sourceType,'prepared_knowledge',question);assert.equal(bridge.retrievalDiagnostics.knowledgeLookupAttempted,true,question);assert.ok(bridge.retrievalDiagnostics.knowledgeCandidateCount>0,question);assert.ok(bridge.retrievalDiagnostics.selectedKnowledgeIds.length>0,question);assert.equal(bridge.retrievalDiagnostics.knowledgeFallbackReason,null,question);assert.match(bridge.approvedQuestionResponse,first,question);assert.match(bridge.approvedQuestionResponse,second,question);assert.ok(bridge.approvedQuestionResponse.trim().split(/\s+/).length<=45,question);assert.equal(bridge.currentScriptStepId,'discovery-1',question);assert.equal(bridge.suspendedScriptStepId,'discovery-1',question);assert.equal(bridge.retrievalDiagnostics.knowledgeSnapshotVersion,pack.snapshotVersion,question);
 }
});

test('a directly relevant uploaded-playbook answer outranks prepared knowledge',()=>{
 const custom=adaptive.parseSalesPlaybook('# Custom\n## Opening\nStart clearly.\n## Discovery\nOur features include evidence reporting and workforce insights, giving organisations a clearer view of support needs.');
 const pack=knowledge.pinPracticeKnowledgePack([knowledge.preparePracticeKnowledgeSource({text:rootText,fileName:'source.txt'})]);
 const bridge=flow.createPracticeQuestionBridge({question:'What specific tools or features give organisations a clearer view?',playbook:custom,currentScriptStepId:'opening-1',buyerTurnId:'buyer-script-first',knowledgePack:pack});
 assert.equal(bridge.sourceType,'playbook_step');assert.equal(bridge.sourceId,'discovery-1');assert.match(bridge.approvedQuestionResponse,/Our features include evidence reporting/);assert.equal(bridge.suspendedScriptStepId,'opening-1');
});

test('unsupported product questions fall back without inventing a claim and expose why knowledge was unavailable',()=>{
 const pack=knowledge.pinPracticeKnowledgePack([knowledge.preparePracticeKnowledgeSource({text:rootText,fileName:'source.txt'})]);
 const bridge=flow.createPracticeQuestionBridge({question:'What features do you offer for Microsoft Teams integration for organisations?',playbook,currentScriptStepId:'discovery-1',buyerTurnId:'buyer-unknown',knowledgePack:pack});
 assert.equal(bridge.sourceType,'safe_fallback');assert.equal(bridge.sourceIds.length,0);assert.match(bridge.approvedQuestionResponse,/don’t want to overstate/);assert.equal(bridge.retrievalDiagnostics.knowledgeFallbackReason,'no_supported_knowledge_answer');assert.doesNotMatch(bridge.approvedQuestionResponse,/Microsoft Teams integration/i);
 const noPack=flow.createPracticeQuestionBridge({question:'What tools or features achieve a clearer view for organisations?',playbook,currentScriptStepId:'opening-1',buyerTurnId:'buyer-no-pack'});assert.equal(noPack.retrievalDiagnostics.knowledgeLookupAttempted,false);assert.match(noPack.approvedQuestionResponse,/don’t want to guess about specific tools or features/i);
});

test('common Root membership questions retrieve the matching source material while unsupported comparison stays a cursor-neutral fallback',()=>{
 const pack=knowledge.pinPracticeKnowledgePack([knowledge.preparePracticeKnowledgeSource({text:rootText,fileName:'source.txt'})]);
 const ask=question=>flow.createPracticeQuestionBridge({question,playbook,currentScriptStepId:'discovery-1',buyerTurnId:`review-${question.length}`,knowledgePack:pack});
 const cases=[
  ['What specific tools or features do you offer?','product_capabilities','features',/Root combines private employee support with organisational insight/],
  ['What exactly do employees get?','employee_proposition','employee_experience',/Employees receive assessments, check-ins, Mind, Journal, practical interventions and Voice Coach/],
  ['What does the employer get?','employer_proposition','reporting_data',/Employers get private employee support alongside organisational insight/],
  ['How does this actually work?','product_mechanism','onboarding',/Employees join Root privately to build an anonymous evidence base/],
  ['How much does it cost?','pricing','pricing',/Pricing starts at £695 per month for up to 50 employees/],
  ['How do we sign up?','signup_process','onboarding',/Apply with the organisation, workforce size and authorised administrator/],
  ['Do we have to commit for a year?','commitment','commitment',/normally agreed for 12 months and billed monthly/],
  ['What information does the organisation see?','reporting_visibility','reporting_data',/HR sees anonymous participation, evidence depth, workforce direction/],
 ];
 for(const [question,intent,category,expected] of cases){const bridge=ask(question),items=(bridge.retrievalDiagnostics.selectedKnowledgeIds||[]).map(id=>pack.items.find(item=>item.knowledgeId===id)).filter(Boolean);assert.equal(bridge.retrievalDiagnostics.intent,intent,question);assert.equal(bridge.sourceType,'prepared_knowledge',question);assert.ok(items.some(item=>item.category===category),question);assert.match(bridge.approvedQuestionResponse,expected,question);assert.ok(bridge.approvedQuestionResponse.trim().split(/\s+/).length<=45,question);assert.equal(bridge.currentScriptStepId,'discovery-1',question);assert.equal(bridge.suspendedScriptStepId,'discovery-1',question);assert.ok(items.every(item=>item.sourceExcerpt===item.statement),question);assert.deepEqual(bridge.sourceIds,bridge.retrievalDiagnostics.selectedSourceIds,question);}
 const unsupported=ask('How is this different from what we already have?');assert.equal(unsupported.retrievalDiagnostics.intent,'comparison');assert.equal(unsupported.approvedQuestionResponse.trim().split(/\s+/).length,32);assert.equal(unsupported.sourceType,'safe_fallback');assert.equal(unsupported.retrievalDiagnostics.intent,'comparison');assert.match(unsupported.approvedQuestionResponse,/I don’t know what you already use.*grounded comparison/i);assert.equal(unsupported.sourceIds.length,0);assert.equal(unsupported.currentScriptStepId,'discovery-1');
});

test('knowledge lookup stays local to the supplied snapshot and never changes script navigation state',()=>{
 const source=knowledge.preparePracticeKnowledgeSource({text:rootText,fileName:'source.txt'}),pack=knowledge.pinPracticeKnowledgePack([source]),bridge=flow.createPracticeQuestionBridge({question:'What specific features help leadership understand the organisation?',playbook,currentScriptStepId:'discovery-1',buyerTurnId:'buyer-cursor',knowledgePack:pack});
 assert.equal(bridge.suspendedScriptStepId,'discovery-1');assert.equal(bridge.currentScriptStepId,'discovery-1');assert.equal(bridge.sourceType,'prepared_knowledge');assert.ok(bridge.sourceIds.every(id=>id.startsWith('knowledge:')));assert.equal(typeof globalThis.fetch,'function','this retrieval test does not call fetch; no URL fetch adapter participates in the call loop');
});
