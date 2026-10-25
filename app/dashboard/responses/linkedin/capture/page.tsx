import {requireOrganisation} from '@/lib/tenantAuth';
import {conversationSnapshot} from '@/lib/linkedinConversation.server';
import {readOutreachSelfIdentity} from '@/lib/outreachSelfIdentity.server';
import QuickCapture from './QuickCapture';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{organisationId?:string}>}){
 const params=await searchParams,tenant=await requireOrganisation(params.organisationId,false);
 const [state,self]=await Promise.all([conversationSnapshot(tenant.organisationId),readOutreachSelfIdentity(tenant.organisationId,tenant.userId)]);
 return <QuickCapture organisationId={tenant.organisationId} canWrite={['owner','admin','manager'].includes(tenant.role.toLowerCase())} selfNames={self.names.filter(Boolean)} contacts={state.contacts.map(c=>({id:c.contactId,identity:c.identity.slice(9),name:c.name||c.identity}))}/>;
}
