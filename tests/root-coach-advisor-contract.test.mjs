import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { load } from './root-advisor-helpers.mjs';
const advisor = load('lib/rootCoachAdvisor.ts'), policy = load('lib/rootCoachMailboxPolicy.ts'), signing = load('lib/rootCoachAppsScriptMailbox.server.ts');
const org = '78fa2ac8-e7b6-4b9b-9604-035723ece6b1', locator = 'inbox_5243a6ec-485e-43fd-86a7-3627aa07cf23';
const lookup = { organisationId: org, account: 'owner@roothealth.app', relationshipLocator: locator, operation: 'candidates', emails: ['person@example.org'], threadIds: [] };
const packet = { locator, canDraft: false, evidence: [{ id: 'notification:1', text: 'Reply notification only' }], limitations: ['No actual message text.'], asOf: 'now' };
test('request rejects client-supplied bodies, counts, identity and arbitrary thread selection', () => {
  const good = { organisationId: org, relationshipLocator: locator, question: 'Has she replied?', intent: 'assess_reply' };
  assert.equal(advisor.advisorRequest(good).checkLatestEmail, false);
  for (const key of ['email', 'conversation', 'founderAllowed', 'evidence', 'query', 'account']) assert.throws(() => advisor.advisorRequest({ ...good, [key]: 'untrusted' }));
  assert.throws(() => advisor.advisorRequest({ ...good, selectedThreadId: 'abcd' }));
});
test('notification-only evidence cannot authorise a draft; evidence citations are validated', () => {
  const raw = { facts: [{ text: 'A reply notification exists.', evidenceIds: ['notification:1'] }], interpretations: [], recommendations: [], commitments: [], draft: 'Invented reply' };
  assert.equal(advisor.validateAdvisorAnswer(raw, packet).draft, null);
  assert.throws(() => advisor.validateAdvisorAnswer({ ...raw, facts: [{ text: 'Other person', evidenceIds: ['foreign'] }] }, packet));
});
test('bounded context explicitly marks truncation and preserves exact retained text', () => {
  const result = advisor.boundAdvisorEvidence([{ id: 'a', text: 'abcdefgh', at: null }, { id: 'b', text: 'later', at: null }], 1, 4);
  assert.equal(result.partial, true); assert.equal(result.evidence[0].text, 'abcd'); assert.equal(result.evidence[0].truncated, true);
});
test('mailbox lookup rejects missing trusted identity and malformed query/address material', () => {
  assert.throws(() => policy.validateMailboxLookup({ ...lookup, emails: [] }));
  assert.throws(() => policy.validateMailboxLookup({ ...lookup, emails: ['example.org'] }));
  assert.throws(() => policy.validateMailboxLookup({ ...lookup, emails: ['person@example.org OR from:anyone'] }));
  assert.throws(() => policy.validateMailboxLookup({ ...lookup, operation: 'send' }));
});
test('participant guard excludes group mail, wrong recipient and direction mismatch', () => {
  const m = { senderEmail: 'person@example.org', recipientEmails: ['owner@roothealth.app'], direction: 'inbound' };
  assert.equal(policy.participantMatch(m, lookup.emails, [lookup.account]), true);
  assert.equal(policy.participantMatch({ ...m, recipientEmails: ['third@example.net'] }, lookup.emails, [lookup.account]), false);
  assert.equal(policy.participantMatch({ ...m, direction: 'outbound' }, lookup.emails, [lookup.account]), false);
});
function bridge() {
  const props = { ROOT_ADVISOR_MAILBOX_SIGNING_KEY: 'k'.repeat(40), ROOT_ADVISOR_MAILBOX_KEY_ID: 'key1', ROOT_ADVISOR_MAILBOX_ORGANISATION_ID: org, ROOT_ADVISOR_MAILBOX_ACCOUNT: lookup.account, ROOT_ADVISOR_MAILBOX_OWN_ADDRESSES: lookup.account }, calls = [];
  const ctx = { console, Date, PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k], getProperties: () => ({ ...props }), setProperty: (k,v) => { assert.ok(k.startsWith('ROOT_ADVISOR_NONCE_')); props[k] = v; }, deleteProperty: k => { assert.ok(k.startsWith('ROOT_ADVISOR_NONCE_')); delete props[k]; } }) }, LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) }, Utilities: { computeHmacSha256Signature: (s,k) => [...crypto.createHmac('sha256',k).update(s).digest()], base64DecodeWebSafe: s => Buffer.from(s,'base64url'), newBlob: b => ({ getDataAsString: () => b.toString() }) }, ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) }, Gmail: { Users: { getProfile: () => { calls.push('profile'); return { emailAddress: lookup.account }; }, Threads: { list: (_, options) => { calls.push(options); return { threads: [{ id: 'abcd' }, { id: 'bcde' }] }; }, get: (_, id) => { calls.push(id); return { messages: [{ id: id + '1', threadId: id, internalDate: Date.now(), payload: { headers: [{ name: 'From', value: 'person@example.org' }, { name: 'To', value: lookup.account }, { name: 'Subject', value: 'A real conversation' }], mimeType: 'text/plain', body: { data: Buffer.from('Exact real reply').toString('base64url') } } }] }; } } } } };
  props.OPS_GMAIL_REPLY_VERIFIED_IDENTITY = JSON.stringify({version:2,organisationId:org,account:lookup.account,ownAddresses:[lookup.account]});
  vm.createContext(ctx); vm.runInContext(fs.readFileSync('docs/root-advisor-mailbox-adapter.gs','utf8'), ctx);
  const envelope = (changes = {}, at = Date.now()) => signing.signMailboxRequest({ ...lookup, ...changes }, props.ROOT_ADVISOR_MAILBOX_SIGNING_KEY, 'key1', at);
  return { calls, ctx, envelope, run: e => ctx.rootAdvisorMailboxPost_({ postData: { type: 'application/json', contents: JSON.stringify(e) } }) };
}
for (const kind of ['bad signature', 'expired', 'wrong tenant', 'wrong account', 'arbitrary function', 'arbitrary query']) test(`bridge rejects ${kind} before ANY Gmail call`, () => {
  const b = bridge(); let e = b.envelope();
  if (kind === 'bad signature') e.signature = '0'.repeat(64);
  if (kind === 'expired') e = b.envelope({}, Date.now() - 60000);
  if (kind === 'wrong tenant') e = b.envelope({ organisationId: 'foreign' });
  if (kind === 'wrong account') e = b.envelope({ account: 'foreign@example.org' });
  if (kind === 'arbitrary function' || kind === 'arbitrary query') { const p = JSON.parse(e.payload); p.lookup[kind === 'arbitrary function' ? 'function' : 'query'] = 'sendEverything'; e.payload = JSON.stringify(p); e.signature = crypto.createHmac('sha256','k'.repeat(40)).update(e.payload).digest('hex'); }
  assert.equal(b.run(e).ok, false); assert.equal(b.calls.length, 0);
});
test('bridge returns bounded independent candidates and rejects replay before Gmail', () => {
  const b = bridge(), e = b.envelope(), result = b.run(e);
  assert.equal(result.ok, true); assert.equal(result.candidates.length, 2); assert.equal(result.messages.length, 0);
  const n = b.calls.length; assert.equal(b.run(e).ok, false); assert.equal(b.calls.length, n);
  assert.ok(b.calls.some(v => typeof v === 'object' && v.q.includes('from:"person@example.org"')));
});
test('selected thread returns exact message and known thread refs never widen search', () => {
  const b = bridge(), result = b.run(b.envelope({ operation: 'thread', selectedThreadId: 'abcd', threadIds: ['abcd'] }));
  assert.equal(result.messages[0].text, 'Exact real reply'); assert.equal(result.messages[0].gmailThreadId, 'abcd');
  assert.equal(b.calls.some(v => typeof v === 'object'), false);
});
test('GET/malformed envelopes fail closed and no mutation or intake call is present', () => {
  const b = bridge(); assert.equal(b.ctx.rootAdvisorMailboxPost_({}).ok, false); assert.equal(b.calls.length, 0);
  const source = fs.readFileSync('docs/root-advisor-mailbox-adapter.gs','utf8');
  assert.doesNotMatch(source, /GmailApp\.|\.send\(|\.modify\(|\.trash\(|\.delete\(|\.insert\(|\.drafts\.|Logger\.|console\.|runOpsGmail|handlePhase4D|UrlFetchApp/);
});
test('bridge with unexpected participants withholds both candidate subject and message body', () => {
  const b = bridge();b.ctx.Gmail.Users.Threads.get=(_,id)=>({messages:[{id:id+'1',threadId:id,internalDate:Date.now(),payload:{headers:[{name:'From',value:'stranger@example.net'},{name:'To',value:lookup.account},{name:'Subject',value:'Protected subject'}]}}]});
  const result=b.run(b.envelope());assert.equal(result.ok,true);assert.equal(result.candidates.length,0);assert.equal(result.messages.length,0);assert.equal(result.partial,true);
});
test('bridge limits candidate pages and exposes partial coverage rather than claiming exhaustive search',()=>{
  const b=bridge();b.ctx.Gmail.Users.Threads.list=()=>({threads:['a','b','c','d','e','f'].map(id=>({id})),nextPageToken:'more'});
  const result=b.run(b.envelope());assert.equal(result.candidates.length,5);assert.equal(result.partial,true);
});
test('absent mailbox configuration fails closed without network access', async () => {
  const mailbox = load('lib/rootCoachMailbox.server.ts', {}, { process: { env: {} }, fetch: () => assert.fail('network') });
  await assert.rejects(mailbox.lookupRelationshipMailbox({ ...lookup }, 'operator'), /not activated/);
});
test('Guide server/API, legacy Coach and Day 0 implementation are byte-for-byte unchanged', () => {
  for (const file of ['lib/rootCoachGuide.ts','lib/rootCoachGuide.server.ts','app/api/coach/route.ts','app/api/ai/root-coach/route.ts','lib/linkedinDayZero.ts','lib/responseContactContext.ts','lib/linkedinOutreach.ts']) assert.equal(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'),execFileSync('git',['show',`f7420f6:${file}`],{encoding:'utf8'}).replaceAll('\r\n','\n'));
});

test('recording time cannot substantiate a dated fact about an undated snapshot',()=>{const {validateAdvisorAnswer}=load('lib/rootCoachAdvisor.ts');const packet={locator:'existing',evidence:[{id:'snapshot',direction:'snapshot',at:null,recordedAt:'2026-10-15',text:'Exact undated message',kind:'Snapshot'}],limitations:[],canDraft:false};const raw={facts:[{text:'They exchanged messages on 2026-10-15.',evidenceIds:['snapshot']},{text:'An undated message is recorded.',evidenceIds:['snapshot']}],interpretations:[],recommendations:[],commitments:[],draft:null,limitations:[]};const answer=validateAdvisorAnswer(raw,packet);assert.equal(answer.facts.length,1);assert.match(answer.facts[0].text,/Undated stored snapshot/);assert.match(answer.limitations.join(' '),/dated factual claim was withheld/);});

test('Advisor and Founder source files are strict UTF-8 for the Preview compiler',()=>{for(const file of ['lib/rootCoachAdvisor.ts','lib/rootCoachAdvisor.server.ts','lib/rootCoachAdvisorContext.server.ts','lib/rootCoachMailbox.server.ts','lib/rootCoachMailboxPolicy.ts','lib/rootCoachAppsScriptMailbox.server.ts','app/api/coach/advisor/route.ts','app/dashboard/components/RootCoachAdvisor.tsx','app/dashboard/founder-intelligence/FounderResearchSummary.tsx','docs/root-advisor-mailbox-adapter.gs'])assert.doesNotThrow(()=>new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(file)),file);});

test('coverage is server-owned and incomplete history cannot imply absent replies or verified delivery',()=>{const packet={locator:'existing',evidence:[{id:'note',kind:'Manually recorded emailed',text:'Exact manual history',at:null}],limitations:['Current mailbox has not been checked.'],canDraft:false};const answer=advisor.validateAdvisorAnswer({facts:[{text:'A manual record exists.',evidenceIds:['note']}],interpretations:[{text:'The absence of replies suggests inactivity.',evidenceIds:['note']}],recommendations:[],commitments:[],draft:null,limitations:['Only email evidence is verified for delivery.']},packet);assert.equal(answer.interpretations.length,0);assert.match(answer.facts[0].text,/Manual record/);assert.match(answer.limitations.join(' '),/Current mailbox has not been checked/);assert.doesNotMatch(answer.limitations.join(' '),/Only email evidence/);assert.match(answer.limitations.join(' '),/unsupported claim/);});
