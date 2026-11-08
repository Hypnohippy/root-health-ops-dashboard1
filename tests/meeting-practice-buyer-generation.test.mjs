import assert from 'node:assert/strict';
import test from 'node:test';
import {loadMeeting} from './meeting-copilot-loader.mjs';

const {generatePracticeBuyerResponse,PracticeBuyerGenerationFailure}=loadMeeting('lib/meetingPracticeBuyerGeneration.ts');
const response=(content,usage=7)=>({choices:[{message:{content}}],usage:{total_tokens:usage}});

test('first provider response succeeds without scheduling a retry',async()=>{
 let calls=0;
 const result=await generatePracticeBuyerResponse({sellerTurnId:'seller-1',request:async()=>{calls++;return response(JSON.stringify({text:'We currently rely on an annual survey.'}));},isValidBuyerText:text=>text.length>0,now:(()=>{let time=100;return()=>time+=12;})()});
 assert.equal(calls,1);assert.equal(result.text,'We currently rely on an annual survey.');assert.equal(result.usageTokens,7);assert.equal(JSON.stringify(result.diagnostic.attempts.map(attempt=>({attempt:attempt.attempt,failureClass:attempt.failureClass,recoverable:attempt.recoverable,retryScheduled:attempt.retryScheduled,retryResult:attempt.retryResult,navigationCommitted:attempt.navigationCommitted}))),JSON.stringify([{attempt:1,failureClass:null,recoverable:false,retryScheduled:false,retryResult:'not_scheduled',navigationCommitted:false}]));
});

test('recoverable empty first output retries once with the same pinned request and validates one buyer result',async()=>{
 let calls=0;const pinnedRequest={sessionId:'session-1',playbookRevision:'pinned'};
 const result=await generatePracticeBuyerResponse({sellerTurnId:'seller-2',request:async()=>{calls++;assert.equal(pinnedRequest.sessionId,'session-1');assert.equal(pinnedRequest.playbookRevision,'pinned');return calls===1?response('   ',3):response(JSON.stringify({text:'That would be useful to understand.'}),5);},isValidBuyerText:text=>text.length>0,now:(()=>{let time=200;return()=>time+=25;})()});
 assert.equal(calls,2);assert.equal(result.text,'That would be useful to understand.');assert.equal(result.usageTokens,8);assert.equal(result.diagnostic.navigationCommitted,false);assert.equal(JSON.stringify(result.diagnostic.attempts.map(attempt=>({attempt:attempt.attempt,failureClass:attempt.failureClass,recoverable:attempt.recoverable,retryScheduled:attempt.retryScheduled,retryResult:attempt.retryResult,sellerTurnId:attempt.sellerTurnId,navigationCommitted:attempt.navigationCommitted}))),JSON.stringify([{attempt:1,failureClass:'empty_output',recoverable:true,retryScheduled:true,retryResult:'succeeded',sellerTurnId:'seller-2',navigationCommitted:false},{attempt:2,failureClass:null,recoverable:false,retryScheduled:false,retryResult:'not_applicable',sellerTurnId:'seller-2',navigationCommitted:false}]));
});

test('second recoverable failure stops after two attempts and carries safe diagnostics only',async()=>{
 let calls=0;let failure;
 try{await generatePracticeBuyerResponse({sellerTurnId:'seller-3',request:async()=>{calls++;return response('{not-json',4);},isValidBuyerText:()=>true});}catch(error){failure=error;}
 assert.ok(failure instanceof PracticeBuyerGenerationFailure);assert.equal(calls,2);assert.equal(failure.usageTokens,8);assert.equal(failure.diagnostics.attempts.length,2);assert.equal(failure.diagnostics.attempts[0].retryResult,'failed');assert.equal(failure.diagnostics.attempts[0].failureClass,'malformed_output');assert.equal(failure.diagnostics.attempts[1].failureClass,'malformed_output');assert.equal(failure.diagnostics.navigationCommitted,false);assert.doesNotMatch(failure.message,/not-json|provider|prompt|secret/i);assert.doesNotMatch(JSON.stringify(failure.diagnostics),/not-json|prompt|secret/i);
});

test('unrecoverable provider rejection is not retried and provider message is never exposed',async()=>{
 let calls=0;let failure;
 try{await generatePracticeBuyerResponse({sellerTurnId:'seller-4',request:async()=>{calls++;const error=Error('private provider detail');error.status=401;throw error;},isValidBuyerText:()=>true});}catch(error){failure=error;}
 assert.ok(failure instanceof PracticeBuyerGenerationFailure);assert.equal(calls,1);assert.equal(failure.diagnostics.attempts[0].failureClass,'provider_rejected_request');assert.equal(failure.diagnostics.attempts[0].recoverable,false);assert.equal(failure.diagnostics.attempts[0].retryScheduled,false);assert.doesNotMatch(failure.message,/private provider detail/);
});

test('timeout, rate limit, and transient provider outage are classified as recoverable and bounded to one retry',async()=>{
 for(const [status,name,expected] of [[408,'APIError','provider_timeout'],[429,'RateLimitError','provider_rate_limited'],[503,'InternalServerError','provider_unavailable']]){let calls=0,failure;try{await generatePracticeBuyerResponse({sellerTurnId:'seller-transient',request:async()=>{calls++;const error=Error('private transient details');error.status=status;error.name=name;throw error;},isValidBuyerText:()=>true});}catch(error){failure=error;}assert.ok(failure instanceof PracticeBuyerGenerationFailure);assert.equal(calls,2);assert.equal(failure.diagnostics.attempts[0].failureClass,expected);assert.equal(failure.diagnostics.attempts[0].recoverable,true);assert.equal(failure.diagnostics.attempts[0].retryScheduled,true);assert.equal(failure.diagnostics.attempts[0].retryResult,'failed');assert.equal(failure.diagnostics.attempts[1].retryScheduled,false);}
});

test('response-shape, malformed, and buyer-validation failures receive distinct safe classes',async()=>{
 const cases=[{response:{choices:[]},valid:()=>true,expected:'unexpected_response_shape'},{response:response('nope'),valid:()=>true,expected:'malformed_output'},{response:response(JSON.stringify({text:'not accepted'})),valid:()=>false,expected:'validation_rejection'}];
 for(const item of cases){let failure;try{await generatePracticeBuyerResponse({sellerTurnId:'seller-5',request:async()=>item.response,isValidBuyerText:item.valid});}catch(error){failure=error;}assert.ok(failure instanceof PracticeBuyerGenerationFailure);assert.equal(failure.diagnostics.attempts.length,2);assert.equal(failure.diagnostics.attempts[0].failureClass,item.expected);assert.equal(failure.diagnostics.attempts[1].failureClass,item.expected);}
});
