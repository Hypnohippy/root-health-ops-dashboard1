import React from 'react';
import renderer,{act} from 'react-test-renderer';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
function load(file,deps={}) { const mod={exports:{}};const listeners=deps.__windowListeners||new Map();vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,Date,Intl,URL,console,window:{addEventListener:(name,handler)=>listeners.set(name,handler),removeEventListener:(name)=>listeners.delete(name),setTimeout,clearTimeout,confirm:message=>deps.__confirm?deps.__confirm(message):true},document:{addEventListener:()=>{},removeEventListener:()=>{},visibilityState:'visible'},fetch:deps.__fetch || (async()=>Response.json(snapshot)),require:n=>n in deps?deps[n]:n.endsWith('.css')?{}:n==='react'?React:n==='react/jsx-runtime'?jsx:n.startsWith('@/lib/')?load(n.replace('@/','')+'.ts',deps):n.startsWith('./')?load('app/dashboard/diary/'+n.slice(2)+'.tsx',deps):(()=>{throw Error(n)})()});return mod.exports; }
import * as jsx from 'react/jsx-runtime';
const model=load('lib/diary.ts'),org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',snapshot={asOf:'2026-10-22T12:00:00Z',today:'2026-10-22',timezone:'Europe/London',items:[{id:'fixture',title:'Controlled follow-up',company:null,at:'2026-10-22T14:00:00Z',dateOnly:false,type:'Follow-up',status:'follow up',action:'Review source',workspace:'Responses',href:'/dashboard/responses?organisationId='+org+'&itemId=fixture',actionable:true,source:{organisationId:org,table:'inbox_items',recordId:'fixture',dateSource:'lifecycle.nextDueDate'}}]};
const Diary=load('app/dashboard/diary/Diary.tsx',{'@/lib/diary':model}).default;
test('Today default gives appointments the primary left lane and preserves operational work on the right',async()=>{let tree;await act(async()=>{tree=renderer.create(React.createElement(Diary,{organisationId:org,initial:{...snapshot,appointments:[appointment]}}));});const lanes=tree.root.findAllByProps({className:'diary-lane diary-lane-appointments'});const work=tree.root.findAllByProps({className:'diary-lane diary-lane-operational-work'});assert.equal(lanes.length,1);assert.equal(work.length,1);const rendered=JSON.stringify(tree.toJSON());assert.ok(rendered.indexOf('diary-lane-appointments')<rendered.indexOf('diary-lane-operational-work'));assert.match(lanes[0].findAllByType('strong').map(node=>node.children.join('')).join(' '),/Auriel Wetherall call/);assert.match(work[0].findAllByType('strong').map(node=>node.children.join('')).join(' '),/Controlled follow-up/);assert.equal(work[0].findAllByProps({className:'diary-operational-item'}).length,1);assert.match(rendered,/UK time|Europe\/London/);assert.ok(tree.root.findAllByType('button').some(b=>b.props.children==='Today'&&b.props['aria-pressed']));assert.ok(tree.root.findAllByType('button').some(b=>b.props.children==='+ Add appointment'));await act(()=>tree.unmount());});
test('Week and Month keep separate chronological lanes and expose appointment counts',async()=>{let tree;await act(async()=>{tree=renderer.create(React.createElement(Diary,{organisationId:org,initial:{...snapshot,appointments:[appointment]}}));});const button=name=>tree.root.findAllByType('button').find(b=>b.props.children===name);await act(()=>button('Week').props.onClick());assert.equal(tree.root.findAllByProps({className:'diary-lane-group'}).length,14);const weekAppointments=tree.root.findByProps({className:'diary-lane diary-lane-appointments'});const weekWork=tree.root.findByProps({className:'diary-lane diary-lane-operational-work'});assert.match(weekAppointments.findAllByType('strong').map(node=>node.children.join('')).join(' '),/Auriel Wetherall call/);assert.match(weekWork.findAllByType('strong').map(node=>node.children.join('')).join(' '),/Controlled follow-up/);await act(()=>button('Month').props.onClick());const days=tree.root.findAllByType('button').filter(b=>/^\d{1,2}$/.test(b.findAllByType('strong')[0]?.children.join('')||''));assert.equal(days.length,31);assert.match(days.find(d=>/22 Oct/.test(d.props['aria-label'])).props['aria-label'],/1 appointment, 1 operational item/);await act(()=>days[0].props.onClick());assert.equal(tree.root.findAllByProps({className:'diary-lane diary-lane-appointments'}).length,1);assert.equal(tree.root.findAllByProps({className:'diary-lane diary-lane-operational-work'}).length,1);await act(()=>button('Today').props.onClick());await act(async()=>button('Refresh').props.onClick());assert.ok(tree.root.findAllByType('a').length);await act(()=>tree.unmount());});
test('mobile CSS uses shrinkable single-column cards and seven compact date cells',()=>{const css=fs.readFileSync('app/dashboard/diary/diary.css','utf8');assert.match(css,/@media\(max-width:700px\)/);assert.match(css,/overflow-wrap:anywhere/);assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);assert.match(css,/repeat\(7,minmax\(0,1fr\)\)/);});

