import {supabaseAdmin} from './supabaseAdmin';
import type {RelationshipTenant} from './relationshipWorkspace.server';
import {practiceFacts,type MeetingFact} from './meetingCoaching';
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
export async function readMeetingFacts(t:RelationshipTenant,context:Record<string,unknown>):Promise<MeetingFact[]>{
 if(context.synthetic===true)return practiceFacts;
 const refs=Array.isArray(context.refs)?context.refs.map(object):[],facts:MeetingFact[]=[];
 // Only exact server-selected session refs; tenant membership is checked by the route.
 for(const ref of refs.slice(0,8)){if(!['inbox_items','growth_targets','acquisition_items'].includes(String(ref.table))||typeof ref.id!=='string')continue;const {data,error}=await supabaseAdmin.from(String(ref.table)).select('*').eq('organisation_id',t.organisationId).eq('id',ref.id).maybeSingle();if(error)throw Error('Meeting context is temporarily unavailable.');if(data){const fields=['role','role_title','company','organisation_name','headline'].flatMap(key=>typeof data[key]==='string'&&data[key].trim()?[key+': '+data[key].slice(0,250)]:[]);if(fields.length)facts.push({id:'context:'+ref.table+':'+ref.id,kind:'recorded',text:fields.join('; ')});}}
 let founder=false;if(t.role==='owner'){const r=await supabaseAdmin.rpc('founder_authorization_allowed',{p_org:t.organisationId,p_actor:t.userId});founder=!r.error&&r.data===true;}
 if(typeof context.workspaceId==='string'){
  const {data:workspace,error}=await supabaseAdmin.from('relationship_workspaces').select('id,founder_only').eq('organisation_id',t.organisationId).eq('id',context.workspaceId).maybeSingle();if(error)throw Error('Meeting context is temporarily unavailable.');
  if(workspace&&(!workspace.founder_only||founder)){let query=supabaseAdmin.from('relationship_activity_events').select('id,message,note_type,recorded_at,founder_only').eq('organisation_id',t.organisationId).eq('workspace_id',workspace.id);if(!founder)query=query.eq('founder_only',false);const notes=await query.order('recorded_at',{ascending:false}).limit(4);if(notes.error)throw Error('Meeting context is temporarily unavailable.');for(const row of notes.data||[])if(typeof row.message==='string')facts.push({id:'note:'+row.id,kind:'user_note',at:row.recorded_at,text:'User-recorded observation (not independently verified): '+row.message.slice(0,700)});
   if(founder){const research=await supabaseAdmin.from('founder_research_records').select('id,research_snapshot').eq('organisation_id',t.organisationId).eq('linked_relationship_workspace_id',workspace.id).eq('saved',true).limit(4);if(research.error)throw Error('Meeting research is temporarily unavailable.');for(const row of research.data||[]){const saved=object(object(row.research_snapshot).phase2d),sources=Array.isArray(saved.sourceRefs)?saved.sourceRefs.map(object):[];if(saved.verification==='matched_public'&&sources.length&&sources.every(r=>refs.some(ref=>ref.table===r.table&&ref.id===r.id)))facts.push({id:'research:'+row.id,kind:'approved_public',text:'Approved historical public research, not current intent: '+JSON.stringify(saved).slice(0,1600)});}}
  }
 }
 return facts.slice(0,16);
}

// Display identity only, never authorization. No email or other Auth fields reach the writer.
export async function readMeetingSender(t:RelationshipTenant):Promise<string>{
 const {data,error}=await supabaseAdmin.auth.admin.getUserById(t.userId);
 if(error||data.user?.id!==t.userId)return '';
 const metadata=object(data.user.user_metadata);
 const name=[metadata.full_name,metadata.name,metadata.display_name].find(v=>typeof v==='string'&&v.trim());
 return typeof name==='string'&&/^[\p{L}][\p{L} .’'-]{0,79}$/u.test(name.trim())?name.trim().split(/\s+/)[0]:'';
}
