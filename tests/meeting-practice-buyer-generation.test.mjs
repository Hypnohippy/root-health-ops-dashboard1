import assert from 'node:assert/strict';
import test from 'node:test';
import {loadMeeting} from './meeting-copilot-loader.mjs';

const {generatePracticeBuyerResponse,PracticeBuyerGenerationFailure}=loadMeeting('lib/meetingPracticeBuyerGeneration.ts');
const {assessPracticeBuyerOutput}=loadMeeting('lib/meetingPracticeFlow.ts');
const response=(content,usage=7)=>({choices:[{message:{content}}],usage:{total_tokens:usage}});
const assessment=text=>assessPracticeBuyerOutput(text);
const generate=(text,{sellerTurnId='seller-test',usage=7,validate=assessment}={})=>generatePracticeBuyerResponse({sellerTurnId,request:async()=>response(JSON.stringify({text}),usage),assessBuyerText:validate});

test('first provider response succeeds without scheduling a retry',async()=>{
 let calls=0;
 const result=await generatePracticeBuyerResponse({sellerTurnId:'seller-1',request:async()=>{calls++;return response(JSON.stringify({text:'We currently rely on an annual survey.'}));},assessBuyerText:assessment,now:(()=>{let time=100;return()=>time+=12;})()});
 assert.equal(calls,1);assert.equal(result.text,'We currently rely on an annual survey.');assert.equal(result.usageTokens,7);assert.equal(result.diagnostic.attempts[0].failureClass,null);assert.equal(result.diagnostic.attempts[0].wordCount,7);assert.equal(result.diagnostic.attempts[0].outputShapeValid,true);assert.equal(result.diagnostic.navigationCommitted,false);
});

test('18-word ordinary response is accepted',async()=>{
 const text='We currently use annual surveys, and managers check in with people when concerns come up across the team.';
 const result=await generate(text);assert.equal(result.text,text);assert.equal(result.diagnostic.attempts[0].wordCount,18);assert.equal(result.diagnostic.attempts[0].qualityNotes.length,0);
});

test('31-word otherwise useful response is accepted with a soft target note',async()=>{
 const text='We currently use annual surveys, but the results arrive only a few times each year and managers hear about concerns later, after teams have already been under pressure for some time.';
 const result=await generate(text);assert.equal(result.text,text);assert.equal(result.diagnostic.attempts[0].wordCount,31);assert.equal(result.diagnostic.attempts[0].qualityNotes.join(','),'word_count_outside_target');assert.equal(result.diagnostic.attempts[0].failureClass,null);
});

test('two sentences and one relevant question are accepted',async()=>{
 const text='We use an annual survey, but it can miss changes between check-ins. How would you show those changes without identifying individuals?';
 const result=await generate(text);assert.equal(result.text,text);assert.equal(result.diagnostic.attempts[0].sentenceCount,2);assert.equal(result.diagnostic.attempts[0].hadQuestion,true);assert.equal(result.diagnostic.attempts[0].failureClass,null);
});

test('imperfect wording that answers the seller control question is accepted',async()=>{
 const text='Yes, I think seeing changes between surveys would help us notice issues sooner.';
 const result=await generate(text);assert.equal(result.text,text);assert.equal(result.diagnostic.attempts[0].hadBuyerResponse,true);assert.equal(result.diagnostic.attempts[0].failureClass,null);
});

test('mild repeated phrasing is not a hard rejection',async()=>{
 const text='That would help. I think that would help us spot changes sooner.';
 const result=await generate(text);assert.equal(result.text,text);assert.equal(result.diagnostic.attempts[0].failureClass,null);
});

test('empty buyer text is a hard, safely diagnosed and retry-eligible rejection',async()=>{
 const result=await assessPracticeBuyerOutput('');assert.equal(result.accepted,false);assert.equal(result.rejectionReason,'empty_output');assert.equal(result.hardBoundary,'empty_output');assert.equal(result.retryEligible,true);
 let calls=0,failure;try{await generatePracticeBuyerResponse({sellerTurnId:'seller-empty',request:async()=>{calls++;return response(JSON.stringify({text:''}));},assessBuyerText:assessment});}catch(error){failure=error;}
 assert.ok(failure instanceof PracticeBuyerGenerationFailure);assert.equal(calls,2);assert.equal(failure.diagnostics.attempts[0].validatorId,'practice_buyer_hard_contract');assert.equal(failure.diagnostics.attempts[0].rejectionReason,'empty_output');assert.equal(failure.diagnostics.attempts[0].hadBuyerResponse,false);assert.equal(failure.diagnostics.attempts[0].hardBoundary,'empty_output');assert.equal(failure.diagnostics.attempts[0].retryEligible,true);
});

