import {requireOrganisation} from "@/lib/tenantAuth";
import IdentityReview from "./IdentityReview";
export default async function ReviewPage({searchParams}:{searchParams:Promise<{organisationId?:string;locator?:string}>}) {
 const params=await searchParams,tenant=await requireOrganisation(params.organisationId,true);
 return <IdentityReview organisationId={tenant.organisationId} locator={params.locator||""}/>;
}
