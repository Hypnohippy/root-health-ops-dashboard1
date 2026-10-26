import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {load} from './linkedin-capture-loader.mjs';

const launch=load('lib/meetingLaunch.ts');
const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const source=(relationshipId,organisationId=org)=>({provider:'conversation_confirmation',relationshipId,organisationId});
const item=(id,relationshipId,at,extra={})=>({id,title:'Alex meeting',type:'Meeting',at,channel:'Phone',source:source(relationshipId),provenance:[{id:'evidence',source:'confirmed'}],...extra});

test('relationship launch resolves only exact tenant-owned future confirmed meetings',()=>{
 const exact='["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","linkedin:linkedin.com/in/alex"]';
 const items=[item('later',exact,'2026-10-28T10:00:00Z'),item('earlier',exact,'2026-10-27T10:00:00Z'),item('past',exact,'2026-10-25T10:00:00Z'),item('namesake',other,'2026-10-27T09:00:00Z'),item('other-tenant',exact,'2026-10-27T09:00:00Z',{source:source(exact,other)}),item('unproven',exact,'2026-10-27T08:00:00Z',{provenance:[]}),{...item('follow-up',exact,'2026-10-27T07:00:00Z'),type:'Follow-up'}];
 assert.deepEqual(launch.upcomingRelationshipMeetings(items,org,exact,Date.parse('2026-10-26T12:00:00Z')).map(x=>x.id),['earlier','later']);
});
test('relationship-only call IDs require an exact supported tenant locator',()=>{
 assert.equal(launch.relationshipCallId('inbox_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'relationship-call:inbox_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 assert.throws(()=>launch.relationshipCallId('workspace_invalid'));
});
test('Diary offers a stable synthetic practice launch and relationship page has direct call entry',()=>{
 const diary=fs.readFileSync('app/dashboard/diary/Diary.tsx','utf8'),relationship=fs.readFileSync('app/dashboard/growth/relationships/components/RelationshipDetail.tsx','utf8');
 assert.match(diary,/SYNTHETIC PRACTICE APPOINTMENT/);assert.match(diary,/PRACTICE_ID/);assert.match(diary,/Start Meeting Copilot/);
 assert.match(relationship,/Start Call/);assert.match(relationship,/relationshipCallId\(locator\)/);assert.match(relationship,/meetingAppointments\.map/);assert.match(relationship,/!r\.contactId\?null/);assert.match(relationship,/Review relationship identity/);
});
test('known appointment context is auto-loaded; microphone still requires explicit consent',()=>{
 const ui=fs.readFileSync('app/dashboard/meetings/MeetingCopilot.tsx','utf8');
 assert.match(ui,/if\(appointmentId&&!brief&&autoPreparedId\.current!==appointmentId\)\{autoPreparedId\.current=appointmentId;void prepare\(\);\}/);
 assert.match(ui,/disabled=\{!consent\} onClick=\{\(\)=>void start\(\)\}/);
 assert.match(ui,/relationship_call/);
 const server=fs.readFileSync('lib/meetingCopilot.server.ts','utf8');
 assert.match(server,/record\.intelligence\.identity\.humanReviewRequired/);assert.match(server,/meetingPrepContext\(record\)/);assert.match(server,/record\.researchAccess\?record\.approvedResearch/);assert.match(server,/note\.founder_only!==true/);
});
