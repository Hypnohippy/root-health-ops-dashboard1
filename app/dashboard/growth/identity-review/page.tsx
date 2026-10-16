import { requireOrganisation } from "@/lib/tenantAuth";
import { readIdentityReview,identityReviewPayload } from "@/lib/relationshipIdentityReconciliation.server";
import IdentityReview from "./IdentityReview";
import "./identity-review.css";
export const dynamic="force-dynamic";
export default async function IdentityReviewPage({searchParams}:{searchParams:Promise<{organisationId?:string;example?:string}>}) {
 const p=await searchParams,tenant=await requireOrganisation(p.organisationId,false);
 return <IdentityReview organisationId={tenant.organisationId} initial={identityReviewPayload(await readIdentityReview(tenant,undefined,p.example==='synthetic'))}/>;
}
