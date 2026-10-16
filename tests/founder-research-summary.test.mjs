import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {load} from './root-advisor-helpers.mjs';
const C=load('app/dashboard/founder-intelligence/FounderResearchSummary.tsx').default;
const record={id:'existing',company:'Stored company',person_name:null,lane:'open_intelligence',geography:'UK',research_snapshot:{name:'Stored company',score:72,strategicFit:'Existing fit text',risks:['Recorded risk one','Recorded risk two'],questions:['Existing validation question?'],unknownAuditField:{preserve:'exact'}},contacts:[],sources:[]};
const render=r=>renderToStaticMarkup(React.createElement(C,{record:r}));
test('risks and questions render exact existing stored arrays',()=>{const html=render(record);assert.match(html,/<li>Recorded risk one<\/li>/);assert.match(html,/<li>Recorded risk two<\/li>/);assert.match(html,/<li>Existing validation question\?<\/li>/);assert.match(html,/Existing fit text/);});
test('empty contacts have a deliberate empty state and raw data stays collapsed for audit',()=>{const html=render(record);assert.match(html,/No contacts recorded for this research/);assert.match(html,/<details class="founder-summary-raw"><summary>View raw research data/);assert.doesNotMatch(html,/<details[^>]*open/);assert.match(html,/unknownAuditField/);assert.doesNotMatch(html,/<p>\[\]<\/p>/);});
test('render leaves the complete stored object untouched and uses no network or mutation hooks',()=>{const before=JSON.stringify(record);render(record);assert.equal(JSON.stringify(record),before);const source=fs.readFileSync('app/dashboard/founder-intelligence/FounderResearchSummary.tsx','utf8');assert.doesNotMatch(source,/fetch\(|useEffect|supabase|\.rpc\(|onClick|generate|dangerouslySetInnerHTML/);});
test('missing fields are not invented and unsafe source URLs never become links',()=>{const html=render({...record,research_snapshot:{},sources:['javascript:alert(1)']});assert.match(html,/Not established/);assert.match(html,/No watch-outs recorded/);assert.doesNotMatch(html,/href="javascript:/);});

test('saved discovery research exposes its existing why, evidence summary and fitScore without regeneration',()=>{const html=render({...record,research_snapshot:{why:'Exact saved reason',evidenceSummary:'Exact saved evidence',fitScore:82}});assert.match(html,/Exact saved reason/);assert.match(html,/Exact saved evidence/);assert.match(html,/82\/100/);assert.doesNotMatch(html,/No fit explanation recorded/);});
