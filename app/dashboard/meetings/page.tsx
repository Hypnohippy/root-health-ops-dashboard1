import {requireOrganisation} from '@/lib/tenantAuth';
import MeetingCopilot from './MeetingCopilot';
export const dynamic='force-dynamic';
export default async function MeetingPage({searchParams}:{searchParams:Promise<{organisationId?:string;appointmentId?:string}>}){const p=await searchParams,t=await requireOrganisation(p.organisationId,false);return <MeetingCopilot organisationId={t.organisationId} appointmentId={p.appointmentId||''}/>;}
