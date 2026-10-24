import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTruthModule} from './relationship-truth-loader.mjs';
const {enrichLinkedInOutreachDisplay:enrich}=loadTruthModule('lib/linkedinOutreachDisplay.ts');
const {linkedInDestination}=loadTruthModule('lib/linkedinOutreach.ts');
const org='tenant-a', profile='linkedin.com/in/synthetic-person';
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
const fixture=()=>({input:{lifecycle:{inbox_items:[{id:a,organisation_id:org,author_name:'Synthetic Person',platform:'linkedin',kind:'connection_accepted',linkedin_identity:profile}],growth_targets:[],acquisition_items:[{id:b,organisation_id:org,person:'Synthetic Person',linkedin_identity:profile,role_title:'People Director',company:'Synthetic Employer',metadata:{message_url:'https://www.linkedin.com/messaging/thread/recorded-thread/'}}]},founder:[],workspaces:[],links:[],founderActivities:[],emailMessages:[],linkedinMessages:[],activities:[],tasks:[],acquisitionEvents:[],responseEvents:[]},policy:{organisationId:org,founderAllowed:false,asOf:'2026-10-21T12:00:00Z'},ledger:[]});
const item={table:'inbox_items',id:a,contactId:'contact',role:null,company:null,stage:'connection',mode:'fresh',context:{role:null},destination:'https://linkedin.com/in/synthetic-person',destinationKind:'profile'};
test('exact established Truth membership enriches display and reuses recorded destination without changing operations',()=>{
 const c=fixture(),before=JSON.stringify(c);const result=enrich([item],c)[0];
 assert.equal(result.role,'People Director');assert.equal(result.company,'Synthetic Employer');assert.equal(result.destination,'https://www.linkedin.com/messaging/thread/recorded-thread/');assert.equal(result.destinationKind,'messaging');
 assert.equal(result.context.role,result.role);assert.equal(result.context.company,result.company);assert.equal(result.stage,item.stage);assert.equal(result.mode,item.mode);assert.equal(JSON.stringify(c),before);
});
test('name/company alone do not authorize borrowing context or destinations',()=>{
 const c=fixture();delete c.input.lifecycle.acquisition_items[0].linkedin_identity;
 const result=enrich([item],c)[0];assert.equal(result.role,null);assert.equal(result.company,null);assert.equal(result.destination,item.destination);
});
test('conflicting role/company remain null and foreign evidence is excluded',()=>{
 const c=fixture();Object.assign(c.input.lifecycle.inbox_items[0],{role_title:'Other role',company:'Other employer'});
 let result=enrich([item],c)[0];assert.equal(result.role,null);assert.equal(result.company,null);
 c.input.lifecycle.acquisition_items[0].organisation_id='foreign';result=enrich([item],c)[0];assert.equal(result.role,'Other role');assert.equal(result.company,'Other employer');assert.equal(result.destination,item.destination);
});
test('recorded messaging fields win; profile-only remains truthful; unsafe URLs never become messaging',()=>{
 assert.equal(linkedInDestination([{linkedin_identity:profile}]),'https://linkedin.com/in/synthetic-person');
 assert.equal(linkedInDestination([{linkedin_identity:profile,raw:{metadata:{message_url:'https://www.linkedin.com/messaging/thread/exact/'}}}]),'https://www.linkedin.com/messaging/thread/exact/');
 for(const message_url of ['https://evil.test/messaging/thread/x','javascript:alert(1)','https://linkedin.com/messaging/'])assert.equal(linkedInDestination([{linkedin_identity:profile,message_url}]),'https://linkedin.com/in/synthetic-person');
});
