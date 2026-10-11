import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('docs/personal-brave-routing.gs','utf8');
function scope(extra={}){const s={personalReadSettings_:()=>({discoveryRequestedPerBatch:12}),personalIsDirectPublicDiscussionUrl_:u=>/^https:\/\/(linkedin.com\/posts|x.com\/[^/]+\/status)\//.test(u),...extra};vm.runInNewContext(source,s);return s;}
test('intended routing precedes qualification; public content never asserts a Personal prospect',()=>{
 const s=scope();assert.equal(s.personalBraveRoute_('https://linkedin.com/posts/discussion','PARTNERS_DISTRIBUTION'),'AUDIENCE_INTELLIGENCE');
 assert.equal(s.personalBraveRoute_('https://business.example/contact','PARTNERS_DISTRIBUTION'),'PARTNERS_DISTRIBUTION');
 assert.equal(s.personalBraveRoute_('https://research.example/article','AUDIENCE_INTELLIGENCE'),'AUDIENCE_INTELLIGENCE');
 assert.equal(s.personalBraveRoute_('https://business.example/contact','AUDIENCE_INTELLIGENCE'),'PARTNERS_DISTRIBUTION');
 assert.equal(s.personalBraveRoute_('https://business.example/','AUDIENCE_INTELLIGENCE'),'PARTNERS_DISTRIBUTION');
 assert.equal(s.personalBraveRoute_('https://search.example/search?q=stress','AUDIENCE_INTELLIGENCE'),null);
 for(const u of ['https://reddit.com/r/a/comments/b','https://vertexaisearch.cloud.google.com/redirect','https://linkedin.com/in/example','http://example.com/article','https://127.0.0.1/a'])assert.equal(s.personalBraveRoute_(u,'AUDIENCE_INTELLIGENCE'),null);
 assert.doesNotMatch(source,/first_party_interaction\s*[:=]|newTrigger|sendEmail/);
});
const text='Verified general public wellbeing research evidence.';
const audience=()=>({type:'AUDIENCE_INTELLIGENCE',outcome:'qualified',publicContext:true,consumerOutreach:false,healthTargeting:false,sourceText:text,relevance:'General audience interest',contentAngle:'Sleep recovery',assetType:'article brief',brief:'Editorial brief for review'});
test('Audience intelligence requires exact public source and safe content action, but no contact person or discussion URL',()=>{
 const s=scope(),src={type:'AUDIENCE_INTELLIGENCE',text,html:text};assert.equal(s.personalRoutedQualification_(audience(),src),null);
 assert.equal(s.personalRoutedQualification_({...audience(),sourceText:'Invented quote that was not in source'},src),'source_text_not_verified');
 assert.equal(s.personalRoutedQualification_({...audience(),consumerOutreach:true},src),'explicit_safety_missing');
 assert.equal(s.personalRoutedQualification_({...audience(),brief:''},src),'content_action_missing');
});
test('partner qualification requires verified business identity, literal public contact route and next step',()=>{
 const s=scope(),item={...audience(),type:'PARTNERS_DISTRIBUTION',organisation:'Public Business',verifiedPublicBusiness:true,contactRoute:'mailto:business@example.org',nextStep:'Review business relevance'},src={type:'PARTNERS_DISTRIBUTION',text,html:text+' <a href="mailto:business@example.org">Contact</a>'};
 assert.equal(s.personalRoutedQualification_(item,src),null);
 assert.equal(s.personalRoutedQualification_({...item,contactRoute:'mailto:invented@example.org'},src),'business_contact_route_unverified');
 assert.equal(s.personalRoutedQualification_({...item,verifiedPublicBusiness:false},src),'business_identity_unverified');
});
test('source unavailable and parser failure yield explicit diagnostics without invented candidates',()=>{
 const s=scope({personalCleanUrl_:x=>x,UrlFetchApp:{fetchAll:()=>[{getResponseCode:()=>403}]}}),d={};
 const r=s.personalClassifyRoutedBraveResults_({getContentText:()=>JSON.stringify({web:{results:[{url:'https://linkedin.com/posts/real'}]}})},{queryTemplate:'sleep'},d,{});
 assert.equal(r.opportunities.length,0);assert.equal(r.routedOutcomes[0].reason,'source_unavailable');assert.equal(r.routedOutcomes[0].parseSuccess,null);
});
test('routed exporter skips legacy and rejects safety spoofing or source mismatch',()=>{
 const s={};vm.runInNewContext(fs.readFileSync('docs/google-engine-state-export.gs','utf8'),s);
 const e={...audience(),type:'AUDIENCE_INTELLIGENCE',sourceUrl:'https://research.example/article',verifiedAt:'2026-10-11T10:00:00Z'};
 const row={'Action ID':'PA-R-'+ 'a'.repeat(32),'Source URL':e.sourceUrl,'Opportunity':text,Notes:'Routed evidence: '+encodeURIComponent(JSON.stringify(e))};
 const read=k=>row[k]??'';assert.equal(s.opsRoutedActionEvidence_(read).type,'AUDIENCE_INTELLIGENCE');
 row.Notes='Legacy no verification';assert.equal(s.opsRoutedActionEvidence_(read),null);
 row.Notes='Routed evidence: '+encodeURIComponent(JSON.stringify({...e,healthTargeting:true}));assert.equal(s.opsRoutedActionEvidence_(read),null);
});
