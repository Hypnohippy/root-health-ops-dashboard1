import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const exporter=fs.readFileSync('docs/google-engine-state-export.gs','utf8');
const functions=fs.readFileSync('docs/personal-social-action-functions.gs','utf8');
function context(){
 const source='  How do you switch off after work? 👋\nExact public source text.';
 let calls=0,status=200,body=source;
 const c={Date,Logger:{log(){}},UrlFetchApp:{fetch(_url,options){calls++;assert.equal(options.followRedirects,false);return {getResponseCode:()=>status,getContentText:()=>body};}}};
 vm.createContext(c);vm.runInContext(exporter+'\n'+functions,c);c.personalIsDirectPublicDiscussionUrl_=c.opsDirectSocialDiscussion_;
 return {c,source,calls:()=>calls,setResponse:(code,text)=>{status=code;body=text;}};
}
const evidence=source=>({originalPost:source,preparedReply:'What helps you switch off?',publicContext:true,consumerOutreach:false,healthTargeting:false,verifiedDirectDiscussion:true,contentAngle:'Workday boundaries',assetType:'LinkedIn post',relevance:'Root routines content',cta:'Explore general routines'});
test('existing source verifier preserves all safety gates and routes Reddit without a reply',()=>{
 const {c,source,calls,setResponse}=context();const url='https://reddit.com/r/test/comments/id';
 const item={socialEvidence:evidence(source)};const result=c.personalSocialEvidence_(item,url);
 assert.equal(result.actionType,'CONTENT_SIGNAL');assert.equal(result.preparedReply,'');assert.equal(result.originalPost,source);assert.equal(result.contentAngle,'Workday boundaries');
 for(const field of ['publicContext','consumerOutreach','healthTargeting','verifiedDirectDiscussion'])assert.equal(c.personalSocialEvidence_({socialEvidence:{...item.socialEvidence,[field]:!item.socialEvidence[field]}},url),null);
 assert.equal(c.personalSocialEvidence_({socialEvidence:{...item.socialEvidence,contentAngle:''}},url),null);
 assert.equal(c.personalSocialEvidence_(item,'https://vertexaisearch.cloud.google.com/grounding-api-redirect/old'),null);
 assert.equal(calls(),1);setResponse(302,source);assert.equal(c.personalSocialEvidence_(item,url),null);setResponse(200,'different text');assert.equal(c.personalSocialEvidence_(item,url),null);
 assert.equal(c.personalSocialEvidence_({socialEvidence:evidence('I want to kill myself')},url),null);
});
test('LinkedIn retains safe public response, other platforms need explicit appropriate-surface evidence',()=>{
 const {c,source}=context(),e=evidence(source);
 assert.equal(c.personalSocialEvidence_({socialEvidence:e},'https://linkedin.com/posts/id').actionType,'PUBLIC_RESPONSE');
 assert.equal(c.personalSocialEvidence_({socialEvidence:{...e,preparedReply:'DM us now'}},'https://linkedin.com/posts/id'),null);
 const url='https://x.com/user/status/id';assert.equal(c.personalSocialEvidence_({socialEvidence:e},url).actionType,'CONTENT_SIGNAL');
 assert.equal(c.personalSocialEvidence_({socialEvidence:{...e,actionType:'PUBLIC_RESPONSE',publicEngagementSurfaceVerified:true,publicEngagementSurfaceEvidence:'Root owned surface explicitly confirmed'}},url).actionType,'PUBLIC_RESPONSE');
 const prompt=c.personalBuildSocialPrompt_({socialEvidence:e,sourceUrl:'https://reddit.com/r/test/comments/id',theme:'Stress'},1);
 assert.match(prompt,/never PUBLIC_REPLY/);assert.doesNotMatch(prompt,/preparedReply|What helps you/);
});
test('existing writer stores explicit action, original text, content fields and safety; refuses a Reddit PUBLIC_REPLY',()=>{
 const {c,source}=context();let rows=[],sent=[],platform='LinkedIn';
 const headers=['Social ID','Queue row','Mode','Platform','Theme','Source URL','Context / Question','Hook','Draft','CTA','Destination','Risk','Status','Generated','Original Post','Prepared Reply','Public Context','Consumer Outreach','Health Targeting','Verified Direct Discussion','Notes'];
 const e={...evidence(source),actionType:'CONTENT_SIGNAL',preparedReply:''};
 Object.assign(c,{PERSONAL_ROOT:{primaryCta:'https://example.com',vertexEndpoint:'https://example.com/model'},personalReadSettings_:()=>({socialGenerationEnabled:true,socialAutoPublishEnabled:false}),personalReadSocialCandidates_:()=>[{queueRow:99,mode:'REACTIVE',theme:'Stress',question:'Context',sourceUrl:'https://reddit.com/r/test/comments/id',socialEvidence:e}],ScriptApp:{getOAuthToken:()=>''},personalSpreadsheet_:()=>({getSheetByName:()=>({getLastColumn:()=>headers.length,getRange:()=>({getValues:()=>[headers]}),appendRow:row=>rows.push(row)})}),personalHeaderIndex_:()=>Object.fromEntries(headers.map((h,i)=>[h.toLowerCase(),i])),personalNormalise_:v=>String(v||'').trim().toLowerCase(),personalExistingSocialKeys_:()=>({}),personalSocialDraftToText_:v=>v,personalParseGeminiJson_:()=>({items:[{platform,hook:'Workday boundaries',draft:'Standalone content',risk:'LOW'}]}),Utilities:{formatDate:()=> 'fixture'},Session:{getScriptTimeZone:()=> 'Europe/London'},personalLog_(){},sendPersonalStateToOps_:r=>sent.push(r),personalOpsSafety_:()=>({public_context:true,consumer_outreach:false,health_targeting:false,verified_direct_discussion:true})});
 c.UrlFetchApp.fetchAll=()=>[{getResponseCode:()=>200}];
 c.personalGenerateSocialNow({manualExportOnly:true,oneReply:true});assert.equal(rows.length,1);const read=h=>rows[0][headers.indexOf(h)];assert.equal(read('Mode'),'CONTENT_SIGNAL');assert.equal(read('Platform'),'reddit.com');assert.equal(read('Original Post'),source);assert.equal(read('Prepared Reply'),'');assert.equal(read('Public Context'),true);assert.equal(read('Consumer Outreach'),false);assert.equal(read('Health Targeting'),false);assert.equal(read('Verified Direct Discussion'),true);assert.equal(c.opsSocialActionEvidence_(read('Notes')).assetType,'LinkedIn post');assert.equal(sent.length,0);
 platform='PUBLIC_REPLY';c.personalGenerateSocialNow({manualExportOnly:true,oneReply:true});assert.equal(rows.length,1);
});
test('existing reader does not replay a source already written under either explicit action',()=>{
 const {c,source}=context();const headers=['Acquisition lane','Notes','Theme','Search question','Priority','Target surface'];
 const notes='Source: https://reddit.com/r/test/comments/id | Social evidence: '+encodeURIComponent(JSON.stringify({...evidence(source),actionType:'CONTENT_SIGNAL'}));
 Object.assign(c,{personalReadSettings_:()=>({socialGenerationEnabled:true,socialReactiveEnabled:true,socialVariantsPerSource:3}),personalSpreadsheet_:()=>({getSheetByName:()=>({getLastRow:()=>2,getDataRange:()=>({getValues:()=>[headers,['Social/community intent',notes,'Stress','Context',1,'public']]})})}),personalHeaderIndex_:()=>Object.fromEntries(headers.map((h,i)=>[h.toLowerCase(),i])),personalNormalise_:v=>String(v||'').trim().toLowerCase(),personalCleanUrl_:v=>v,personalExtractSourceFromQueueNotes_:()=> 'https://reddit.com/r/test/comments/id',personalExtractEvidenceDateFromQueueNotes_:()=>'',personalSocialCandidateFreshness_:()=>true});
 for(const type of ['content_signal','public_response']){c.personalExistingSocialKeys_=()=>({['2|'+type+'|reddit.com']:true});assert.equal(c.personalReadSocialCandidates_().length,0);}
 c.personalExistingSocialKeys_=()=>({});assert.equal(c.personalReadSocialCandidates_().length,1);
});