test('Google-native events share the Appointments lane as read-only cards and Calendar connection is visible',async()=>{const event={id:'native-event',calendarId:'primary',title:'Google planning',startsAt:'2026-10-22T15:00:00Z',endsAt:'2026-10-22T15:30:00Z',startDate:null,endDate:null,timezone:'Europe/London',allDay:false,location:'London',meetingUrl:'https://meet.google.com/abc-defg-hij',source:'google_calendar'};let tree;await act(async()=>{tree=renderer.create(React.createElement(Diary,{organisationId:org,initial:{...snapshot,appointments:[appointment],googleCalendarEvents:[event],googleCalendar:{connected:true,email:'david@example.com',unavailable:false}}}));});const lane=tree.root.findByProps({className:'diary-lane diary-lane-appointments'}),googleCard=lane.findByProps({className:'diary-appointment diary-google-calendar-event'});assert.match(JSON.stringify(tree.toJSON()),/Google Calendar · Read only/);assert.match(JSON.stringify(tree.toJSON()),/Google planning/);assert.equal(lane.findAllByType('button').filter(button=>button.props.children==='Edit / reschedule'||button.props.children==='Cancel appointment').length,2);assert.match(JSON.stringify(tree.toJSON()),/Connected as david@example.com/);assert.equal(googleCard.findAllByType('button').length,0);await act(()=>tree.unmount());});
test('cancellation confirmation is in-app, Escape and Keep abort, and confirmation posts once with mirror disclosure',async()=>{const requests=[],listeners=new Map(),synced={...appointment,googleCalendarSyncEnabled:true,googleCalendarMirrored:true};const data={...snapshot,appointments:[synced],googleCalendar:{connected:true,email:'david@example.com',unavailable:false}};const fetcher=async(url,init={})=>{requests.push([url,init]);if(init.method==='POST')return Response.json({success:true,appointment:{...synced,status:'cancelled'}});return Response.json({...data,appointments:[{...synced,status:'cancelled'}]});};let nativeConfirmCalls=0;const TestDiary=load('app/dashboard/diary/Diary.tsx',{'@/lib/diary':model,'__fetch':fetcher,'__windowListeners':listeners,'__confirm':()=>{nativeConfirmCalls++;return true;}}).default;let tree;await act(async()=>{tree=renderer.create(React.createElement(TestDiary,{organisationId:org,initial:data}));});const open=async()=>act(async()=>tree.root.findAllByType('button').find(button=>button.props.children==='Cancel appointment').props.onClick({currentTarget:{focus(){},isConnected:false}}));await open();let dialog=tree.root.findByProps({role:'dialog'});assert.match(JSON.stringify(tree.toJSON()),/Auriel Wetherall call/);assert.match(JSON.stringify(tree.toJSON()),/Root-owned Google Calendar event will also be cancelled/);assert.match(JSON.stringify(tree.toJSON()),/Root appointment will remain in history/);assert.deepEqual(dialog.findAllByType('button').map(button=>button.props.children),['Keep appointment','Cancel appointment']);await act(()=>dialog.findAllByType('button')[0].props.onClick());assert.equal(requests.length,0,'Keep appointment performs no write');assert.equal(nativeConfirmCalls,0);await open();dialog=tree.root.findByProps({role:'dialog'});await act(()=>listeners.get('keydown')({key:'Escape',preventDefault(){}}));assert.equal(requests.length,0,'Escape closes without a write');await open();dialog=tree.root.findByProps({role:'dialog'});await act(async()=>dialog.findAllByType('button')[1].props.onClick());assert.equal(requests.filter(request=>request[1].method==='POST').length,1);assert.match(requests.find(request=>request[1].method==='POST')[0],/api\/diary\/appointments\/apt-1/);assert.deepEqual(JSON.parse(requests.find(request=>request[1].method==='POST')[1].body),{action:'cancel',revision:2});assert.equal(nativeConfirmCalls,0);assert.match(tree.root.findAllByProps({role:'status'}).map(node=>JSON.stringify(node.children)).join(' '),/Appointment cancelled and retained in history/);assert.equal(tree.root.findAllByType('summary').find(node=>node.children.join('').startsWith('Cancelled appointments'))?.children.join(''),'Cancelled appointments (1)');assert.doesNotMatch(fs.readFileSync('app/dashboard/diary/Diary.tsx','utf8'),/window\.confirm|window\.alert|\balert\s*\(/);await act(()=>tree.unmount());});

test("Diary owns a pale content surface so dark text remains readable in the dark dashboard shell",()=>{const css=fs.readFileSync("app/dashboard/diary/diary.css","utf8");assert.match(css,/\.diary-root\{background:#eef4f0;/);});


test('undated suppressed history shows an explicit unknown date and safe source explanation',async()=>{let tree;const data={...snapshot,items:[{...snapshot.items[0],at:null,actionable:false,suppressionReason:'Relationship marked stale',navigationReason:'Identity unresolved; exact source only. No identities merged.'}]};await act(()=>{tree=renderer.create(React.createElement(Diary,{organisationId:org,initial:data}));});const text=JSON.stringify(tree.toJSON());assert.match(text,/Date\/time not recorded/);assert.match(text,/Relationship marked stale/);assert.match(text,/Identity unresolved/);assert.match(tree.root.findAllByType("span").find(n=>n.props.className==="diary-status").children.join(""),/Actionable: No/);assert.doesNotMatch(text,/00:00/);await act(()=>tree.unmount());});
test('date-only meeting keeps unknown clock while retaining independent task and follow-up controls',async()=>{let tree;const data={...snapshot,items:[...snapshot.items,{...snapshot.items[0],id:'meeting',type:'Meeting',at:snapshot.today,dateOnly:true,actionable:false},{...snapshot.items[0],id:'task',type:'Task'}]};await act(()=>{tree=renderer.create(React.createElement(Diary,{organisationId:org,initial:data}));});assert.equal(tree.root.findAllByType('a').length,4);assert.doesNotMatch(tree.root.findAllByType('time')[1].children.join(''),/00:00/);await act(()=>tree.unmount());});

const appointment={id:'apt-1',title:'Auriel Wetherall call',startsAt:'2026-10-22T14:00:00.000Z',endsAt:'2026-10-22T14:45:00.000Z',startDate:null,endDate:null,timezone:'Europe/London',allDay:false,location:'Root Health',meetingUrl:null,notes:'Review opportunity',status:'confirmed',source:'relationship',revision:2,createdAt:'2026-10-20T10:00:00Z',updatedAt:'2026-10-20T10:00:00Z',cancelledAt:null,relationship:{id:'rel-1',person:'Auriel Wetherall',company:'Flourish With Type 2',href:'/dashboard/growth/relationships/workspace_rel-1'}};
test('Today Upcoming shows UK start dates for Root and Google cards without repeating dates in Week or Month',async()=>{const future={...appointment,title:'Sam WhatsApp call',startsAt:'2026-11-13T13:30:00.000Z',endsAt:'2026-11-13T14:30:00.000Z'},event={id:'sam-google',calendarId:'primary',title:'Sam WhatsApp call',startsAt:'2026-11-13T13:30:00.000Z',endsAt:'2026-11-13T14:30:00.000Z',startDate:null,endDate:null,timezone:'Europe/London',allDay:false,location:null,meetingUrl:null,source:'google_calendar'};let tree;await act(async()=>{tree=renderer.create(React.createElement(Diary,{organisationId:org,initial:{...snapshot,appointments:[appointment,future],googleCalendarEvents:[event]}}));});let lane=tree.root.findByProps({className:'diary-lane diary-lane-appointments'}),dateLabels=lane.findAllByProps({className:'diary-appointment-date'});assert.equal(dateLabels.length,2);assert.deepEqual(dateLabels.map(node=>node.children.join('')),['Fri 13 Nov','Fri 13 Nov']);const todayJson=JSON.stringify(tree.toJSON());assert.ok(todayJson.indexOf('Fri 13 Nov')<todayJson.indexOf('13:30–14:30 · Europe/London'));assert.ok(todayJson.indexOf('13:30–14:30 · Europe/London')<todayJson.indexOf('Sam WhatsApp call'));const button=name=>tree.root.findAllByType('button').find(b=>b.props.children===name);await act(()=>button('Week').props.onClick());lane=tree.root.findByProps({className:'diary-lane diary-lane-appointments'});assert.equal(lane.findAllByProps({className:'diary-appointment-date'}).length,0);assert.match(JSON.stringify(tree.toJSON()),/Thu 22 Oct/);await act(()=>button('Month').props.onClick());lane=tree.root.findByProps({className:'diary-lane diary-lane-appointments'});assert.equal(lane.findAllByProps({className:'diary-appointment-date'}).length,0);assert.equal(tree.root.findByProps({className:'diary-selected-date'}).children.join(''),'Thu 22 Oct');await act(()=>tree.unmount());});
test('appointment cards retain prominent time, location, status and relationship links in all views',async()=>{let tree;const data={...snapshot,appointments:[appointment]};await act(async()=>{tree=renderer.create(React.createElement(Diary,{organisationId:org,initial:data}));});let text=JSON.stringify(tree.toJSON());assert.match(text,/Auriel Wetherall call/);assert.match(text,/15:00–15:45/);assert.match(text,/Root Health/);assert.match(text,/Confirmed/);assert.ok(tree.root.findAllByType('a').some(a=>a.props.href===appointment.relationship.href));const button=name=>tree.root.findAllByType('button').find(b=>b.props.children===name);await act(()=>button('Week').props.onClick());assert.match(JSON.stringify(tree.toJSON()),/Auriel Wetherall call/);await act(()=>button('Month').props.onClick());const dateButton=tree.root.findAllByType('button').find(b=>/22 Oct.*appointment/.test(b.props['aria-label']||''));assert.ok(dateButton);await act(()=>dateButton.props.onClick());assert.match(JSON.stringify(tree.toJSON()),/Auriel Wetherall call/);await act(()=>tree.unmount());});

test('all-day Root and Google events occupy every date in their end-exclusive range, but timed events stay on their start date',async()=>{
  const rootSpan={...appointment,id:'root-span',title:'Root planning retreat',allDay:true,startsAt:null,endsAt:null,startDate:'2026-10-24',endDate:'2026-10-26',status:'confirmed',relationship:null};
  const timed={...appointment,id:'overnight-timed',title:'Overnight timed call',startsAt:'2026-10-24T22:00:00Z',endsAt:'2026-10-25T01:00:00Z'};
  const googleSpan={id:'google-span',calendarId:'primary',title:'Google planning retreat',startsAt:null,endsAt:null,startDate:'2026-10-24',endDate:'2026-10-26',timezone:'Europe/London',allDay:true,location:null,meetingUrl:null,source:'google_calendar'};
  let tree; await act(async()=>{tree=renderer.create(React.createElement(Diary,{organisationId:org,initial:{...snapshot,appointments:[rootSpan,timed],googleCalendarEvents:[googleSpan]}}));});
  const button=name=>tree.root.findAllByType('button').find(b=>b.props.children===name);
  await act(()=>button('Week').props.onClick());
  const groups=tree.root.findAllByProps({className:'diary-lane-group'}).slice(0,7);
  const entriesFor=date=>{const group=groups.find(g=>g.findAllByType('h3')[0]?.children.join('').startsWith(date));return group?.findAllByType('li').map(li=>li.findAllByType('strong').map(n=>n.children.join('')).join(' '))||[];};
  assert.deepEqual(entriesFor('Sat 24 Oct').sort(),['Root planning retreat','Google planning retreat','Overnight timed call'].sort());
  assert.deepEqual(entriesFor('Sun 25 Oct').sort(),['Root planning retreat','Google planning retreat'].sort(),'the final occupied date is included');
  assert.deepEqual(entriesFor('Mon 26 Oct'),[],'the exclusive end date is not occupied');
  await act(()=>button('Month').props.onClick());
  const dayButton=date=>tree.root.findAllByType('button').find(b=>(b.props['aria-label']||'').startsWith(date));
  assert.match(dayButton('Sun 25 Oct').props['aria-label'],/2 appointments/);
  assert.match(dayButton('Mon 26 Oct').props['aria-label'],/0 appointments/);
  await act(()=>tree.unmount());
});

test('operation warnings survive their canonical refresh and a later manual refresh clears them',async()=>{
  const pending={...appointment,googleCalendarSyncEnabled:true,googleCalendarSyncPending:true};
  const data={...snapshot,appointments:[pending]};let responseCount=0,tree;
  const fetcher=async(url,init={})=>{if(init.method==='POST')return Response.json({error:'Google Calendar sync remains pending; retry later.'},{status:502});responseCount++;return Response.json(data);};
  const TestDiary=load('app/dashboard/diary/Diary.tsx',{'@/lib/diary':model,'__fetch':fetcher}).default;
  await act(async()=>{tree=renderer.create(React.createElement(TestDiary,{organisationId:org,initial:data}));});
  await act(async()=>tree.root.findAllByType('button').find(b=>b.props.children==='Retry Google Calendar sync').props.onClick());
  assert.match(tree.root.findAllByProps({role:'status'}).map(n=>JSON.stringify(n.children)).join(' '),/Google Calendar sync remains pending; retry later/);
  await act(async()=>tree.root.findAllByType('button').find(b=>b.props.children==='Refresh').props.onClick());
  assert.doesNotMatch(JSON.stringify(tree.toJSON()),/Google Calendar sync remains pending; retry later/);assert.equal(responseCount,2);
  await act(()=>tree.unmount());
});

test('cancellation mirror warning remains visible after the appointment refresh',async()=>{
  const mirrored={...appointment,googleCalendarSyncEnabled:true,googleCalendarMirrored:true};const data={...snapshot,appointments:[mirrored]};let tree;
  const fetcher=async(_url,init={})=>init.method==='POST'?Response.json({success:true,calendarSyncWarning:'Root appointment cancelled, but its Google mirror could not be removed.'}):Response.json({...data,appointments:[{...mirrored,status:'cancelled'}]});
  const TestDiary=load('app/dashboard/diary/Diary.tsx',{'@/lib/diary':model,'__fetch':fetcher}).default;
  await act(async()=>{tree=renderer.create(React.createElement(TestDiary,{organisationId:org,initial:data}));});
  await act(async()=>tree.root.findAllByType('button').find(b=>b.props.children==='Cancel appointment').props.onClick({currentTarget:{focus(){},isConnected:false}}));
  await act(async()=>tree.root.findByProps({role:'dialog'}).findAllByType('button')[1].props.onClick());
  assert.match(tree.root.findAllByProps({role:'status'}).map(n=>JSON.stringify(n.children)).join(' '),/Google mirror could not be removed/);
  assert.match(JSON.stringify(tree.toJSON()),/Cancelled call|Auriel Wetherall call/);
  await act(()=>tree.unmount());
});

test('API cancellation errors stay visible in the dialog and retry sends one new request',async()=>{
  const data={...snapshot,appointments:[appointment]},requests=[];let attempts=0,tree;
  const fetcher=async(url,init={})=>{if(init.method==='POST'){requests.push([url,init]);attempts++;if(attempts===1)return Response.json({error:'Appointment revision conflict. Refresh and review the latest appointment.'},{status:409});return Response.json({success:true,appointment:{...appointment,status:'cancelled',revision:3}});}return Response.json({...data,appointments:[{...appointment,status:'cancelled',revision:3}]});};
  const TestDiary=load('app/dashboard/diary/Diary.tsx',{'@/lib/diary':model,'__fetch':fetcher}).default;
  await act(async()=>{tree=renderer.create(React.createElement(TestDiary,{organisationId:org,initial:data}));});
  const open=async()=>act(async()=>tree.root.findAllByType('button').find(button=>button.props.children==='Cancel appointment').props.onClick({currentTarget:{focus(){},isConnected:false}}));
  await open();
  let dialog=tree.root.findByProps({role:'dialog'});
  await act(async()=>dialog.findAllByType('button').find(button=>button.props.children==='Cancel appointment').props.onClick());
  dialog=tree.root.findByProps({role:'dialog'});
  const error=dialog.findByProps({role:'alert'});
  assert.equal(error.children.join(''),'Appointment revision conflict. Refresh and review the latest appointment.');
  assert.equal(error.props.tabIndex,-1);assert.match(dialog.props['aria-describedby'],/diary-cancel-error/);
  assert.equal(dialog.findAllByType('button').find(button=>button.props.children==='Retry cancellation').props.disabled,false);
  assert.equal(requests.length,1,'a failed request is not retried automatically');
  await act(async()=>dialog.findAllByType('button').find(button=>button.props.children==='Retry cancellation').props.onClick());
  assert.equal(requests.length,2,'one explicit retry issues exactly one new request');
  assert.equal(JSON.parse(requests[1][1].body).revision,2);
  assert.equal(tree.root.findAllByProps({role:'dialog'}).length,0,'successful retry closes the dialog');
  assert.match(tree.root.findAllByProps({role:'status'}).map(node=>node.children.join('')).join(' '),/Appointment cancelled and retained in history/);
  await act(()=>tree.unmount());
});

test('network cancellation failure is announced inside the open dialog and Keep closes without another write',async()=>{
  const data={...snapshot,appointments:[appointment]},requests=[];let tree;
  const fetcher=async(url,init={})=>{if(init.method==='POST'){requests.push([url,init]);throw new Error('network unavailable');}return Response.json(data);};
  const TestDiary=load('app/dashboard/diary/Diary.tsx',{'@/lib/diary':model,'__fetch':fetcher}).default;
  await act(async()=>{tree=renderer.create(React.createElement(TestDiary,{organisationId:org,initial:data}));});
  await act(async()=>tree.root.findAllByType('button').find(button=>button.props.children==='Cancel appointment').props.onClick({currentTarget:{focus(){},isConnected:false}}));
  let dialog=tree.root.findByProps({role:'dialog'});
  await act(async()=>dialog.findAllByType('button').find(button=>button.props.children==='Cancel appointment').props.onClick());
  dialog=tree.root.findByProps({role:'dialog'});
  assert.match(dialog.findByProps({role:'alert'}).children.join(''),/not cancelled\. Check your connection and try again\./);
  assert.equal(tree.root.findAllByProps({role:'status'}).some(node=>node.children.join('').includes('could not be cancelled')),false,'failure text is not hidden in the page-level status behind the backdrop');
  assert.equal(requests.length,1);assert.equal(dialog.findAllByType('button').find(button=>button.props.children==='Retry cancellation').props.disabled,false);
  await act(()=>dialog.findAllByType('button').find(button=>button.props.children==='Keep appointment').props.onClick());
  assert.equal(tree.root.findAllByProps({role:'dialog'}).length,0);assert.equal(requests.length,1,'Keep closes without a second cancellation write');
  await act(()=>tree.unmount());
});

test('all-day appointment keeps date semantics and cancellation history stays out of active agenda',async()=>{let tree;const data={...snapshot,appointments:[{...appointment,id:'all-day',title:'Planning day',allDay:true,startsAt:null,endsAt:null,startDate:snapshot.today,endDate:'2026-10-23',timezone:'Europe/London',status:'tentative',relationship:null},{...appointment,id:'cancelled',title:'Cancelled call',status:'cancelled',cancelledAt:'2026-10-21T12:00:00Z'}]};await act(async()=>{tree=renderer.create(React.createElement(Diary,{organisationId:org,initial:data}));});assert.match(JSON.stringify(tree.root.findByProps({className:'diary-lanes diary-today'}).findAllByType('strong').map(n=>n.children.join(''))),/Planning day/);assert.doesNotMatch(JSON.stringify(tree.root.findByProps({className:'diary-lanes diary-today'}).findAllByType('strong').map(n=>n.children.join(''))),/Cancelled call/);assert.match(JSON.stringify(tree.toJSON()),/All day/);const summary=tree.root.findAllByType('summary').find(n=>n.children.join('').includes('Cancelled appointments'));assert.ok(summary);const cancelled=tree.root.findByProps({className:'diary-appointment diary-appointment-cancelled'});assert.equal(cancelled.findAllByType('button').length,0);await act(()=>tree.unmount());});

test('Add appointment form sends explicit values and refreshes without changing existing Ops items',async()=>{const requests=[];const created={...appointment,id:'new-apt',title:'Test call',relationship:null};const data={...snapshot,appointments:[created]};const deps={__fetch:async(url,init={})=>{requests.push([url,init]);if(init.method==='POST')return Response.json({success:true,appointment:created},{status:201});return Response.json(data);}};const FormDiary=load('app/dashboard/diary/Diary.tsx',{'@/lib/diary':model,'__fetch':deps.__fetch}).default;let tree;await act(async()=>{tree=renderer.create(React.createElement(FormDiary,{organisationId:org,initial:snapshot}));});await act(async()=>tree.root.findAllByType('button').find(b=>b.props.children==='+ Add appointment').props.onClick());const form=tree.root.findByType('form'),title=form.findAllByType('input').find(i=>i.props.value==='');await act(()=>title.props.onChange({target:{value:'Test call'}}));await act(async()=>form.props.onSubmit({preventDefault(){}}));assert.equal(requests[0][1].method,'POST');assert.match(requests[0][0],/api\/diary\/appointments/);assert.match(JSON.stringify(requests[0][1].body),/Test call/);assert.match(JSON.stringify(tree.toJSON()),/Test call/);assert.match(JSON.stringify(tree.toJSON()),/Controlled follow-up/);await act(()=>tree.unmount());});

test('Root appointment edit opens current values, PATCHes the displayed revision and shows the saved value after refresh',async()=>{
  const requests=[],data={...snapshot,appointments:[appointment]};let tree;
  const savedRow={id:appointment.id,title:'Auriel Wetherall rescheduled',organisation_id:org,owner_user_id:'owner-1',relationship_id:'rel-1',starts_at:'2026-10-22T15:00:00.000Z',ends_at:'2026-10-22T15:45:00.000Z',start_date:null,end_date:null,timezone:'Europe/London',all_day:false,location:'Root Health',meeting_url:null,notes:'Review opportunity',status:'confirmed',source:'relationship',revision:3,created_at:appointment.createdAt,updated_at:'2026-10-22T12:00:00Z',cancelled_at:null,google_calendar_sync_enabled:false,google_calendar_event_id:null,google_calendar_synced_at:null,google_calendar_sync_pending:false};
  const refreshed={...snapshot,appointments:[{...appointment,title:savedRow.title,startsAt:savedRow.starts_at,endsAt:savedRow.ends_at,revision:3,updatedAt:savedRow.updated_at}]};
  const fetcher=async(url,init={})=>{requests.push([url,init]);if(init.method==='PATCH')return Response.json({success:true,appointment:savedRow});return Response.json(refreshed);};
  const TestDiary=load('app/dashboard/diary/Diary.tsx',{'@/lib/diary':model,'__fetch':fetcher}).default;
  await act(async()=>{tree=renderer.create(React.createElement(TestDiary,{organisationId:org,initial:data}));});
  assert.ok(tree.root.findAllByType('button').some(button=>button.props.children==='Edit / reschedule'));
  await act(()=>tree.root.findAllByType('button').find(button=>button.props.children==='Edit / reschedule').props.onClick());
  const form=tree.root.findByType('form');assert.equal(form.props['aria-label'],'Edit appointment');
  assert.equal(form.findAllByType('input').find(input=>input.props.type==='date').props.value,'2026-10-22');
  assert.equal(form.findAllByType('input').find(input=>input.props.type==='time').props.value,'15:00');
  const title=form.findAllByType('input').find(input=>input.props.value===appointment.title);assert.ok(title);
  await act(()=>title.props.onChange({target:{value:savedRow.title}}));
  const time=form.findAllByType('input').find(input=>input.props.type==='time');await act(()=>time.props.onChange({target:{value:'16:00'}}));
  await act(async()=>form.props.onSubmit({preventDefault(){}}));
  const patch=requests.find(request=>request[1].method==='PATCH');assert.ok(patch);assert.match(patch[0],/api\/diary\/appointments\/apt-1\?organisationId=/);
  const body=JSON.parse(patch[1].body);assert.equal(body.revision,2);assert.equal(body.title,savedRow.title);assert.equal(body.startDate,'2026-10-22');assert.equal(body.startTime,'16:00');
  assert.ok(requests.some(request=>request[0].startsWith('/api/diary?')&&!request[1].method),'successful update refreshes canonical Diary data');
  assert.match(JSON.stringify(tree.toJSON()),/Auriel Wetherall rescheduled/);assert.match(JSON.stringify(tree.toJSON()),/16:00–16:45/);assert.match(JSON.stringify(tree.toJSON()),/Revision.{0,30}3/);
  await act(()=>tree.unmount());
});

test('mirrored Root appointment edit keeps its Google mirror enabled and submits the current revision',async()=>{
  const mirrored={...appointment,googleCalendarSyncEnabled:true,googleCalendarMirrored:true},requests=[],initial={...snapshot,appointments:[mirrored],googleCalendar:{connected:true,email:'david@example.com',unavailable:false}};let tree;
  const changed={...mirrored,title:'Updated mirrored call',revision:3};
  const fetcher=async(url,init={})=>{requests.push([url,init]);if(init.method==='PATCH')return Response.json({success:true,appointment:{...changed,google_calendar_sync_enabled:true,google_calendar_event_id:'google-mirror',revision:3}});return Response.json({...initial,appointments:[changed]});};
  const TestDiary=load('app/dashboard/diary/Diary.tsx',{'@/lib/diary':model,'__fetch':fetcher}).default;
  await act(async()=>{tree=renderer.create(React.createElement(TestDiary,{organisationId:org,initial}));});
  await act(()=>tree.root.findAllByType('button').find(button=>button.props.children==='Edit / reschedule').props.onClick());
  const form=tree.root.findByType('form'),sync=form.findAllByType('input').find(input=>input.props.type==='checkbox'&&input.props.checked);assert.ok(sync);assert.equal(sync.props.disabled,true);
  const title=form.findAllByType('input').find(input=>input.props.value===mirrored.title);await act(()=>title.props.onChange({target:{value:changed.title}}));
  await act(async()=>form.props.onSubmit({preventDefault(){}}));
  const patch=requests.find(request=>request[1].method==='PATCH');assert.equal(JSON.parse(patch[1].body).revision,2);assert.equal(JSON.parse(patch[1].body).syncToGoogle,true);assert.match(JSON.stringify(tree.toJSON()),/Updated mirrored call/);
  await act(()=>tree.unmount());
});

test('successful edit remains visible if the follow-up Diary refresh is temporarily unavailable',async()=>{
  const requests=[],data={...snapshot,appointments:[appointment]};let tree;
  const savedRow={id:appointment.id,title:'Saved despite refresh outage',organisation_id:org,owner_user_id:'owner-1',relationship_id:'rel-1',starts_at:'2026-10-22T15:00:00.000Z',ends_at:'2026-10-22T15:45:00.000Z',start_date:null,end_date:null,timezone:'Europe/London',all_day:false,location:'Root Health',meeting_url:null,notes:'Review opportunity',status:'confirmed',source:'relationship',revision:3,created_at:appointment.createdAt,updated_at:'2026-10-22T12:00:00Z',cancelled_at:null,google_calendar_sync_enabled:false,google_calendar_event_id:null,google_calendar_synced_at:null,google_calendar_sync_pending:false};
  const fetcher=async(url,init={})=>{requests.push([url,init]);if(init.method==='PATCH')return Response.json({success:true,appointment:savedRow});return Response.json({success:false,error:'Diary could not be loaded.'},{status:503});};
  const TestDiary=load('app/dashboard/diary/Diary.tsx',{'@/lib/diary':model,'__fetch':fetcher}).default;
  await act(async()=>{tree=renderer.create(React.createElement(TestDiary,{organisationId:org,initial:data}));});
  await act(()=>tree.root.findAllByType('button').find(button=>button.props.children==='Edit / reschedule').props.onClick());
  const form=tree.root.findByType('form'),title=form.findAllByType('input').find(input=>input.props.value===appointment.title);
  await act(()=>title.props.onChange({target:{value:savedRow.title}}));await act(async()=>form.props.onSubmit({preventDefault(){}}));
  assert.equal(requests.filter(request=>request[1].method==='PATCH').length,1);assert.ok(requests.some(request=>request[0].startsWith('/api/diary?')));
  assert.match(JSON.stringify(tree.toJSON()),/Saved despite refresh outage/);assert.match(JSON.stringify(tree.toJSON()),/Revision.{0,30}3/);
  assert.match(tree.root.findAllByProps({role:'status'}).map(node=>node.children.join('')).join(' '),/Diary could not refresh/);
  await act(()=>tree.unmount());
});

test('completed and cancelled Root appointments have no edit or cancel action',async()=>{
  const data={...snapshot,appointments:[{...appointment,id:'completed-apt',status:'completed'},{...appointment,id:'cancelled-apt',status:'cancelled'}]};let tree;
  await act(async()=>{tree=renderer.create(React.createElement(Diary,{organisationId:org,initial:data}));});
  const cards=tree.root.findAll(node=>node.props.className?.startsWith('diary-appointment diary-appointment-'));
  assert.equal(cards.length,2);for(const card of cards)assert.equal(card.findAllByType('button').filter(button=>button.props.children==='Edit / reschedule'||button.props.children==='Cancel appointment').length,0);
  await act(()=>tree.unmount());
});

test('cancellation dialog has compact mobile-sized actions and Diary source contains no native prompts',()=>{
  const source=fs.readFileSync('app/dashboard/diary/Diary.tsx','utf8'),css=fs.readFileSync('app/dashboard/diary/diary.css','utf8');
  assert.doesNotMatch(source,/window\.confirm|window\.alert|\balert\s*\(/);assert.match(source,/role="dialog" aria-modal="true" aria-labelledby="diary-cancel-title"/);
  assert.match(css,/\.diary-cancel-dialog/);assert.match(css,/min-height:44px/);assert.match(css,/max-width:480px/);assert.match(css,/grid-template-columns:1fr/);
});
test('relationship detail exposes appointment creation with exact workspace prefill',()=>{const file=fs.readFileSync('app/dashboard/growth/relationships/components/RelationshipDetail.tsx','utf8');assert.match(file,/Create appointment/);assert.match(file,/relationshipId:data\.workspace\.id/);assert.match(file,/relationshipSearch:r\.name/);});
