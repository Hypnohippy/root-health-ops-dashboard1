import type {readOperationalCollection} from './operationalIntelligence.server';
import {lifecycleLinkedInIdentity} from './contactLifecycle';
import {conversationDiaryItem,type AppointmentConversation} from './diaryConversation';
type Collection=Awaited<ReturnType<typeof readOperationalCollection>>;
/** Consume only the existing canonical, tenant-authorized conversation read. No identity discovery. */
export function canonicalDiaryConversations(collection:Collection){
 const conversations:AppointmentConversation[]=[],emailThreads=new Set<string>();
 const org=collection.organisationId;
 for(const record of collection.records){
  if(record.intelligence.identity.humanReviewRequired)continue;
  const relationship=record.relationship,identities=new Set(record.sourceDetails.flatMap(s=>[s.fields.linkedin_identity,s.fields.linkedin_url].map(lifecycleLinkedInIdentity).filter((v):v is string=>!!v)));
  if(relationship.contactId)try{const [tenant,key]=JSON.parse(relationship.contactId);if(tenant===org&&typeof key==='string'&&key.startsWith('linkedin:')){const id=lifecycleLinkedInIdentity(key.slice(9));if(id)identities.add(id);}}catch{/* No inferred identity fallback. */}
  const groups=new Map<string,AppointmentConversation>();
  for(const message of [...record.conversation.dated,...record.conversation.undated]){
   if(message.direction==='snapshot')continue;
   let provider:'linkedin'|'email',identity:string,sourceId:string;
   if(message.id.startsWith('linkedin:')&&message.channel==='LinkedIn'&&identities.size===1){provider='linkedin';identity=[...identities][0];sourceId=identity;}
   else if(message.id.startsWith('gmail:')&&message.channel==='Email'){
    const match=message.source.match(/^Gmail thread (.+); message (.+)$/);if(!match||message.id!==`gmail:${match[2]}`)continue;
    provider='email';identity=match[1];sourceId=match[1];emailThreads.add(sourceId);
   }else continue; // No quoted source snapshots, inferred sends, or pasted multi-speaker history.
   const key=JSON.stringify([provider,identity,sourceId]);
   if(!groups.has(key))groups.set(key,{organisationId:org,relationshipId:relationship.contactId||relationship.locator,identity,sourceId,provider,name:relationship.name,company:relationship.company,href:`/dashboard/growth/relationships/${relationship.locator}?organisationId=${encodeURIComponent(org)}`,messages:[]});
   groups.get(key)!.messages.push({id:message.id,at:message.at,direction:message.direction||'',text:message.text});
  }
  conversations.push(...groups.values());
 }
 // A thread exposed under two different canonical relationships is ambiguous, not permission to join them.
 const owners=new Map<string,Set<string>>();
 for(const c of conversations){const key=JSON.stringify([c.provider,c.identity,c.sourceId]);if(!owners.has(key))owners.set(key,new Set());owners.get(key)!.add(c.relationshipId);}
 const safe=conversations.filter(c=>owners.get(JSON.stringify([c.provider,c.identity,c.sourceId]))!.size===1);
 return {conversations:safe,emailThreads,items:safe.flatMap(c=>{const item=conversationDiaryItem(c,org);return item?[item]:[];})};
}