test('malformed provider structure is a hard rejection with shape diagnostics',async()=>{
 let calls=0,failure;try{await generatePracticeBuyerResponse({sellerTurnId:'seller-shape',request:async()=>{calls++;return response(JSON.stringify({text:'A usable response.',unexpected:'extra'}));},assessBuyerText:assessment});}catch(error){failure=error;}
 assert.ok(failure instanceof PracticeBuyerGenerationFailure);assert.equal(calls,2);assert.equal(failure.diagnostics.attempts[0].failureClass,'unexpected_response_shape');assert.equal(failure.diagnostics.attempts[0].hardBoundary,'malformed_structure');assert.equal(failure.diagnostics.attempts[0].outputShapeValid,false);
});

test('malformed JSON is a hard rejection and is retried only once',async()=>{
 let calls=0,failure;try{await generatePracticeBuyerResponse({sellerTurnId:'seller-json',request:async()=>{calls++;return response('{not-json');},assessBuyerText:assessment});}catch(error){failure=error;}
 assert.ok(failure instanceof PracticeBuyerGenerationFailure);assert.equal(calls,2);assert.equal(failure.diagnostics.attempts[0].failureClass,'malformed_output');assert.equal(failure.diagnostics.attempts[0].rejectionReason,'malformed_json');assert.equal(failure.diagnostics.attempts[0].outputShapeValid,false);
});

test('wrong-role seller-prefixed output is rejected without logging provider text',async()=>{
 const result=assessPracticeBuyerOutput('Seller: I would recommend signing up today.');assert.equal(result.accepted,false);assert.equal(result.rejectionReason,'role_mismatch');assert.equal(result.hadBuyerResponse,false);
 let failure;try{await generate('Seller: I would recommend signing up today.',{sellerTurnId:'seller-role'});}catch(error){failure=error;}
 assert.ok(failure instanceof PracticeBuyerGenerationFailure);assert.equal(failure.diagnostics.attempts[0].rejectionReason,'role_mismatch');assert.doesNotMatch(JSON.stringify(failure.diagnostics),/recommend signing up/i);assert.doesNotMatch(failure.message,/recommend signing up/i);
});

test('first hard failure then retry success produces one final buyer result',async()=>{
 let calls=0;const result=await generatePracticeBuyerResponse({sellerTurnId:'seller-retry-success',request:async()=>{calls++;return calls===1?response(JSON.stringify({text:'Seller: I would recommend that.'}),3):response(JSON.stringify({text:'That sounds useful to explore.'}),5);},assessBuyerText:assessment});
 assert.equal(calls,2);assert.equal(result.text,'That sounds useful to explore.');assert.equal(result.diagnostic.attempts.length,2);assert.equal(result.diagnostic.attempts[0].rejectionReason,'role_mismatch');assert.equal(result.diagnostic.attempts[0].retryResult,'succeeded');assert.equal(result.diagnostic.attempts[1].failureClass,null);assert.equal(result.diagnostic.navigationCommitted,false);
});

test('two hard failures end in the existing recoverable failure state with no navigation',async()=>{
 let calls=0,failure;try{await generatePracticeBuyerResponse({sellerTurnId:'seller-two-hard',request:async()=>{calls++;return response(JSON.stringify({text:'Assistant: Let us proceed to a contract.'}));},assessBuyerText:assessment});}catch(error){failure=error;}
 assert.ok(failure instanceof PracticeBuyerGenerationFailure);assert.equal(calls,2);assert.equal(failure.diagnostics.attempts.length,2);assert.ok(failure.diagnostics.attempts.every(attempt=>attempt.failureClass==='validation_rejection'&&attempt.retryEligible));assert.equal(failure.diagnostics.attempts[0].retryResult,'failed');assert.equal(failure.diagnostics.navigationCommitted,false);
});

test('transient provider failures remain bounded to one retry and redact private details',async()=>{
 for(const [status,name,expected] of [[408,'APIError','provider_timeout'],[429,'RateLimitError','provider_rate_limited'],[503,'InternalServerError','provider_unavailable']]){let calls=0,failure;try{await generatePracticeBuyerResponse({sellerTurnId:'seller-transient',request:async()=>{calls++;const error=Error('private transient details');error.status=status;error.name=name;throw error;},assessBuyerText:assessment});}catch(error){failure=error;}assert.ok(failure instanceof PracticeBuyerGenerationFailure);assert.equal(calls,2);assert.equal(failure.diagnostics.attempts[0].failureClass,expected);assert.equal(failure.diagnostics.attempts[0].retryScheduled,true);assert.equal(failure.diagnostics.attempts[0].retryResult,'failed');assert.equal(failure.diagnostics.attempts[1].retryScheduled,false);assert.doesNotMatch(failure.message,/private transient details/);}
});
